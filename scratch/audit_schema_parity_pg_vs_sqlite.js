/**
 * Full Schema Parity Audit: PostgreSQL vs Branch SQLite
 */
delete process.env.APP_MODE;
delete process.env.BRANCH_MODE;

const { DatabaseSync } = require('node:sqlite');
const db = require('../src/server/database/connection');
const { runBranchSqliteMigrations } = require('../src/server/database/migrator');

async function auditSchemaParity() {
  console.log('================================================================');
  console.log('       FULL SCHEMA PARITY AUDIT: POSTGRESQL VS SQLITE           ');
  console.log('================================================================\n');

  // Initialize fresh in-memory SQLite schema
  const sqlite = new DatabaseSync(':memory:');
  await runBranchSqliteMigrations(sqlite);

  // 1. Get all tables and columns from PostgreSQL
  const pgColsRes = await db.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT IN ('schema_migrations')
    ORDER BY table_name, ordinal_position;
  `);

  const pgTables = new Map();
  for (const row of pgColsRes.rows) {
    if (!pgTables.has(row.table_name)) {
      pgTables.set(row.table_name, new Map());
    }
    pgTables.get(row.table_name).set(row.column_name.toLowerCase(), row);
  }

  // 2. Get all tables and columns from SQLite
  const sqliteTablesRes = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
  `).all();

  const sqliteTables = new Map();
  for (const t of sqliteTablesRes) {
    const cols = sqlite.prepare(`PRAGMA table_info(${t.name})`).all();
    const colMap = new Map();
    for (const c of cols) {
      colMap.set(c.name.toLowerCase(), c);
    }
    sqliteTables.set(t.name, colMap);
  }

  console.log(`Total PostgreSQL Tables: ${pgTables.size}`);
  console.log(`Total SQLite Tables    : ${sqliteTables.size}\n`);

  let missingTablesInSqlite = [];
  let missingTablesInPg = [];
  let columnDiscrepancies = [];

  for (const [tName, pgColMap] of pgTables.entries()) {
    if (!sqliteTables.has(tName)) {
      missingTablesInSqlite.push(tName);
      continue;
    }
    const sqliteColMap = sqliteTables.get(tName);
    for (const [cName, pgCol] of pgColMap.entries()) {
      if (!sqliteColMap.has(cName)) {
        columnDiscrepancies.push({
          table: tName,
          column: cName,
          pgType: pgCol.data_type,
          issue: 'MISSING_IN_SQLITE',
        });
      }
    }
  }

  for (const [tName, sqliteColMap] of sqliteTables.entries()) {
    if (!pgTables.has(tName)) {
      missingTablesInPg.push(tName);
      continue;
    }
    const pgColMap = pgTables.get(tName);
    for (const [cName, sqCol] of sqliteColMap.entries()) {
      if (!pgColMap.has(cName)) {
        columnDiscrepancies.push({
          table: tName,
          column: cName,
          sqliteType: sqCol.type,
          issue: 'EXTRA_IN_SQLITE',
        });
      }
    }
  }

  console.log('--- Missing Tables in SQLite ---');
  if (missingTablesInSqlite.length === 0) {
    console.log('  ✅ None (All PostgreSQL tables exist in SQLite)');
  } else {
    console.log('  ❌ Missing tables:', missingTablesInSqlite);
  }

  console.log('\n--- Extra Tables in SQLite ---');
  if (missingTablesInPg.length === 0) {
    console.log('  None');
  } else {
    console.log('  ℹ️  Tables:', missingTablesInPg);
  }

  console.log('\n--- Column Discrepancies ---');
  if (columnDiscrepancies.length === 0) {
    console.log('  ✅ 100% Column Parity between PostgreSQL and SQLite!');
  } else {
    console.table(columnDiscrepancies);
  }

  return { missingTablesInSqlite, missingTablesInPg, columnDiscrepancies };
}

auditSchemaParity().then((res) => {
  if (res.missingTablesInSqlite.length > 0 || res.columnDiscrepancies.filter(d => d.issue === 'MISSING_IN_SQLITE').length > 0) {
    console.error('\n❌ SCHEMA PARITY AUDIT FAILED');
    process.exit(1);
  } else {
    console.log('\n🎉 SCHEMA PARITY AUDIT PASSED!');
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
