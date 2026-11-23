const express = require('express');
const controller = require('./settings.controller');
const { requireAdmin, requirePermission } = require('../../middleware/rbac.middleware');
const { clientErrorLimiter } = require('../../middleware/rateLimit.middleware');

const router = express.Router();

// Public store settings
router.get('/public/settings', controller.getPublicSettings);

// Client-side error telemetry (rate-limited, captures UI crashes even pre-login)
router.post('/client-errors', clientErrorLimiter, controller.reportClientError);

// Protected settings endpoints
router.get('/settings', requirePermission('Settings.html'), controller.getSettings);
router.post('/settings', requireAdmin, controller.saveSettings);

// Database backup & restore endpoints
router.get('/backup/groups', requireAdmin, controller.getBackupGroups);
router.get('/backup/export', requireAdmin, controller.exportBackup);
router.post('/backup/restore', requireAdmin, controller.restoreBackup);

// Administrative reset endpoint
router.post('/reset', requireAdmin, controller.resetSystem);
router.post('/reset-branches', requireAdmin, controller.resetBranches);

// Audit & System Error Logs endpoints
router.get('/audit-logs', requireAdmin, controller.getAuditLogs);
router.get('/error-logs', requireAdmin, controller.getErrorLogs);
router.get('/error-logs/download', requireAdmin, controller.downloadErrorLogs);
router.delete('/error-logs', requireAdmin, controller.clearErrorLogs);

module.exports = router;
