const { Pool } = require('pg');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('../src/server/config/env');
const migrator = require('../src/server/database/migrator');

(async () => {
  console.log('🔍 Running Database Schema Parity Audit (PostgreSQL vs SQLite)...');
  
  // 1. Connect to PostgreSQL
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'ahmed1@',
    database: process.env.DB_NAME || 'pos_db'
  });

  // 2. Initialize a fresh SQLite branch DB in memory or temp file
  const tempDbPath = path.join(__dirname, '../data/test_audit_branch.sqlite');
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  const sqlite = new DatabaseSync(tempDbPath);
  await migrator.runBranchSqliteMigrations(sqlite);

  // 3. Get all PostgreSQL tables and columns
  const pgColsRes = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const pgTables = {};
  for (const row of pgColsRes.rows) {
    if (!pgTables[row.table_name]) pgTables[row.table_name] = {};
    pgTables[row.table_name][row.column_name] = {
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default
    };
  }

  // 4. Get all SQLite tables and columns
  const sqliteTablesRes = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
  `).all();

  const sqliteTables = {};
  for (const t of sqliteTablesRes) {
    const cols = sqlite.prepare(`PRAGMA table_info('${t.name}')`).all();
    sqliteTables[t.name] = {};
    for (const c of cols) {
      sqliteTables[t.name][c.name] = {
        type: c.type,
        nullable: c.notnull === 0,
        default: c.dflt_value,
        pk: c.pk > 0
      };
    }
  }

  // 5. Compare Tables
  const pgTableNames = Object.keys(pgTables).sort();
  const sqliteTableNames = Object.keys(sqliteTables).sort();

  console.log(`\n📊 Table Summary:`);
  console.log(`   PostgreSQL Tables: ${pgTableNames.length}`);
  console.log(`   SQLite Tables:     ${sqliteTableNames.length}`);

  const missingInSqlite = pgTableNames.filter(t => !sqliteTables[t] && t !== 'schema_migrations');
  const missingInPg = sqliteTableNames.filter(t => !pgTables[t]);

  console.log('\n❌ Tables in PG but missing in SQLite:', missingInSqlite);
  console.log('❌ Tables in SQLite but missing in PG:', missingInPg);

  // 6. Compare Columns for common tables
  const commonTables = pgTableNames.filter(t => sqliteTables[t]);
  const columnMismatches = [];

  for (const t of commonTables) {
    const pgC = Object.keys(pgTables[t]);
    const sqC = Object.keys(sqliteTables[t]);

    const missingInSqliteCols = pgC.filter(c => !sqliteTables[t][c]);
    const missingInPgCols = sqC.filter(c => !pgTables[t][c]);

    if (missingInSqliteCols.length > 0 || missingInPgCols.length > 0) {
      columnMismatches.push({
        table: t,
        missingInSqlite: missingInSqliteCols,
        missingInPg: missingInPgCols
      });
    }
  }

  console.log('\n🔍 Column Discrepancies in Common Tables:');
  console.log(JSON.stringify(columnMismatches, null, 2));

  sqlite.close();
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
  await pool.end();
})();
