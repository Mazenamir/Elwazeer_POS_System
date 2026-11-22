const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const syncController = require('./sync.controller');
const config = require('../../config/env');
const { requireAdmin } = require('../../middleware/auth.middleware');
const { syncLimiter } = require('../../middleware/rateLimit.middleware');

/**
 * Constant-time string comparison using SHA-256 hash digests and crypto.timingSafeEqual
 * to avoid timing leaks based on string length differences.
 */
function safeCompareSyncKey(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') {
    return false;
  }
  const hashProvided = crypto.createHash('sha256').update(providedKey).digest();
  const hashExpected = crypto.createHash('sha256').update(expectedKey).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

function checkSyncKey(req) {
  const syncKey = req.headers?.['x-sync-key'];
  const expectedKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  if (!syncKey || !expectedKey) return false;
  return safeCompareSyncKey(String(syncKey), String(expectedKey));
}

function requireSyncAuthOrKey(req, res, next) {
  const isKeyValid = checkSyncKey(req);
  if (req.user || isKeyValid || req.isSyncKeyAuthenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: authentication or sync key required' });
}

function requireAdminOrSyncKey(req, res, next) {
  const isKeyValid = checkSyncKey(req);
  if (isKeyValid || req.isSyncKeyAuthenticated) {
    return next();
  }
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    return next();
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.status(403).json({ error: 'Forbidden: Admin privilege or sync key required' });
}

function requireSyncKeyOnly(req, res, next) {
  const expectedKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  if (!expectedKey) {
    return res.status(403).json({ error: 'Sync endpoint is disabled: SYNC_API_KEY not configured' });
  }
  if (!checkSyncKey(req)) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }
  return next();
}

router.get('/sync/ping', syncController.ping);
router.post('/sync/apply', syncController.apply);
router.get('/sync/catalog', syncController.getCatalog);
router.get('/sync/uploads/manifest', requireSyncKeyOnly, syncController.getUploadManifest);
router.get('/sync/uploads/file', requireSyncKeyOnly, syncController.getUploadFile);
router.post('/sync/uploads/push', requireSyncKeyOnly, syncController.pushUploadFile);
router.post('/sync/pull', requireSyncAuthOrKey, syncController.pull);
router.get('/sync/status', requireSyncAuthOrKey, syncController.getStatus);
router.post('/sync/run', requireSyncAuthOrKey, syncLimiter, syncController.run);
router.post('/sync/cycle', requireSyncAuthOrKey, syncLimiter, syncController.runCycle);
router.get('/sync/diagnostics', requireSyncAuthOrKey, syncController.getDiagnostics);
router.post('/sync/configure', requireAdminOrSyncKey, syncController.configure);
router.get('/sync/dead-letter', requireAdminOrSyncKey, syncController.getDeadLetter);
router.post('/sync/dead-letter/retry', requireAdminOrSyncKey, syncController.retryDeadLetter);

router.safeCompareSyncKey = safeCompareSyncKey;
router.requireAdminOrSyncKey = requireAdminOrSyncKey;
router.requireSyncAuthOrKey = requireSyncAuthOrKey;

module.exports = router;
