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
    const safeAsciiName = String(filename || 'backup.json').replace(/[^\x20-\x7E]/g, '_');
    const encodedName = encodeURIComponent(filename || 'backup.json');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
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

async function resetBranches(req, res, next) {
  try {
    const result = await settingsService.resetBranches(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const auditService = require('../audit/audit.service');
    const logs = await auditService.listAuditLogs(req.query);
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

async function reportClientError(req, res) {
  try {
    const errorLogger = require('../../core/error-logger');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const message = String(body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Missing error message' });
    }
    const errorId = errorLogger.logError({
      source: 'frontend',
      level: body.level === 'warn' ? 'warn' : 'error',
      code: body.type ? String(body.type).slice(0, 80) : 'FRONTEND_ERROR',
      message,
      path: body.url ? String(body.url).slice(0, 500) : null,
      userId: req.user?.id || null,
      username: req.user?.username || null,
      branchId: req.user?.branch_id || null,
      stack: body.stack ? String(body.stack) : null,
      details: {
        componentStack: body.componentStack ? String(body.componentStack).slice(0, 2000) : undefined,
        filename: body.filename ? String(body.filename).slice(0, 300) : undefined,
        lineno: body.lineno || undefined,
        colno: body.colno || undefined,
        userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : undefined,
      },
    });
    res.json({ ok: true, errorId });
  } catch {
    res.status(200).json({ ok: false });
  }
}

async function getErrorLogs(req, res, next) {
  try {
    const errorLogger = require('../../core/error-logger');
    const result = errorLogger.readRecentErrors(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function downloadErrorLogs(req, res, next) {
  try {
    const fs = require('fs');
    const errorLogger = require('../../core/error-logger');
    const filePath = errorLogger.getLogFilePath();
    if (!fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="elwazeer-errors.jsonl"');
      return res.send('');
    }
    res.download(filePath, 'elwazeer-errors.jsonl');
  } catch (err) {
    next(err);
  }
}

async function clearErrorLogs(req, res, next) {
  try {
    const errorLogger = require('../../core/error-logger');
    const result = errorLogger.clearErrorLogs();
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
  resetBranches,
  getAuditLogs,
  reportClientError,
  getErrorLogs,
  downloadErrorLogs,
  clearErrorLogs,
};
