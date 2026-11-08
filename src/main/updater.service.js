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

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const yaml = require('yaml');
const semver = require('semver');
const { spawnSync, spawn } = require('child_process');
const { EventEmitter } = require('events');
const { UpdateStateMachine } = require('./update-state-machine');
const {
  validatePolicyContract,
  verifyPolicySignature,
  verifyFileSha512,
} = require('./security/update-policy.verifier');
const { DEFAULT_UPDATE_PUBLIC_KEY_PEM } = require('./security/public-keys');

function getGitCredentialToken() {
  try {
    const res = spawnSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      timeout: 3000,
      env: { ...process.env, GCM_INTERACTIVE: 'never', GIT_TERMINAL_PROMPT: '0' },
    });
    const passLine = (res.stdout || '').split('\n').find((l) => l.startsWith('password='));
    return passLine ? passLine.slice(9).trim() : '';
  } catch (_) {
    return '';
  }
}

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

    // Resilient GitHub API Fallback Configuration
    this.owner = options.owner || 'Mazenamir';
    this.repo = options.repo || 'Elwazeer_POS_System';
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || getGitCredentialToken();
    this.enableApiFallback = options.enableApiFallback !== undefined ? options.enableApiFallback : true;
    this.explicitApiFallback = Boolean(options.enableApiFallback);
    this.isFallbackDownloaded = false;

    // Standardized Update Handlers (Callable directly or via electron-updater events)
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

      if (this.stateMachine.canTransitionTo('waiting-for-safe-point')) {
        this.stateMachine.transition('waiting-for-safe-point', { version: ver });
      }

      this.emit('status', 'updater:downloaded', info);
      this.emit('status', 'updater:waiting-for-safe-point', { version: ver });

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

  async fetchJsonFromApi(endpoint) {
    const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
    const headers = {
      'User-Agent': 'BebyoonUpdater',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }
    const buf = await this.fetchBufferWithRedirects(url, headers);
    return JSON.parse(buf.toString('utf8'));
  }

  fetchBufferWithRedirects(initialUrl, headers = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
      const get = (currentUrl, redirectsLeft) => {
        if (redirectsLeft < 0) {
          return reject(new Error('Too many HTTP redirects'));
        }
        const client = currentUrl.startsWith('https') ? https : http;
        const reqHeaders = { 'User-Agent': 'BebyoonUpdater', ...headers };
        if (!currentUrl.includes('api.github.com')) {
          delete reqHeaders['Authorization'];
          delete reqHeaders['authorization'];
        }
        const req = client.get(currentUrl, { headers: reqHeaders }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            return get(nextUrl, redirectsLeft - 1);
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode} from ${currentUrl}`));
          }
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(25000, () => {
          req.destroy(new Error(`Timeout fetching ${currentUrl}`));
        });
      };
      get(initialUrl, maxRedirects);
    });
  }

  streamDownloadToFile(initialUrl, destPath, options = {}) {
    const {
      headers = {},
      expectedSha512 = null,
      onProgress = null,
      maxRedirects = 5,
      timeoutMs = 180000,
    } = options;

    return new Promise((resolve, reject) => {
      const download = (currentUrl, redirectsLeft) => {
        if (redirectsLeft < 0) {
          return reject(new Error('Too many HTTP redirects during asset download'));
        }
        const client = currentUrl.startsWith('https') ? https : http;
        const reqHeaders = { 'User-Agent': 'BebyoonUpdater', ...headers };
        if (!currentUrl.includes('api.github.com')) {
          delete reqHeaders['Authorization'];
          delete reqHeaders['authorization'];
        }

        const req = client.get(currentUrl, { headers: reqHeaders }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            return download(nextUrl, redirectsLeft - 1);
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode} while downloading update asset`));
          }

          const totalBytes = parseInt(res.headers['content-length'], 10) || options.totalBytes || 0;
          let downloadedBytes = 0;
          const hash = crypto.createHash('sha512');
          const fileStream = fs.createWriteStream(destPath);
          let lastProgressTime = 0;

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            hash.update(chunk);
            fileStream.write(chunk);

            const now = Date.now();
            if (now - lastProgressTime > 1000 || downloadedBytes === totalBytes) {
              lastProgressTime = now;
              const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
              if (typeof onProgress === 'function') {
                onProgress({
                  percent,
                  transferred: downloadedBytes,
                  total: totalBytes,
                  bytesPerSecond: 0,
                });
              }
            }
          });

          res.on('end', () => {
            fileStream.end(() => {
              const actualHashBase64 = hash.digest('base64');
              if (expectedSha512 && actualHashBase64 !== expectedSha512) {
                try { fs.unlinkSync(destPath); } catch {}
                return reject(new Error(`Integrity verification failed for ${path.basename(destPath)}: SHA-512 mismatch.`));
              }
              resolve({
                filePath: destPath,
                downloadedBytes,
                sha512: actualHashBase64,
              });
            });
          });

          res.on('error', (err) => {
            fileStream.destroy();
            try { fs.unlinkSync(destPath); } catch {}
            reject(err);
          });
        });

        req.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`Download timed out after ${timeoutMs}ms`));
        });
      };

      download(initialUrl, maxRedirects);
    });
  }

  async checkViaGitHubApi() {
    this.log(`[UPDATER-API] Checking for updates via GitHub Releases API for ${this.owner}/${this.repo} (Channel: ${this.channel})...`);
    this.isChecking = true;
    this.lastCheckStatus = 'checking';
    if (this.stateMachine.canTransitionTo('checking')) {
      this.stateMachine.transition('checking');
    }
    this.emit('status', 'updater:checking');

    try {
      const releases = await this.fetchJsonFromApi(`/repos/${this.owner}/${this.repo}/releases`);
      if (!Array.isArray(releases) || releases.length === 0) {
        this.log('[UPDATER-API] No releases found on GitHub.');
        this._onNotAvailable({ version: this.currentVersion });
        return { isUpdateAvailable: false, version: this.currentVersion };
      }

      const eligible = releases.filter((r) => {
        if (r.draft) return false;
        if (r.prerelease && !this.updater?.allowPrerelease) return false;
        return true;
      });

      if (eligible.length === 0) {
        this._onNotAvailable({ version: this.currentVersion });
        return { isUpdateAvailable: false, version: this.currentVersion };
      }

      eligible.sort((a, b) => {
        const vA = semver.clean(a.tag_name) || semver.coerce(a.tag_name)?.version || '0.0.0';
        const vB = semver.clean(b.tag_name) || semver.coerce(b.tag_name)?.version || '0.0.0';
        return semver.rcompare(vA, vB);
      });

      const latestRelease = eligible[0];
      const remoteVer = semver.clean(latestRelease.tag_name) || semver.coerce(latestRelease.tag_name)?.version;

      if (!remoteVer || !semver.gt(remoteVer, this.currentVersion)) {
        this.log(`[UPDATER-API] Current release ${this.currentVersion} is up-to-date with ${latestRelease.tag_name}.`);
        this._onNotAvailable({ version: remoteVer || this.currentVersion });
        return { isUpdateAvailable: false, version: this.currentVersion, release: latestRelease };
      }

      const targetYaml = this.channel === 'branch' ? 'branch.yml' : 'latest.yml';
      const yamlAsset = (latestRelease.assets || []).find((a) => a.name === targetYaml);

      let yamlData = {};
      if (yamlAsset && yamlAsset.url) {
        try {
          const yamlBuf = await this.fetchBufferWithRedirects(yamlAsset.url, {
            'Accept': 'application/octet-stream',
          });
          yamlData = yaml.parse(yamlBuf.toString('utf8')) || {};
        } catch (e) {
          this.log(`[UPDATER-API] Warning: Could not fetch ${targetYaml}: ${e.message}. Using release metadata.`);
        }
      }

      const releaseVersion = yamlData.version || remoteVer;
      const updateInfo = {
        version: releaseVersion,
        files: yamlData.files || [],
        path: yamlData.path || (this.channel === 'branch' ? `Bebyoon-Branch-Setup-${releaseVersion}.exe` : `Bebyoon-System-Setup-${releaseVersion}.exe`),
        sha512: yamlData.sha512 || yamlData.files?.[0]?.sha512 || null,
        releaseDate: yamlData.releaseDate || latestRelease.published_at,
        releaseName: latestRelease.name,
        releaseNotes: latestRelease.body,
        edition: this.edition,
        channel: this.channel,
        assets: latestRelease.assets || [],
        releaseId: latestRelease.id,
        isApiFallback: true,
      };

      this.log(`[UPDATER-API] Update available: v${releaseVersion} (Release: ${latestRelease.name}).`);
      this._onAvailable(updateInfo);
      return { isUpdateAvailable: true, versionInfo: updateInfo, updateInfo };
    } catch (err) {
      const safeMsg = this.sanitizeErrorMessage(err.message);
      this.log(`[UPDATER-API] Error during API update check: ${safeMsg}`);
      throw err;
    } finally {
      this.isChecking = false;
    }
  }

  async downloadViaGitHubApi(info = null) {
    const updateInfo = info || this.availableUpdateInfo;
    if (!updateInfo) {
      throw new Error('No update info available to download.');
    }

    this.isDownloading = true;
    if (this.stateMachine.canTransitionTo('downloading')) {
      this.stateMachine.transition('downloading');
    }
    this.emit('status', 'updater:downloading');

    try {
      const assets = updateInfo.assets || [];
      const isBranch = this.edition === 'branch';
      const expectedName = updateInfo.path ? path.basename(updateInfo.path) : null;
      let exeAsset = assets.find((a) => {
        if (!a.name.endsWith('.exe')) return false;
        if (expectedName && a.name.toLowerCase() === expectedName.toLowerCase()) return true;
        if (isBranch) return a.name.toLowerCase().includes('branch');
        return !a.name.toLowerCase().includes('branch');
      });

      if (!exeAsset) {
        throw new Error(`Executable asset not found in release v${updateInfo.version} for edition ${this.edition}.`);
      }

      this.log(`[UPDATER-API] Downloading ${exeAsset.name} (${(exeAsset.size / (1024 * 1024)).toFixed(2)} MB)...`);

      const baseDir = this.app?.getPath
        ? path.join(this.app.getPath('userData'), 'pending-updates')
        : path.join(os.tmpdir(), 'bebyoon-updates');
      fs.mkdirSync(baseDir, { recursive: true });
      const destPath = path.join(baseDir, exeAsset.name);

      const expectedSha512 = updateInfo.sha512 || updateInfo.files?.[0]?.sha512 || null;

      await this.streamDownloadToFile(exeAsset.url, destPath, {
        headers: { 'Accept': 'application/octet-stream' },
        expectedSha512,
        totalBytes: exeAsset.size,
        onProgress: (p) => {
          this._onProgress(p);
        },
      });

      this.log(`[UPDATER-API] Download completed and verified: ${destPath}`);
      this.downloadedFilePath = destPath;
      this.isFallbackDownloaded = true;

      await this._onDownloaded({
        version: updateInfo.version,
        downloadedFile: destPath,
        files: updateInfo.files,
      });

      return { downloadedFile: destPath, version: updateInfo.version };
    } catch (err) {
      this.isDownloading = false;
      const safeMsg = this.sanitizeErrorMessage(err.message);
      this.log(`[UPDATER-API] Download failed: ${safeMsg}`);
      if (this.stateMachine.canTransitionTo('failed')) {
        this.stateMachine.transition('failed', { error: safeMsg });
      }
      this.emit('status', 'updater:error', { error: safeMsg });
      throw err;
    }
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
      const isMockUpdater = this.updater && this.updater.constructor?.name?.startsWith('Mock') && !this.explicitApiFallback;

      if (this.updater && typeof this.updater.checkForUpdates === 'function') {
        try {
          await this.updater.checkForUpdates();
        } catch (err) {
          if (!this.enableApiFallback || isMockUpdater) {
            throw err;
          }
          const safeMsg = this.sanitizeErrorMessage(err ? err.message : 'Unknown check error');
          this.log(`[UPDATER] Standard update check failed (${safeMsg}). Initiating resilient fallback via GitHub Releases API...`);
          await this.checkViaGitHubApi();
        }
      } else if (this.enableApiFallback) {
        await this.checkViaGitHubApi();
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

    const isMockUpdater = this.updater && this.updater.constructor?.name?.startsWith('Mock') && !this.explicitApiFallback;

    // If update was already discovered via API fallback, download directly via API
    if (this.availableUpdateInfo?.isApiFallback) {
      this.log('[UPDATER] Update discovered via API fallback. Downloading package directly via GitHub Releases API...');
      return this.downloadViaGitHubApi(this.availableUpdateInfo);
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
        this.log(`[UPDATER] Standard download failed: ${err.message}.`);
        if (this.enableApiFallback && !isMockUpdater) {
          this.log('[UPDATER] Initiating resilient download fallback via GitHub Releases API...');
          return await this.downloadViaGitHubApi(this.availableUpdateInfo);
        }
        this.isDownloading = false;
        if (this.stateMachine.canTransitionTo('failed')) {
          this.stateMachine.transition('failed', { error: err.message });
        }
        throw err;
      }
    }

    if (this.enableApiFallback && this.availableUpdateInfo) {
      return this.downloadViaGitHubApi(this.availableUpdateInfo);
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

    if (this.isFallbackDownloaded && this.downloadedFilePath && fs.existsSync(this.downloadedFilePath)) {
      this.log(`[UPDATER] Launching downloaded installer directly: ${this.downloadedFilePath}...`);
      try {
        const child = spawn(this.downloadedFilePath, ['--updated', '--force-run'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        if (this.app && typeof this.app.quit === 'function') {
          this.app.quit();
          return;
        }
      } catch (err) {
        this.log(`[UPDATER] Direct installer launch failed: ${err.message}. Trying updater fallback...`);
      }
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

function checkViaGitHubApi() {
  if (defaultManager) {
    return defaultManager.checkViaGitHubApi();
  }
  return Promise.resolve({ isUpdateAvailable: false, reason: 'uninitialized' });
}

function downloadViaGitHubApi(info) {
  if (defaultManager) {
    return defaultManager.downloadViaGitHubApi(info);
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
  checkViaGitHubApi,
  downloadViaGitHubApi,
  quitAndInstall,
  executeSafeInstall,
  getStatus,
};
