const config = require('../../config/env');
const db = require('../../database/connection');
const syncService = require('./sync.service');

async function ping(req, res) {
  let dbOk = false;
  try {
    dbOk = await db.isPrimaryDbAvailable();
  } catch {}

  if (!dbOk) {
    return res.status(503).json({
      ok: false,
      error: 'Database unavailable',
      target: config.IS_SYNC_TARGET,
      time: new Date().toISOString(),
    });
  }

  res.json({ ok: true, target: config.IS_SYNC_TARGET, time: new Date().toISOString() });
}

async function apply(req, res, next) {
  const expectedKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  if (!expectedKey) {
    return res.status(403).json({ error: 'Sync endpoint is disabled: SYNC_API_KEY not configured' });
  }
  if (req.headers['x-sync-key'] !== expectedKey) {
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

async function runCycle(req, res, next) {
  try {
    const result = await syncService.runSyncCycle({ isManual: true, limit: req.body?.limit });
    res.json(result);
  } catch (err) {
    console.error('Sync cycle failed:', err);
    res.status(500).json({ ok: false, error: err.message, message: 'حدث خطأ غير متوقع أثناء المزامنة' });
  }
}

async function getCatalog(req, res, next) {
  const expectedKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  if (!expectedKey) {
    return res.status(403).json({ error: 'Sync endpoint is disabled: SYNC_API_KEY not configured' });
  }
  if (req.headers['x-sync-key'] !== expectedKey) {
    return res.status(401).json({ error: 'Invalid sync key' });
  }

  try {
    const catalog = await syncService.exportCatalogForBranch(req.query?.branch_id);
    res.json(catalog);
  } catch (err) {
    console.error('Export catalog failed:', err);
    res.status(500).json({ error: err.message });
  }
}

async function pull(req, res, next) {
  try {
    const result = await syncService.pullCatalogFromCentral();
    res.json(result);
  } catch (err) {
    console.error('Pull catalog failed:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getDiagnostics(req, res, next) {
  try {
    const diag = await syncService.getSyncDiagnostics();
    res.json(diag);
  } catch (err) {
    next(err);
  }
}

async function configure(req, res, next) {
  try {
    const result = await syncService.configureSyncServer(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, message: err.message });
  }
}

module.exports = {
  ping,
  apply,
  getCatalog,
  pull,
  getStatus,
  run,
  runCycle,
  getDiagnostics,
  configure,
};

