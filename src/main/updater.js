/**
 * updater.js
 * Proxy / Bridge to Modular Periodic Auto-Updater Service (updater.service.js).
 * Maintains backwards compatibility for any modules or tests importing from ./updater.
 */

const updaterService = require('./updater.service');

module.exports = {
  AutoUpdateManager: updaterService.AutoUpdateManager,
  setupAutoUpdater: updaterService.setupAutoUpdater,
  initAutoUpdater: updaterService.initAutoUpdater,
  stopAutoUpdater: updaterService.stopAutoUpdater,
  destroy: updaterService.destroy,
  checkForUpdates: updaterService.checkForUpdates,
  downloadUpdate: updaterService.downloadUpdate,
  quitAndInstall: updaterService.quitAndInstall,
  getStatus: updaterService.getStatus,
};
