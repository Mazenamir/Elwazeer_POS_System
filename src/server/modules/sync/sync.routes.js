const express = require('express');
const router = express.Router();
const syncController = require('./sync.controller');
const config = require('../../config/env');
const { requireAdmin } = require('../../middleware/auth.middleware');
const { syncLimiter } = require('../../middleware/rateLimit.middleware');

function requireSyncAuthOrKey(req, res, next) {
  const syncKey = req.headers?.['x-sync-key'];
  const expectedKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  const isKeyValid = Boolean(syncKey && expectedKey && syncKey === expectedKey);

  if (req.user || isKeyValid || req.isSyncKeyAuthenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: authentication or sync key required' });
}

function requireAdminOrSyncKey(req, res, next) {
  const syncKey = req.headers?.['x-sync-key'];
  const expectedKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  const isKeyValid = Boolean(syncKey && expectedKey && syncKey === expectedKey);

  if (isKeyValid || req.isSyncKeyAuthenticated) {
    return next();
  }
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(403).json({ error: 'Forbidden: Admin privilege or sync key required' });
}

router.get('/sync/ping', syncController.ping);
router.post('/sync/apply', syncController.apply);
router.get('/sync/catalog', syncController.getCatalog);
router.post('/sync/pull', requireSyncAuthOrKey, syncController.pull);
router.get('/sync/status', requireSyncAuthOrKey, syncController.getStatus);
router.post('/sync/run', requireSyncAuthOrKey, syncController.run);
router.post('/sync/cycle', requireSyncAuthOrKey, syncLimiter, syncController.runCycle);
router.get('/sync/diagnostics', requireSyncAuthOrKey, syncController.getDiagnostics);
router.post('/sync/configure', requireAdminOrSyncKey, syncController.configure);

module.exports = router;

