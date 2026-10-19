const notificationsService = require('./notifications.service');

async function getNotifications(req, res, next) {
  try {
    const result = await notificationsService.getNotifications(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { ids, all } = req.body || {};
    const userId = req.user?.id || null;
    const result = await notificationsService.markAsRead({ ids, all, userId, user: req.user });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function clearNotifications(req, res, next) {
  try {
    const { ids, all } = req.body || {};
    const userId = req.user?.id || null;
    const result = await notificationsService.clearNotifications({ ids, all, userId, user: req.user });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function recordHeartbeat(req, res, next) {
  try {
    const branchId = req.body?.branch_id || req.query?.branch_id || req.headers['x-branch-id'];
    const status = req.body?.status || 'online';
    if (!branchId) {
      return res.status(400).json({ ok: false, error: 'branch_id is required' });
    }
    await notificationsService.recordHeartbeat(branchId, status, req.body?.meta || {});
    res.json({ ok: true, branch_id: Number(branchId), status });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  clearNotifications,
  recordHeartbeat,
};
