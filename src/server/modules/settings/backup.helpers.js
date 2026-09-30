const db = require('../../database/connection');
const { BACKUP_GROUPS, BACKUP_TABLE_ORDER } = require('../../../shared/constants/system');

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function normalizeBackupGroups(groups) {
  const requested = Array.isArray(groups)
    ? groups
    : String(groups || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
  if (!requested.length || requested.includes('all')) return Object.keys(BACKUP_GROUPS);
  return [...new Set(requested.filter((g) => BACKUP_GROUPS[g]))];
}

function tablesForBackupGroups(groups) {
  const selected = new Set();
  for (const group of normalizeBackupGroups(groups)) {
    for (const table of BACKUP_GROUPS[group].tables) selected.add(table);
  }
  return BACKUP_TABLE_ORDER.filter((table) => selected.has(table));
}

function shouldLimitUsersToBranchAccounts(groups) {
  const selectedGroups = normalizeBackupGroups(groups);
  return selectedGroups.includes('settings') && !selectedGroups.includes('users');
}

function isBackupRowObject(row) {
  return row && typeof row === 'object' && !Array.isArray(row);
}

function filterBackupRowsForGroup(table, rows, groups) {
  if (table === 'users' && shouldLimitUsersToBranchAccounts(groups)) {
    return rows.filter((row) => row.role !== 'admin');
  }
  return rows;
}

function backupHasAdminUser(backup) {
  const usersRows = Array.isArray(backup?.tables?.users?.rows) ? backup.tables.users.rows : [];
  return usersRows.some((row) => row && row.role === 'admin');
}

function normalizeBackupValue(value, columnType) {
  if (value === undefined || value === null) return null;
  if (columnType === 'json' || columnType === 'jsonb') {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return value;
      } catch (_) {
        return JSON.stringify(value);
      }
    }
    return JSON.stringify(value);
  }
  if (columnType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === '1' || value === 't';
    return Boolean(value);
  }
  if (columnType === 'integer' || columnType === 'bigint' || columnType === 'smallint') {
    if (typeof value === 'number') return value;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  if (columnType === 'numeric' || columnType === 'decimal' || columnType === 'real' || columnType === 'double precision') {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return value;
}

async function getTableColumns(tableName) {
  if (db._isBranchMode) return [];
  const { rows } = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return rows.map((r) => r.column_name);
}

async function getTableColumnTypes(tableName) {
  if (db._isBranchMode) return new Map();
  const { rows } = await db.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

async function getPrimaryKeyColumns(tableName) {
  if (db._isBranchMode) return [];
  const { rows } = await db.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [tableName]
  );
  return rows.map((r) => r.column_name);
}

async function resetTableSequence(tx, tableName) {
  if (db._isBranchMode) return;
  const idColumnRes = await tx.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'
     LIMIT 1`,
    [tableName]
  );
  if (idColumnRes.rows.length === 0) return;
  const sequenceRes = await tx.query("SELECT pg_get_serial_sequence($1, 'id') AS sequence_name", [tableName]);
  const sequenceName = sequenceRes.rows[0]?.sequence_name;
  if (!sequenceName) return;
  await tx.query(
    `SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${quoteIdent(tableName)}), 1), COALESCE((SELECT MAX(id) FROM ${quoteIdent(tableName)}) IS NOT NULL, false))`,
    [sequenceName]
  );
}

module.exports = {
  quoteIdent,
  normalizeBackupGroups,
  tablesForBackupGroups,
  shouldLimitUsersToBranchAccounts,
  isBackupRowObject,
  filterBackupRowsForGroup,
  backupHasAdminUser,
  normalizeBackupValue,
  getTableColumns,
  getTableColumnTypes,
  getPrimaryKeyColumns,
  resetTableSequence,
};
