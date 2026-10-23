/**
 * AutoUpdateManager
 * Manages periodic, lightweight, background update checks using electron-updater.
 * Strictly adheres to zero-client-side-git-pull, jittered scheduling, bounded backoff,
 * concurrency locks, and safe non-intrusive operations.
 */
class AutoUpdateManager {
  constructor(options = {}) {
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
    this.log = options.log || console.log;
    
    const isPackagedDefault = this.app && this.app.isPackaged !== undefined ? this.app.isPackaged : false;
    this.isPackaged = options.isPackaged !== undefined ? options.isPackaged : isPackagedDefault;
    
    // Configuration
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
    this.baseBackoffMs = 5 * 60 * 1000; // 5 minutes initial failure backoff
    this.maxBackoffMs = 120 * 60 * 1000; // 120 minutes max backoff (7,200,000 ms)

    // State tracking
    this.timer = null;
    this.isChecking = false;
    this.isDownloading = false;
    this.updateDownloaded = false;
    this.consecutiveFailures = 0;
    this.listenersAttached = false;
    this.isStopped = false;
    this.lastCheckTime = null;
    this.lastCheckStatus = 'idle';
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

    this.attachEventListeners();
    this.scheduleNextCheck(this.initialDelayMs);
  }

  attachEventListeners() {
    if (this.listenersAttached || !this.updater) return;
    this.listenersAttached = true;

    // Decouple check from binary download per Requirement R5
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;

    this.updater.on('checking-for-update', () => {
      this.lastCheckStatus = 'checking';
      this.log('[UPDATER] Checking for published updates...');
    });

    this.updater.on('update-available', (info) => {
      this.lastCheckStatus = 'available';
      this.isDownloading = true;
      const ver = info && info.version ? info.version : 'unknown';
      this.log(`[UPDATER] Update available: ${ver}. Download initiated in background.`);
      if (typeof this.updater.downloadUpdate === 'function') {
        this.updater.downloadUpdate().catch((err) => {
          this.isDownloading = false;
          this.log(`[UPDATER] Download error: ${this.sanitizeErrorMessage(err ? err.message : '')}`);
        });
      }
    });

    this.updater.on('update-not-available', (info) => {
      this.lastCheckStatus = 'up-to-date';
      this.isDownloading = false;
      const ver = info && info.version ? info.version : 'current';
      this.log(`[UPDATER] Application is up-to-date. Current release: ${ver}`);
    });

    this.updater.on('download-progress', (progress) => {
      const pct = progress && progress.percent ? Math.round(progress.percent) : 0;
      this.log(`[UPDATER] Background download progress: ${pct}%`);
    });

    this.updater.on('update-downloaded', (info) => {
      this.isDownloading = false;
      this.updateDownloaded = true;
      this.lastCheckStatus = 'downloaded';
      const ver = info && info.version ? info.version : 'new';
      this.log(`[UPDATER] Update downloaded successfully: version ${ver}`);

      if (this.dialog && typeof this.dialog.showMessageBox === 'function') {
        try {
          this.dialog.showMessageBox({
            type: 'info',
            title: 'تحديث جديد متوفر',
            message: `تم تنزيل التحديث الجديد (الإصدار ${ver}) بنجاح.\nهل ترغب في إعادة تشغيل البرنامج الآن لتطبيق التحديث؟`,
            buttons: ['إعادة التشغيل وتطبيق التحديث الآن', 'لاحقاً عند إغلاق البرنامج'],
            defaultId: 0,
            cancelId: 1,
          }).then((result) => {
            if (result && result.response === 0 && this.updater && typeof this.updater.quitAndInstall === 'function') {
              this.updater.quitAndInstall();
            }
          }).catch((e) => {
            this.log(`[UPDATER] Dialog handling error: ${e.message}`);
          });
        } catch (e) {
          this.log(`[UPDATER] Could not display update dialog: ${e.message}`);
        }
      }
    });

    this.updater.on('error', (err) => {
      this.isDownloading = false;
      this.lastCheckStatus = 'error';
      // Sanitize log message to remove any tokens or secrets
      const safeMsg = this.sanitizeErrorMessage(err ? err.message : 'Unknown error');
      this.log(`[UPDATER] Update error: ${safeMsg}`);
    });
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
        // Bounded exponential backoff: base * (1.5 ^ (failures - 1))
        const backoffMultiplier = Math.pow(1.5, Math.min(this.consecutiveFailures - 1, 6));
        delayMs = Math.min(this.maxBackoffMs, Math.round(this.baseBackoffMs * backoffMultiplier));
      } else {
        // Regular interval + jitter
        const jitter = Math.floor(Math.random() * this.maxJitterMs);
        delayMs = this.checkIntervalMs + jitter;
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

    // Mutex guard: Do not run overlapping checks or interrupt active downloads
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
      this.log('[UPDATER] Executing periodic background check...');
      if (this.updater && typeof this.updater.checkForUpdates === 'function') {
        await this.updater.checkForUpdates();
      }
      // On successful network check, reset failure counter
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

  stop() {
    this.isStopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.log('[UPDATER] Periodic update checker stopped cleanly.');
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

function stopAutoUpdater() {
  if (defaultManager) {
    defaultManager.stop();
  }
}

module.exports = {
  AutoUpdateManager,
  setupAutoUpdater,
  stopAutoUpdater,
};
