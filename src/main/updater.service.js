/**
 * src/main/updater.service.js
 * Modular Periodic Auto-Updater Service
 *
 * Implements:
 * - Explicit, validated Update State Machine
 * - Decoupled update checking and background silent downloading
 * - Fixed false isDownloading bug on update-available
 * - Elimination of intrusive native confirmation dialogs
 * - Master vs Branch edition & channel isolation
 * - Cryptographic policy and package integrity verification
 * - Safe Operation Drain Coordinator integration for graceful zero-interruption updates
 * - Jittered scheduling and bounded exponential backoff
 */

const { EventEmitter } = require('events');
const { UpdateStateMachine } = require('./update-state-machine');
const {
  validatePolicyContract,
  verifyPolicySignature,
  verifyFileSha512,
} = require('./security/update-policy.verifier');
const { DEFAULT_UPDATE_PUBLIC_KEY_PEM } = require('./security/public-keys');

class AutoUpdateManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Lazily resolve electron components or use injected mocks
    let defaultUpdater = null;
    let defaultApp = null;
    let defaultDialog = null;

    try {
      const electron = require('electron');
      defaultApp = electron.app;
      defaultDialog = electron.dialog;
      const electronUpdater = require('electron-updater');
      defaultUpdater = electronUpdater.autoUpdater;
    } catch {
      // In standalone test or non-electron runner
    }

    this.updater = options.updater || defaultUpdater;
    this.app = options.app || defaultApp;
    this.dialog = options.dialog || defaultDialog;
    this.serverSupervisor = options.serverSupervisor || null;
    this.log = options.log || console.log;

    const isPackagedDefault = this.app && this.app.isPackaged !== undefined ? this.app.isPackaged : false;
    this.isPackaged = options.isPackaged !== undefined ? options.isPackaged : isPackagedDefault;

    // Edition & Channel Configuration (Strict Isolation)
    const envMode = process.env.APP_MODE === 'branch' ? 'branch' : 'master';
    this.edition = (options.edition || envMode).toLowerCase();
    this.appId = options.appId || (this.edition === 'branch' ? 'com.bebyoon.branch.system' : 'com.bebyoon.system');
    this.channel = options.channel || (this.edition === 'branch' ? 'branch' : 'latest');
    let defaultVer = '1.1.1';
    try { defaultVer = require('../../package.json').version || '1.1.1'; } catch (_) {}
    this.currentVersion = options.currentVersion || (this.app?.getVersion ? this.app.getVersion() : defaultVer);
    this.publicKeyPem = options.publicKeyPem || DEFAULT_UPDATE_PUBLIC_KEY_PEM;

    // Timing Configuration
    const envIntervalMin = parseInt(process.env.UPDATE_CHECK_INTERVAL_MINUTES, 10);
    const defaultIntervalMin = !isNaN(envIntervalMin) && envIntervalMin >= 5 ? envIntervalMin : 20;

    this.checkIntervalMs = (options.checkIntervalMinutes || defaultIntervalMin) * 60 * 1000;
    this.minIntervalMs = 5 * 60 * 1000; // Enforce minimum 5 minutes
    if (this.checkIntervalMs < this.minIntervalMs) {
      this.checkIntervalMs = this.minIntervalMs;
    }

    this.initialDelayMs = options.initialDelayMs !== undefined ? options.initialDelayMs : 25 * 1000; // 25s startup delay
    this.maxJitterMs = options.maxJitterMs !== undefined ? options.maxJitterMs : 5 * 60 * 1000; // ±5 min jitter (300,000 ms)

    // Bounded backoff settings
    this.baseBackoffMs = 5 * 60 * 1000;
    this.maxBackoffMs = 120 * 60 * 1000; // 120 minutes max backoff (7,200,000 ms)
    this.autoDownload = options.autoDownload !== undefined ? Boolean(options.autoDownload) : false;

    // State Tracking via Validated State Machine
    this.stateMachine = new UpdateStateMachine({
      log: this.log,
      initialState: 'idle',
    });

    this.timer = null;
    this.isChecking = false;
    this.isDownloading = false;
    this.updateDownloaded = false;
    this.consecutiveFailures = 0;
    this.listenersAttached = false;
    this.isStopped = false;
    this.lastCheckTime = null;
    this.lastCheckStatus = 'idle';
    this.availableUpdateInfo = null;
    this.downloadedFilePath = null;
    this.activePolicy = null;
    this.autoInstallTimer = null;
  }

  init() {
    if (!this.isPackaged) {
      this.log('[UPDATER] Skipped: application is running in unpackaged/development mode.');
      return;
    }

    if (!this.updater) {
      this.log('[UPDATER] Warning: No updater instance available.');
      return;
    }

    // Configure updater channel for edition isolation
    if (this.updater) {
      this.updater.channel = this.channel;
    }

    this.attachEventListeners();
    this.scheduleNextCheck(this.initialDelayMs);
  }

  attachEventListeners() {
    if (this.listenersAttached || !this.updater) return;
    this.listenersAttached = true;

    // Decouple check from binary download per Requirement R5 & Section 10
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;

    this._onChecking = () => {
      this.isChecking = true;
      this.lastCheckStatus = 'checking';
      if (this.stateMachine.canTransitionTo('checking')) {
        this.stateMachine.transition('checking');
      }
      this.log(`[UPDATER] Checking for updates on channel '${this.channel}' (Edition: ${this.edition})...`);
      this.emit('status', 'updater:checking');
    };

    this._onAvailable = (info) => {
      this.isChecking = false;
      this.isDownloading = false;
      this.lastCheckStatus = 'available';
      this.availableUpdateInfo = info;

      const ver = info && info.version ? info.version : 'unknown';
      this.log(`[UPDATER] Update available: ${ver} for edition ${this.edition}.`);

      // Verify edition contract if metadata contains edition/appId
      if (info && info.edition && info.edition.toLowerCase() !== this.edition.toLowerCase()) {
        const mismatchMsg = `Cross-edition update rejected: downloaded info is for '${info.edition}', but running edition is '${this.edition}'.`;
        this.log(`[UPDATER] REJECTED: ${mismatchMsg}`);
        this.stateMachine.transition('failed', { error: mismatchMsg });
        this.emit('status', 'updater:error', { error: mismatchMsg });
        return;
      }

      if (this.stateMachine.canTransitionTo('update-available')) {
        this.stateMachine.transition('update-available', { version: ver, info });
      }
      this.emit('status', 'updater:available', info);

      if (this.autoDownload) {
        setImmediate(() => {
          if (!this.isStopped && !this.isDownloading && this.stateMachine.getState() === 'update-available') {
            this.downloadUpdate().catch((err) => {
              this.log(`[UPDATER] Auto-download failed: ${err.message}`);
            });
          }
        });
      }
    };

    this._onNotAvailable = (info) => {
      this.isChecking = false;
      this.isDownloading = false;
      this.lastCheckStatus = 'up-to-date';
      const ver = info && info.version ? info.version : 'current';
      this.log(`[UPDATER] Application is up-to-date. Current release: ${ver}`);
      if (this.stateMachine.canTransitionTo('up-to-date')) {
        this.stateMachine.transition('up-to-date', { version: ver });
        // Automatically settle to idle
        if (this.stateMachine.canTransitionTo('idle')) {
          this.stateMachine.transition('idle');
        }
      }
      this.emit('status', 'updater:not-available', info);
    };

    this._onProgress = (progress) => {
      const pct = progress && progress.percent ? Math.round(progress.percent) : 0;
      this.log(`[UPDATER] Background download progress: ${pct}%`);
      this.stateMachine.context.progress = pct;
      this.emit('status', 'updater:progress', progress);
    };

    this._onDownloaded = async (info) => {
      this.isDownloading = false;
      this.updateDownloaded = true;
      this.lastCheckStatus = 'downloaded';
      const ver = info && info.version ? info.version : 'new';
      this.log(`[UPDATER] Update downloaded silently: version ${ver}`);

      if (info?.downloadedFile) {
        this.downloadedFilePath = info.downloadedFile;
      }

      if (this.stateMachine.canTransitionTo('downloaded')) {
        this.stateMachine.transition('downloaded', { version: ver, info });
      }

      // Transition to waiting-for-safe-point
      if (this.stateMachine.canTransitionTo('waiting-for-safe-point')) {
        this.stateMachine.transition('waiting-for-safe-point', { version: ver });
      }

      // Notify renderer without intrusive native dialog
      this.emit('status', 'updater:downloaded', info);
      this.emit('status', 'updater:waiting-for-safe-point', { version: ver });

      // AUTOMATIC AUTONOMOUS INSTALL:
      // Schedule automatic safe install after 6 seconds grace period
      if (this.autoInstallTimer) {
        clearTimeout(this.autoInstallTimer);
      }
      this.autoInstallTimer = setTimeout(async () => {
        if (!this.isStopped && this.updateDownloaded && this.stateMachine.getState() === 'waiting-for-safe-point') {
          this.log('[UPDATER] Grace window elapsed. Automatically executing safe installation...');
          try {
            await this.executeSafeInstall({ timeoutMs: 15000 });
          } catch (e) {
            this.log(`[UPDATER] Automatic safe install error: ${e.message}`);
          }
        }
      }, 6000);
    };

    this._onError = (err) => {
      this.isChecking = false;
      this.isDownloading = false;
      this.lastCheckStatus = 'error';
      const safeMsg = this.sanitizeErrorMessage(err ? err.message : 'Unknown error');
      this.log(`[UPDATER] Update error: ${safeMsg}`);

      if (this.stateMachine.canTransitionTo('failed')) {
        this.stateMachine.transition('failed', { error: safeMsg });
      } else {
        this.stateMachine.reset('error_recovery');
      }

      this.emit('status', 'updater:error', { error: safeMsg });
    };

    this.updater.on('checking-for-update', this._onChecking);
    this.updater.on('update-available', this._onAvailable);
    this.updater.on('update-not-available', this._onNotAvailable);
    this.updater.on('download-progress', this._onProgress);
    this.updater.on('update-downloaded', this._onDownloaded);
    this.updater.on('error', this._onError);
  }

  sanitizeErrorMessage(msg) {
    if (typeof msg !== 'string') return '';
    return msg
      .replace(/token=[a-zA-Z0-9_\-]+/gi, 'token=[REDACTED]')
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .replace(/ghp_[a-zA-Z0-9]+/gi, '[REDACTED_GH_TOKEN]');
  }

  scheduleNextCheck(customDelayMs = null) {
    if (this.isStopped) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    let delayMs = customDelayMs;
    if (delayMs === null) {
      if (this.consecutiveFailures > 0) {
        // Bounded exponential backoff: baseline doubles each failure (40m, 80m, 120m) up to 120 min max
        const backoffMultiplier = Math.pow(2, this.consecutiveFailures);
        delayMs = Math.min(this.maxBackoffMs, this.checkIntervalMs * backoffMultiplier);
      } else {
        // Regular interval + symmetric random jitter (±5 min / ±300,000 ms, range [15m, 25m])
        const jitter = Math.floor(Math.random() * (this.maxJitterMs * 2 + 1)) - this.maxJitterMs;
        delayMs = Math.max(this.minIntervalMs, this.checkIntervalMs + jitter);
      }
    }

    const minutesFormatted = (delayMs / 60000).toFixed(1);
    this.log(`[UPDATER] Next background check scheduled in ${minutesFormatted} minutes.`);

    this.timer = setTimeout(() => {
      this.performCheck();
    }, delayMs);
  }

  async performCheck() {
    if (this.isStopped) return;

    if (this.isChecking) {
      this.log('[UPDATER] Check skipped: update check already in progress.');
      return;
    }
    if (this.isDownloading) {
      this.log('[UPDATER] Check skipped: update package currently downloading.');
      this.scheduleNextCheck();
      return;
    }

    this.isChecking = true;
    this.lastCheckTime = new Date().toISOString();

    try {
      this.log(`[UPDATER] Executing periodic background check on channel '${this.channel}'...`);
      if (this.updater && typeof this.updater.checkForUpdates === 'function') {
        await this.updater.checkForUpdates();
      }
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      const safeMsg = this.sanitizeErrorMessage(err ? err.message : 'Unknown check error');
      this.log(`[UPDATER] Check failed (attempt ${this.consecutiveFailures}): ${safeMsg}`);
    } finally {
      this.isChecking = false;
      this.scheduleNextCheck();
    }
  }

  async downloadUpdate() {
    if (this.isDownloading) {
      return { status: 'already_downloading' };
    }

    if (this.updater && typeof this.updater.downloadUpdate === 'function') {
      this.isDownloading = true;
      if (this.stateMachine.canTransitionTo('downloading')) {
        this.stateMachine.transition('downloading');
      }
      this.emit('status', 'updater:downloading');

      try {
        const res = await this.updater.downloadUpdate();
        return res;
      } catch (err) {
        this.isDownloading = false;
        if (this.stateMachine.canTransitionTo('failed')) {
          this.stateMachine.transition('failed', { error: err.message });
        }
        throw err;
      }
    }
    return { status: 'no_updater' };
  }

  /**
   * Verify an authenticated update policy and package digest before installation
   */
  async verifyUpdateAuthenticity(policyData, signatureBase64, downloadedFilePath = null) {
    if (!policyData) {
      return { verified: false, error: 'no_policy_provided' };
    }

    // 1. Verify digital signature
    const sigResult = verifyPolicySignature(policyData, signatureBase64, this.publicKeyPem);
    if (!sigResult.valid) {
      this.log(`[UPDATER] Signature verification failed: ${sigResult.error}`);
      return { verified: false, error: sigResult.error };
    }

    // 2. Validate contract against running edition and channel
    const contractResult = validatePolicyContract(policyData, {
      expectedAppId: this.appId,
      expectedEdition: this.edition,
      expectedChannel: this.channel,
      currentVersion: this.currentVersion,
    });
    if (!contractResult.valid) {
      this.log(`[UPDATER] Policy contract validation failed: ${contractResult.error}`);
      return { verified: false, error: contractResult.error };
    }

    // 3. Verify SHA-512 digest of the downloaded file if available
    const targetFile = downloadedFilePath || this.downloadedFilePath;
    if (targetFile) {
      const digestResult = await verifyFileSha512(targetFile, policyData.artifactDigest);
      if (!digestResult.valid) {
        this.log(`[UPDATER] Artifact SHA-512 mismatch: ${digestResult.error}`);
        return { verified: false, error: digestResult.error };
      }
    }

    this.activePolicy = policyData;
    this.log(`[UPDATER] Update authenticity verified successfully for ${policyData.edition} v${policyData.version}.`);
    return { verified: true, error: null, policy: policyData };
  }

  /**
   * Safe graceful installation flow with Operation Drain Coordinator
   */
  async executeSafeInstall(options = {}) {
    const {
      timeoutMs = 45000,
      isCritical = false,
      reason = 'Scheduled update installation',
    } = options;

    this.log(`[UPDATER] Starting safe installation procedure (Critical: ${isCritical}, Timeout: ${timeoutMs}ms)...`);

    // 1. Prepare maintenance
    if (this.stateMachine.canTransitionTo('preparing-maintenance')) {
      this.stateMachine.transition('preparing-maintenance', { reason });
    }
    this.emit('status', 'updater:preparing-maintenance', { isCritical, reason });

    // 2. Drain active business operations
    if (this.stateMachine.canTransitionTo('draining-operations')) {
      this.stateMachine.transition('draining-operations');
    }
    this.emit('status', 'updater:draining-operations');

    if (this.serverSupervisor && typeof this.serverSupervisor.drainAndStop === 'function') {
      const drainRes = await this.serverSupervisor.drainAndStop(timeoutMs);
      if (!drainRes.success) {
        this.log(`[UPDATER] Safe drain could not complete: ${drainRes.reason}. Suspending installation.`);
        if (this.stateMachine.canTransitionTo('waiting-for-safe-point')) {
          this.stateMachine.transition('waiting-for-safe-point', { reason: 'drain_timeout' });
        }
        this.emit('status', 'updater:drain-timeout', drainRes);
        return { success: false, reason: drainRes.reason, details: drainRes.details };
      }
    }

    // 3. Stop remaining local services cleanly
    if (this.stateMachine.canTransitionTo('stopping-services')) {
      this.stateMachine.transition('stopping-services');
    }
    this.emit('status', 'updater:stopping-services');

    // 4. Installing
    if (this.stateMachine.canTransitionTo('installing')) {
      this.stateMachine.transition('installing');
    }
    this.emit('status', 'updater:installing');

    // Launch NSIS installer (silent = false, isForceRunAfter = true)
    this.quitAndInstall();
    return { success: true };
  }

  quitAndInstall() {
    if (this.autoInstallTimer) {
      clearTimeout(this.autoInstallTimer);
      this.autoInstallTimer = null;
    }
    if (this.serverSupervisor && typeof this.serverSupervisor.stop === 'function') {
      try { this.serverSupervisor.stop(); } catch {}
    }
    if (this.updater && typeof this.updater.quitAndInstall === 'function') {
      this.log('[UPDATER] Invoking updater.quitAndInstall()...');
      this.updater.quitAndInstall(false, true);
    }
  }

  stop() {
    this.isStopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.autoInstallTimer) {
      clearTimeout(this.autoInstallTimer);
      this.autoInstallTimer = null;
    }
    this.log('[UPDATER] Periodic update checker stopped cleanly.');
  }

  destroy() {
    this.stop();
    if (this.updater && typeof this.updater.removeListener === 'function') {
      if (this._onChecking) this.updater.removeListener('checking-for-update', this._onChecking);
      if (this._onAvailable) this.updater.removeListener('update-available', this._onAvailable);
      if (this._onNotAvailable) this.updater.removeListener('update-not-available', this._onNotAvailable);
      if (this._onProgress) this.updater.removeListener('download-progress', this._onProgress);
      if (this._onDownloaded) this.updater.removeListener('update-downloaded', this._onDownloaded);
      if (this._onError) this.updater.removeListener('error', this._onError);
    }
    this.listenersAttached = false;
    this.stateMachine.reset('destroyed');
    this.removeAllListeners();
  }

  getStatus() {
    return {
      isChecking: this.isChecking,
      isDownloading: this.isDownloading,
      updateDownloaded: this.updateDownloaded,
      consecutiveFailures: this.consecutiveFailures,
      lastCheckTime: this.lastCheckTime,
      lastCheckStatus: this.lastCheckStatus,
      checkIntervalMs: this.checkIntervalMs,
      edition: this.edition,
      appId: this.appId,
      channel: this.channel,
      state: this.stateMachine.getState(),
      context: this.stateMachine.getContext(),
    };
  }
}

