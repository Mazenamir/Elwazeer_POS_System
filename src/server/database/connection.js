const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

let pool = null;
let sqliteDb = null;

if (config.IS_BRANCH_MODE) {
  // Branch Mode - SQLite Adapter
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(config.BRANCH_SQLITE_PATH), { recursive: true });
  sqliteDb = new DatabaseSync(config.BRANCH_SQLITE_PATH);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');

  module.exports = {
    _isBranchMode: true,
    sqlite: sqliteDb,
    query: async (text, params = []) => {
      // Stub throwing clear message if someone tries to use raw Postgres query in branch mode
      throw new Error('Postgres query is not available in branch mode; use SQLite store adapter.');
    },
    transaction: async () => {
      throw new Error('Postgres transaction is not available in branch mode.');
    },
    isPrimaryDbAvailable: async () => false,
    close: async () => {
      try {
        sqliteDb.close();
      } catch {}
    },
  };
} else {
  // Master Mode - PostgreSQL Pool
  const statementTimeoutMs = config.boundedEnvInt('DB_STATEMENT_TIMEOUT_MS', 60000, 5000, 300000);

  pool = new Pool({
    user: config.DB_USER,
    host: config.DB_HOST,
    database: config.DB_NAME,
    password: config.DB_PASSWORD,
    port: config.DB_PORT,
    max: config.boundedEnvInt('DB_POOL_MAX', 20, 2, 100),
    connectionTimeoutMillis: config.boundedEnvInt('DB_CONNECTION_TIMEOUT_MS', 5000, 1000, 60000),
    idleTimeoutMillis: config.boundedEnvInt('DB_IDLE_TIMEOUT_MS', 30000, 5000, 300000),
    query_timeout: config.boundedEnvInt('DB_QUERY_TIMEOUT_MS', 65000, 5000, 300000),
    statement_timeout: statementTimeoutMs,
    idle_in_transaction_session_timeout: config.boundedEnvInt('DB_IDLE_TRANSACTION_TIMEOUT_MS', 60000, 5000, 300000),
    options: `-c timezone=Africa/Cairo -c statement_timeout=${statementTimeoutMs}`,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err.message);
  });

  async function isPrimaryDbAvailable() {
    try {
      const res = await pool.query('SELECT 1 AS ok');
      return Boolean(res?.rows?.[0]?.ok);
    } catch {
      return false;
    }
  }

  module.exports = {
    _isBranchMode: false,
    pool,
    query: (text, params) => pool.query(text, params),
    transaction: async (callback) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback({
          query: (text, params) => client.query(text, params),
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    isPrimaryDbAvailable,
    close: async () => {
      if (pool) {
        await pool.end();
      }
    },
  };
}
