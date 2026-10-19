const express = require('express');
const router = express.Router();
const notificationsController = require('./notifications.controller');

router.get('/notifications', notificationsController.getNotifications);
router.post('/notifications/read', notificationsController.markAsRead);
router.post('/notifications/clear', notificationsController.clearNotifications);
router.post('/notifications/heartbeat', notificationsController.recordHeartbeat);

module.exports = router;
