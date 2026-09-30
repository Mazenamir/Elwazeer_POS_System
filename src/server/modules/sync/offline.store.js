const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('../../config/env');

const offlineDbPath = config.OFFLINE_DB_PATH;
fs.mkdirSync(path.dirname(offlineDbPath), { recursive: true });

const sqlite = new DatabaseSync(offlineDbPath);
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS offline_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_uuid TEXT UNIQUE NOT NULL,
    entity_type TEXT NOT NULL,
    action TEXT NOT NULL,
    branch_id INTEGER,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_offline_operations_status_created ON offline_operations(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_offline_operations_synced_at ON offline_operations(synced_at DESC) WHERE synced_at IS NOT NULL;
`);

function saveOperation({ operation_uuid, entity_type, action = 'create', branch_id, payload }) {
  const opUuid = operation_uuid || payload?.offline_uuid || crypto.randomUUID();
  const serializedPayload = JSON.stringify({ ...payload, offline_uuid: payload?.offline_uuid || opUuid });
  sqlite.prepare(`
    INSERT INTO offline_operations (operation_uuid, entity_type, action, branch_id, payload)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(operation_uuid) DO UPDATE SET
      entity_type = excluded.entity_type,
      action = excluded.action,
      branch_id = excluded.branch_id,
      payload = excluded.payload,
      status = 'pending',
      last_error = NULL
  `).run(opUuid, entity_type, action, branch_id || null, serializedPayload);
  return opUuid;
}

function pending(limit = 50) {
  return sqlite.prepare(`
    SELECT * FROM offline_operations
    WHERE status IN ('pending', 'failed')
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(limit).map(row => ({ ...row, payload: JSON.parse(row.payload) }));
}

function markSynced(id) {
  sqlite.prepare(`
    UPDATE offline_operations
    SET status = 'synced', synced_at = CURRENT_TIMESTAMP, last_error = NULL
    WHERE id = ?
  `).run(id);
}

function markFailed(id, error) {
  sqlite.prepare(`
    UPDATE offline_operations
    SET status = 'failed', attempts = attempts + 1, last_error = ?
    WHERE id = ?
  `).run(String(error || '').slice(0, 1000), id);
}

function status() {
  const counts = sqlite.prepare(`
    SELECT status, COUNT(*) AS count
    FROM offline_operations
    WHERE status IN ('pending', 'failed')
    GROUP BY status
  `).all();
  const last = sqlite.prepare(`
    SELECT synced_at AS last_synced_at
    FROM offline_operations
    WHERE synced_at IS NOT NULL
    ORDER BY synced_at DESC
    LIMIT 1
  `).get();
  const byStatus = Object.fromEntries(counts.map(row => [row.status, Number(row.count || 0)]));
  return {
    pending: byStatus.pending || 0,
    failed: byStatus.failed || 0,
    last_synced_at: last?.last_synced_at || null,
    path: offlineDbPath,
  };
}

function pruneSynced(retentionDays = 30) {
  const days = Math.max(0, Number.parseInt(retentionDays, 10) || 0);
  if (days <= 0) return;
  sqlite.prepare(`
    DELETE FROM offline_operations
    WHERE status = 'synced'
      AND synced_at IS NOT NULL
      AND synced_at < datetime('now', ?)
  `).run(`-${days} days`);
}

function clearAll() {
  sqlite.prepare('DELETE FROM offline_operations').run();
}

module.exports = {
  path: offlineDbPath,
  saveOperation,
  pending,
  markSynced,
  markFailed,
  status,
  pruneSynced,
  clearAll,
};