let defaultManager = null;

function setupAutoUpdater(options = {}) {
  if (!defaultManager) {
    defaultManager = new AutoUpdateManager(options);
    defaultManager.init();
  }
  return defaultManager;
}

function initAutoUpdater(options = {}) {
  return setupAutoUpdater(options);
}

function stopAutoUpdater() {
  if (defaultManager) {
    defaultManager.stop();
  }
}

function destroy() {
  if (defaultManager) {
    defaultManager.destroy();
  }
}

function checkForUpdates() {
  if (defaultManager) {
    return defaultManager.performCheck();
  }
  return Promise.resolve();
}

function downloadUpdate() {
  if (defaultManager) {
    return defaultManager.downloadUpdate();
  }
  return Promise.resolve();
}

function quitAndInstall() {
  if (defaultManager) {
    defaultManager.quitAndInstall();
  }
}

function executeSafeInstall(options = {}) {
  if (defaultManager) {
    return defaultManager.executeSafeInstall(options);
  }
  return Promise.resolve({ success: false, reason: 'uninitialized' });
}

function getStatus() {
  if (defaultManager) {
    return defaultManager.getStatus();
  }
  return { lastCheckStatus: 'uninitialized', state: 'idle' };
}

module.exports = {
  AutoUpdateManager,
  setupAutoUpdater,
  initAutoUpdater,
  stopAutoUpdater,
  destroy,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  executeSafeInstall,
  getStatus,
};
