const config = require('../config/env');
const { newUuid } = require('../../shared/utils/string');

function shouldQueueSync(req) {
  return !config.IS_SYNC_TARGET && req?.headers?.['x-sync-apply'] !== '1';
}

async function queueSyncOperation(tx, req, entityType, action, entityId, branchId, payload) {
  if (!shouldQueueSync(req)) return null;
  const operationUuid = newUuid(payload?.operation_uuid);
  const data = JSON.stringify({ ...payload, operation_uuid: operationUuid });
  await tx.query(
    `INSERT INTO sync_queue (operation_uuid, entity_type, action, entity_id, branch_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (operation_uuid) DO NOTHING`,
    [operationUuid, entityType, action, entityId || null, branchId || null, data]
  );
  return operationUuid;
}

// Snapshot of a supplier's identifying fields so the central server can resolve
// (or create) the same supplier even when branch-local IDs differ from central IDs.
async function getSupplierSyncRef(q, supplierId) {
  if (!supplierId) return null;
  try {
    const { rows } = await q.query(
      'SELECT id, name, code, phone, company_name, address, gender_category FROM suppliers WHERE id = $1',
      [supplierId]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

// Activity logger (no-op stub preserved from legacy server.js)
async function logActivity() {
  return;
}

module.exports = {
  shouldQueueSync,
  queueSyncOperation,
  getSupplierSyncRef,
  logActivity,
};
