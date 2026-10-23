const settingsService = require('./settings.service');

async function getPublicSettings(req, res, next) {
  try {
    const settings = await settingsService.getPublicSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.getSettings(req.user);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function saveSettings(req, res, next) {
  try {
    const result = await settingsService.saveSettings(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getBackupGroups(req, res, next) {
  try {
    const groups = settingsService.getBackupGroups();
    res.json(groups);
  } catch (err) {
    next(err);
  }
}

async function exportBackup(req, res, next) {
  try {
    const { backup, filename } = await settingsService.exportBackup(req.query.groups, req.user);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.json(backup);
  } catch (err) {
    next(err);
  }
}

async function restoreBackup(req, res, next) {
  try {
    const result = await settingsService.restoreBackup(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resetSystem(req, res, next) {
  try {
    const result = await settingsService.resetSystem(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicSettings,
  getSettings,
  saveSettings,
  getBackupGroups,
  exportBackup,
  restoreBackup,
  resetSystem,
};
