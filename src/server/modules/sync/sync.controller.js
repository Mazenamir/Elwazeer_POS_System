const config = require('../../config/env');
const syncService = require('./sync.service');

function ping(req, res) {
  res.json({ ok: true, target: config.IS_SYNC_TARGET, time: new Date().toISOString() });
}

async function apply(req, res, next) {
  if (!config.SYNC_API_KEY) {
    return res.status(403).json({ error: 'Sync endpoint is disabled: SYNC_API_KEY not configured' });
  }
  if (req.headers['x-sync-key'] !== config.SYNC_API_KEY) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }

  const operation = req.body;
  if (!operation || !operation.operation_uuid || !operation.entity_type || !operation.payload) {
    return res.status(400).json({ error: 'Invalid sync operation' });
  }

  try {
    await syncService.applyOperation(operation);
    res.json({ success: true, operation_uuid: operation.operation_uuid });
  } catch (err) {
    console.error('Sync apply failed:', err);
    res.status(400).json({ error: err.message });
  }
}

async function getStatus(req, res, next) {
  try {
    const status = await syncService.getSyncStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function run(req, res, next) {
  try {
    const result = await syncService.runSync(req.body?.limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ping,
  apply,
  getStatus,
  run,
};
