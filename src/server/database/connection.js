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

  // Register custom SQLite functions for seamless Postgres compatibility
  sqliteDb.function('now', () => new Date().toISOString());
  sqliteDb.function('timezone', { varargs: true }, (tz, dt) => dt || new Date().toISOString());
  sqliteDb.function('date_trunc', { varargs: true }, (unit, dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    if (unit === 'month') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (unit === 'year') {
      return `${d.getFullYear()}-01-01`;
    }
    if (unit === 'day') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return dateStr;
  });
  sqliteDb.function('pg_advisory_xact_lock', { varargs: true }, () => 1);
  sqliteDb.function('pg_advisory_lock', { varargs: true }, () => 1);
  sqliteDb.function('pg_advisory_unlock', { varargs: true }, () => 1);

  function translatePgToSqlite(sql) {
    if (typeof sql !== 'string') return { isAdvisoryLock: false, sql };
    let s = sql;
    if (/pg_advisory_xact_lock/i.test(s)) {
      return { isAdvisoryLock: true, sql: 'SELECT 1 AS lock' };
    }

    // Cairo now & date
    s = s.replace(/\(now\(\)\s+AT\s+TIME\s+ZONE\s+'[^']+'\)::date/gi, "date('now', 'localtime')");
    s = s.replace(/\(now\(\)\s+AT\s+TIME\s+ZONE\s+'[^']+'\)/gi, "datetime('now', 'localtime')");

    // ILIKE -> LIKE
    s = s.replace(/\bILIKE\b/gi, 'LIKE');

    // Strip Postgres type casts e.g. ::int, ::date, ::timestamp, ::text, ::numeric
    s = s.replace(/::[a-zA-Z0-9_]+(\s*\[\s*\])?/g, '');

    // Strip FOR UPDATE
    s = s.replace(/\bFOR\s+UPDATE\b/gi, '');

    // json_agg -> json_group_array, json_build_object -> json_object
    s = s.replace(/\bjson_agg\b/gi, 'json_group_array');
    s = s.replace(/\bjson_build_object\b/gi, 'json_object');

    // = ANY($1) -> IN (SELECT value FROM json_each(?1))
    s = s.replace(/=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, 'IN (SELECT value FROM json_each(?$1))');

    // Intervals: col + INTERVAL '1 day' -> datetime(col, '+1 day')
    s = s.replace(/datetime\('now',\s*'localtime'\)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute)s?'/gi, "datetime('now', 'localtime', '+$1 $2')");
    s = s.replace(/date\('now',\s*'localtime'\)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute)s?'/gi, "date('now', 'localtime', '+$1 $2')");
    s = s.replace(/datetime\('now',\s*'localtime'\)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute)s?'/gi, "datetime('now', 'localtime', '-$1 $2')");
    s = s.replace(/date\('now',\s*'localtime'\)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute)s?'/gi, "date('now', 'localtime', '-$1 $2')");

    s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute)s?'/gi, "datetime($1, '+$2 $3')");
    s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute)s?'/gi, "datetime($1, '-$2 $3')");

    // Intervals with param multiplication: date - ($1 * INTERVAL '1 day') -> datetime(date, '-' || $1 || ' day')
    s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*-\s*\(\s*(\$\d+|\d+)\s*\*\s*INTERVAL\s+'1\s*day'\s*\)/gi, "datetime($1, '-' || $2 || ' day')");
    s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*\+\s*\(\s*(\$\d+|\d+)\s*\*\s*INTERVAL\s+'1\s*day'\s*\)/gi, "datetime($1, '+' || $2 || ' day')");

    // $1 -> ?1
    s = s.replace(/\$(\d+)/g, '?$1');
    return { isAdvisoryLock: false, sql: s };
  }

  function executeSqliteQuery(rawSql, params = []) {
    const { isAdvisoryLock, sql } = translatePgToSqlite(rawSql);
    if (isAdvisoryLock) {
      return { rows: [{ pg_advisory_xact_lock: 1 }], rowCount: 1 };
    }

    const normalizedParams = (params || []).map((p) => {
      if (p instanceof Date) return p.toISOString();
      if (Array.isArray(p)) return JSON.stringify(p);
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p === undefined) return null;
      return p;
    });

    const trimmed = sql.trim();
    const isSelect = /^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(trimmed);
    const hasReturning = /\bRETURNING\b/i.test(trimmed);

    const stmt = sqliteDb.prepare(sql);

    if (isSelect || hasReturning) {
      const rawRows = stmt.all(...normalizedParams);
      const rows = rawRows.map((r) => ({ ...r }));
      return { rows, rowCount: rows.length };
    } else {
      const res = stmt.run(...normalizedParams);
      return { rows: [], rowCount: res.changes, lastInsertRowid: res.lastInsertRowid };
    }
  }

  module.exports = {
    _isBranchMode: true,
    sqlite: sqliteDb,
    query: async (text, params = []) => {
      return executeSqliteQuery(text, params);
    },
    transaction: async (callback) => {
      sqliteDb.exec('BEGIN IMMEDIATE');
      try {
        const tx = {
          query: async (text, params = []) => executeSqliteQuery(text, params),
        };
        const result = await callback(tx);
        sqliteDb.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          sqliteDb.exec('ROLLBACK');
        } catch {}
        throw err;
      }
    },
    isPrimaryDbAvailable: async () => {
      try {
        const res = sqliteDb.prepare('SELECT 1 AS ok').get();
        return Boolean(res?.ok);
      } catch {
        return false;
      }
    },
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
