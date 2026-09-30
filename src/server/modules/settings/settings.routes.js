const express = require('express');
const controller = require('./settings.controller');
const { requireAdmin } = require('../../middleware/rbac.middleware');

const router = express.Router();

// Public store settings
router.get('/public/settings', controller.getPublicSettings);

// Protected settings endpoints
router.get('/settings', requireAdmin, controller.getSettings);
router.post('/settings', requireAdmin, controller.saveSettings);

// Database backup & restore endpoints
router.get('/backup/groups', requireAdmin, controller.getBackupGroups);
router.get('/backup/export', requireAdmin, controller.exportBackup);
router.post('/backup/restore', requireAdmin, controller.restoreBackup);

// Administrative reset endpoint
router.post('/reset', requireAdmin, controller.resetSystem);

module.exports = router;
