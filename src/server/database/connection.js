const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');

let pool = null;
let sqliteDb = null;

function replaceExtract(sql) {
  let result = '';
  let i = 0;
  while (i < sql.length) {
    const match = sql.slice(i).match(/^EXTRACT\s*\(\s*([a-zA-Z_]+)\s+FROM\s+/i);
    if (!match) {
      result += sql[i];
      i++;
      continue;
    }
    const unit = match[1].toUpperCase();
    const startInner = i + match[0].length;
    let depth = 1;
    let j = startInner;
    while (j < sql.length && depth > 0) {
      if (sql[j] === '(') depth++;
      else if (sql[j] === ')') depth--;
      if (depth === 0) break;
      j++;
    }
    const innerExpr = sql.slice(startInner, j).trim();
    i = j + 1; // skip closing ')'

    if (unit === 'EPOCH') {
      if (/^(?:now\(\)|current_timestamp)$/i.test(innerExpr)) {
        result += 'unixepoch()';
      } else {
        let clean = innerExpr.trim();
        if (clean.startsWith('(') && clean.endsWith(')')) {
          clean = clean.slice(1, -1).trim();
        }
        let depthSub = 0;
        let minusIdx = -1;
        for (let k = 0; k < clean.length; k++) {
          if (clean[k] === '(') depthSub++;
          else if (clean[k] === ')') depthSub--;
          else if (depthSub === 0 && clean[k] === '-') {
            minusIdx = k;
            break;
          }
        }
        if (minusIdx !== -1) {
          const left = clean.slice(0, minusIdx).trim();
          const right = clean.slice(minusIdx + 1).trim();
          result += `(unixepoch(${left}) - unixepoch(${right}))`;
        } else {
          result += `unixepoch(${innerExpr})`;
        }
      }
    } else if (unit === 'DAY') {
      result += `CAST(strftime('%d', ${innerExpr}) AS INTEGER)`;
    } else if (unit === 'MONTH') {
      result += `CAST(strftime('%m', ${innerExpr}) AS INTEGER)`;
    } else if (unit === 'YEAR') {
      result += `CAST(strftime('%Y', ${innerExpr}) AS INTEGER)`;
    } else if (unit === 'HOUR') {
      result += `CAST(strftime('%H', ${innerExpr}) AS INTEGER)`;
    } else if (unit === 'MINUTE') {
      result += `CAST(strftime('%M', ${innerExpr}) AS INTEGER)`;
    } else if (unit === 'SECOND') {
      result += `CAST(strftime('%S', ${innerExpr}) AS INTEGER)`;
    } else if (unit === 'DOW') {
      result += `CAST(strftime('%w', ${innerExpr}) AS INTEGER)`;
    } else {
      result += `unixepoch(${innerExpr})`;
    }
  }
  return result;
}

function ensureSqliteColumn(sqlite, table, column, typeDef) {
  try {
    const tableExists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!tableExists) return;
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name.toLowerCase());
    if (!cols.includes(column.toLowerCase())) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
    }
  } catch {}
}

function ensureSqliteCoreColumns(sqlite) {
  if (!sqlite) return;
  ensureSqliteColumn(sqlite, 'inventory', 'color_id', 'INTEGER');
  ensureSqliteColumn(sqlite, 'inventory', 'size_id', 'INTEGER');
  ensureSqliteColumn(sqlite, 'inventory', 'gender', "TEXT DEFAULT 'both'");
  ensureSqliteColumn(sqlite, 'inventory', 'wholesale_price', 'REAL DEFAULT 0');
  ensureSqliteColumn(sqlite, 'inventory', 'semi_wholesale_price', 'REAL DEFAULT 0');
  ensureSqliteColumn(sqlite, 'rental_inventory', 'color_id', 'INTEGER');
  ensureSqliteColumn(sqlite, 'rental_inventory', 'size_id', 'INTEGER');
  ensureSqliteColumn(sqlite, 'rental_inventory', 'gender', "TEXT DEFAULT 'both'");
  ensureSqliteColumn(sqlite, 'order_items', 'size', 'TEXT');
  ensureSqliteColumn(sqlite, 'returns', 'refund_method', "TEXT DEFAULT 'cash'");
  ensureSqliteColumn(sqlite, 'users', 'full_name', 'TEXT');
  ensureSqliteColumn(sqlite, 'users', 'branch_scope', "TEXT DEFAULT 'single'");
  ensureSqliteColumn(sqlite, 'users', 'branch_ids', "TEXT DEFAULT '[]'");
  ensureSqliteColumn(sqlite, 'users', 'token_version', 'INTEGER DEFAULT 1');
  ensureSqliteColumn(sqlite, 'users', 'created_at', "TEXT DEFAULT CURRENT_TIMESTAMP");
  ensureSqliteColumn(sqlite, 'branches', 'rentals_enabled', 'INTEGER DEFAULT 1');
  ensureSqliteColumn(sqlite, 'branches', 'allowed_gender', "TEXT DEFAULT 'both'");
  ensureSqliteColumn(sqlite, 'branches', 'cashier_footer', 'TEXT');
  ensureSqliteColumn(sqlite, 'branches', 'rental_footer', 'TEXT');
}

function registerSqliteFunctions(dbInstance) {
  if (!dbInstance || dbInstance._functionsRegistered) return;
  dbInstance._functionsRegistered = true;

  dbInstance.function('regexp', (pattern, val) => {
    try {
      return new RegExp(pattern).test(String(val ?? '')) ? 1 : 0;
    } catch {
      return 0;
    }
  });
  dbInstance.function('gen_random_uuid', () => crypto.randomUUID());
  dbInstance.function('now', () => new Date().toISOString());
  dbInstance.function('timezone', { varargs: true }, (tz, dt) => dt || new Date().toISOString());
  dbInstance.function('date_trunc', { varargs: true }, (unit, dateStr) => {
    if (!dateStr) return null;
    const str = String(dateStr).trim();
    if (unit === 'month') return str.slice(0, 7) + '-01';
    if (unit === 'year') return str.slice(0, 4) + '-01-01';
    if (unit === 'day') return str.slice(0, 10);
    return str;
  });
  dbInstance.function('greatest', { varargs: true }, (...args) => {
    const nonNull = args.filter((a) => a !== null && a !== undefined);
    return nonNull.length ? Math.max(...nonNull) : null;
  });
  dbInstance.function('least', { varargs: true }, (...args) => {
    const nonNull = args.filter((a) => a !== null && a !== undefined);
    return nonNull.length ? Math.min(...nonNull) : null;
  });
  dbInstance.function('concat', { varargs: true }, (...args) => {
    return args.map((a) => a ?? '').join('');
  });
  dbInstance.function('concat_ws', { varargs: true }, (sep, ...args) => {
    return args.filter((a) => a !== null && a !== undefined).join(sep || '');
  });
  dbInstance.function('pg_advisory_xact_lock', { varargs: true }, () => 1);
  dbInstance.function('pg_advisory_lock', { varargs: true }, () => 1);
  dbInstance.function('pg_advisory_unlock', { varargs: true }, () => 1);
  dbInstance.function('setval', { varargs: true }, () => 1);
  dbInstance.function('pg_get_serial_sequence', { varargs: true }, () => '');
  dbInstance.function('to_char', { varargs: true }, (val, fmt) => {
    if (!val) return null;
    if (typeof val === 'number' && typeof fmt === 'string' && !fmt.startsWith('YY') && !fmt.startsWith('HH')) {
      return String(val);
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    if (fmt === 'YYYY-MM-DD') return d.toISOString().slice(0, 10);
    if (fmt === 'YYYY-MM') return d.toISOString().slice(0, 7);
    if (fmt === 'HH24:MI') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (fmt === 'HH12:MI AM') {
      const hours = d.getHours();
      const h12 = hours % 12 || 12;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
    }
    return String(val);
  });
}

function translatePgToSqlite(sql) {
  if (typeof sql !== 'string') return { isAdvisoryLock: false, sql };
  let s = replaceExtract(sql);
  if (/pg_advisory(?:_xact)?_lock/i.test(s)) {
    return { isAdvisoryLock: true, sql: 'SELECT 1 AS lock' };
  }

  // TRUNCATE TABLE t1, t2 ... RESTART IDENTITY CASCADE -> DELETE FROM ...
  s = s.replace(/\bTRUNCATE\s+(?:TABLE\s+)?([\w\s,]+?)(?:\s+RESTART\s+IDENTITY)?(?:\s+CASCADE)?\s*(?:;|$)/gi, (match, tableList) => {
    const tables = tableList.split(',').map((t) => t.trim()).filter(Boolean);
    const deleteStmts = tables.map((t) => `DELETE FROM ${t};`).join(' ');
    const resetSeq = `DELETE FROM sqlite_sequence WHERE name IN (${tables.map((t) => `'${t}'`).join(', ')});`;
    return `${deleteStmts} ${resetSeq}`;
  });

  // Cairo now & date
  s = s.replace(/\(now\(\)\s+AT\s+TIME\s+ZONE\s+'[^']+'\)::date/gi, "date('now', 'localtime')");
  s = s.replace(/\(now\(\)\s+AT\s+TIME\s+ZONE\s+'[^']+'\)/gi, "datetime('now', 'localtime')");

  // Column-level and general timezone: strip AT TIME ZONE '...'
  s = s.replace(/\s+AT\s+TIME\s+ZONE\s+'[^']+'/gi, '');

  // INSERT INTO ... SELECT ... ON CONFLICT DO NOTHING -> INSERT OR IGNORE INTO ... SELECT ...
  s = s.replace(/INSERT\s+INTO\s+([a-zA-Z_]\w*(?:\s*\([^)]+\))?)\s+SELECT\s+([\s\S]+?)\s+ON\s+CONFLICT(?:\s*\([^)]*(?:\([^)]*\)[^)]*)*\))?\s+DO\s+NOTHING/gi, 'INSERT OR IGNORE INTO $1 SELECT $2');

  // POSIX regex pattern translation: (\w+) ~ 'pattern' -> regexp('pattern', $1)
  s = s.replace(/([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*~\s*'([^']+)'/g, "regexp('$2', $1)");
  s = s.replace(/([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*!~\s*'([^']+)'/g, "(NOT regexp('$2', $1))");

  // ILIKE -> LIKE
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // Strip DISTINCT ON (...) -> DISTINCT
  s = s.replace(/\bDISTINCT\s+ON\s*\([^)]+\)/gi, 'DISTINCT');

  // GREATEST -> MAX, LEAST -> MIN (SQLite scalar equivalents)
  s = s.replace(/\bGREATEST\b/gi, 'MAX');
  s = s.replace(/\bLEAST\b/gi, 'MIN');
  s = s.replace(/\bBOOL_OR\b/gi, 'MAX');
  s = s.replace(/\bBOOL_AND\b/gi, 'MIN');

  // Translate integer type casts e.g. column::bigint, column::int -> CAST(column AS INTEGER)
  s = s.replace(/([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)::(?:int|integer|bigint|smallint)\b/gi, 'CAST($1 AS INTEGER)');

  // Rental date subtraction translation using julianday (must run before ::date translation)
  s = s.replace(/\b(?:GREATEST|MAX)\s*\(\s*\(\s*([^()]+?)\s*-\s*([^()]+?)\s*\)\s*,\s*0\s*\)/gi,
    (match, left, right) => {
      const cleanLeft = left.replace(/::date\b/gi, '').trim();
      const cleanRight = right.replace(/::date\b/gi, '').trim();
      return `MAX(CAST(julianday(${cleanLeft}) - julianday(${cleanRight}) AS INTEGER), 0)`;
    });
  s = s.replace(/\(\s*(date\('now',\s*'localtime'\))\s*-\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*\)/gi,
    "CAST(julianday($1) - julianday($2) AS INTEGER)");
  s = s.replace(/\(\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*-\s*(date\('now',\s*'localtime'\))\s*\)/gi,
    "CAST(julianday($1) - julianday($2) AS INTEGER)");
  s = s.replace(/\(\s*([a-zA-Z_]\w*\.[a-zA-Z_]*date)\s*-\s*([a-zA-Z_]\w*\.[a-zA-Z_]*date)\s*\)/gi,
    "CAST(julianday($1) - julianday($2) AS INTEGER)");

  // Translate ::date type casts to date(...) so timestamps are properly truncated to YYYY-MM-DD in SQLite
  for (let iter = 0; iter < 2; iter++) {
    s = s.replace(/(?:([a-zA-Z0-9_]+\s*\([^()]*\))|(\([^()]+\))|(\'[^\']+\')|(\$[0-9]+)|([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)?))::date\b/gi, (match, fn, paren, lit, param, col) => {
      const expr = fn || paren || lit || param || col;
      return `date(${expr})`;
    });
  }

  // Strip Postgres type casts e.g. ::int, ::date, ::timestamp, ::text, ::numeric
  s = s.replace(/::(?:double\s+precision|character\s+varying|[a-zA-Z0-9_]+)(?:\s*\[\s*\])?/g, '');

  // Strip FOR UPDATE
  s = s.replace(/\bFOR\s+(?:NO\s+KEY\s+|KEY\s+)?(?:UPDATE|SHARE)\b/gi, '');

  // json_agg -> json_group_array, json_build_object -> json_object, json_object_agg -> json_group_object
  s = s.replace(/\bjson_agg\b/gi, 'json_group_array');
  s = s.replace(/\barray_agg\b/gi, 'json_group_array');
  s = s.replace(/\bjson_build_object\b/gi, 'json_object');
  s = s.replace(/\bjson_object_agg\b/gi, 'json_group_object');

  // = ANY($1) -> IN (SELECT value FROM json_each(?1))
  s = s.replace(/=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, 'IN (SELECT value FROM json_each(?$1))');
  s = s.replace(/(!=|<>)\s*ALL\s*\(\s*\$(\d+)\s*\)/gi, 'NOT IN (SELECT value FROM json_each(?$2))');

  // EXTRACT translations to SQLite equivalents
  // STRING_AGG translations (with ORDER BY support)
  s = s.replace(/STRING_AGG\s*\(\s*DISTINCT\s+([^,]+?)\s*,\s*('[^']+')(?:(?:\s+ORDER\s+BY\s+(?:[^()]+|\([^()]*\))+)?)\s*\)(?:\s*FILTER\s*\(\s*WHERE\s+[^)]+\))?/gi, "replace(group_concat(DISTINCT $1), ',', $2)");
  s = s.replace(/STRING_AGG\s*\(\s*([^,]+?)\s*,\s*('[^']+')(?:(?:\s+ORDER\s+BY\s+(?:[^()]+|\([^()]*\))+)?)\s*\)(?:\s*FILTER\s*\(\s*WHERE\s+[^)]+\))?/gi, "group_concat($1, $2)");

  // Handle NOW() / CURRENT_TIMESTAMP - INTERVAL 'X unit(s)'
  s = s.replace(/\b(?:now\(\)|current_timestamp)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "datetime('now', '-$1 $2')");
  s = s.replace(/\b(?:now\(\)|current_timestamp)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "datetime('now', '+$1 $2')");

  // Intervals: col + INTERVAL '1 day' -> datetime(col, '+1 day')
  s = s.replace(/datetime\('now',\s*'localtime'\)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "datetime('now', 'localtime', '+$1 $2')");
  s = s.replace(/date\('now',\s*'localtime'\)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "date('now', 'localtime', '+$1 $2')");
  s = s.replace(/datetime\('now',\s*'localtime'\)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "datetime('now', 'localtime', '-$1 $2')");
  s = s.replace(/date\('now',\s*'localtime'\)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "date('now', 'localtime', '-$1 $2')");

  // Handle DATE_TRUNC(...) +/- INTERVAL 'X unit'
  s = s.replace(/(DATE_TRUNC\s*\([^)]*(?:\([^)]*\)[^)]*)*\))\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "date($1, '+$2 $3')");
  s = s.replace(/(DATE_TRUNC\s*\([^)]*(?:\([^)]*\)[^)]*)*\))\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "date($1, '-$2 $3')");

  // Handle 'literal' +/- INTERVAL 'X unit'
  s = s.replace(/('[^']+')\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "date($1, '+$2 $3')");
  s = s.replace(/('[^']+')\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "date($1, '-$2 $3')");

  s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*\+\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "datetime($1, '+$2 $3')");
  s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*-\s*INTERVAL\s+'(\d+)\s*(day|month|year|hour|minute|second)s?'/gi, "datetime($1, '-$2 $3')");

  // Intervals with param multiplication: date - ($1 * INTERVAL '1 day') -> datetime(date, '-' || $1 || ' day')
  s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*-\s*\(\s*(\$\d+|\d+)\s*\*\s*INTERVAL\s+'1\s*day'\s*\)/gi, "datetime($1, '-' || $2 || ' day')");
  s = s.replace(/(\$\d+|\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*\+\s*\(\s*(\$\d+|\d+)\s*\*\s*INTERVAL\s+'1\s*day'\s*\)/gi, "datetime($1, '+' || $2 || ' day')");

  // $1 -> ?1
  s = s.replace(/\$(\d+)/g, '?$1');
  return { isAdvisoryLock: false, sql: s };
}

let txMutex = Promise.resolve();

if (config.IS_BRANCH_MODE) {
  // Branch Mode - SQLite Adapter
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(config.BRANCH_SQLITE_PATH), { recursive: true });
  sqliteDb = new DatabaseSync(config.BRANCH_SQLITE_PATH);
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec('PRAGMA busy_timeout = 5000;');
  ensureSqliteCoreColumns(sqliteDb);
  registerSqliteFunctions(sqliteDb);

  // Register custom SQLite functions for seamless Postgres compatibility
  sqliteDb.function('regexp', (pattern, val) => {
    try {
      return new RegExp(pattern).test(String(val ?? '')) ? 1 : 0;
    } catch {
      return 0;
    }
  });
  sqliteDb.function('gen_random_uuid', () => crypto.randomUUID());
  sqliteDb.function('now', () => new Date().toISOString());
  sqliteDb.function('timezone', { varargs: true }, (tz, dt) => dt || new Date().toISOString());
  sqliteDb.function('date_trunc', { varargs: true }, (unit, dateStr) => {
    if (!dateStr) return null;
    const str = String(dateStr).trim();
    if (unit === 'month') {
      return str.slice(0, 7) + '-01';
    }
    if (unit === 'year') {
      return str.slice(0, 4) + '-01-01';
    }
    if (unit === 'day') {
      return str.slice(0, 10);
    }
    return str;
  });
  sqliteDb.function('pg_advisory_xact_lock', { varargs: true }, () => 1);
  sqliteDb.function('pg_advisory_lock', { varargs: true }, () => 1);
  sqliteDb.function('pg_advisory_unlock', { varargs: true }, () => 1);
  sqliteDb.function('setval', { varargs: true }, () => 1);
  sqliteDb.function('pg_get_serial_sequence', { varargs: true }, () => '');
  sqliteDb.function('to_char', { varargs: true }, (val, fmt) => {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    if (fmt === 'YYYY-MM-DD') {
      return d.toISOString().slice(0, 10);
    }
    if (fmt === 'YYYY-MM') {
      return d.toISOString().slice(0, 7);
    }
    if (fmt === 'HH24:MI') {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (fmt === 'HH12:MI AM') {
      const hours = d.getHours();
      const h12 = hours % 12 || 12;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
    }
    return String(val);
  });

  function executeSqliteQuery(targetDb, rawSql, params = []) {
    const sDb = targetDb || sqliteDb;
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

    let maxParamIdx = 0;
    const numberedMatches = sql.match(/\?(\d+)/g);
    if (numberedMatches) {
      for (const m of numberedMatches) {
        const idx = parseInt(m.slice(1), 10);
        if (idx > maxParamIdx) maxParamIdx = idx;
      }
    } else {
      const qMatches = sql.match(/\?/g);
      if (qMatches) maxParamIdx = qMatches.length;
    }
    const safeParams = maxParamIdx > 0 ? normalizedParams.slice(0, maxParamIdx) : [];

    // Support multiple statements (e.g. TRUNCATE translations or batch resets)
    if (safeParams.length === 0 && !isSelect && !hasReturning && sql.includes(';')) {
      const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
      if (statements.length > 1) {
        sDb.exec(sql);
        return { rows: [], rowCount: statements.length };
      }
    }

    const stmt = sDb.prepare(sql);

    if (isSelect || hasReturning) {
      const rawRows = stmt.all(...safeParams);
      const rows = rawRows.map((r) => ({ ...r }));
      return { rows, rowCount: rows.length };
    } else {
      const res = stmt.run(...safeParams);
      return { rows: [], rowCount: res.changes, lastInsertRowid: res.lastInsertRowid };
    }
  }

  module.exports = {
    _isBranchMode: true,
    sqlite: sqliteDb,
    query: async (text, params = []) => {
      return executeSqliteQuery(module.exports.sqlite || sqliteDb, text, params);
    },
    transaction: async (callback) => {
      let unlock;
      const prevLock = txMutex;
      txMutex = new Promise((resolve) => { unlock = resolve; });
      await prevLock;

      const sDb = module.exports.sqlite || sqliteDb;
      sDb.exec('BEGIN IMMEDIATE');
      try {
        const tx = {
          _isBranchMode: true,
          sqlite: sDb,
          query: async (text, params = []) => executeSqliteQuery(sDb, text, params),
        };
        const result = await callback(tx);
        sDb.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          sDb.exec('ROLLBACK');
        } catch {}
        throw err;
      } finally {
        unlock();
      }
    },
    isPrimaryDbAvailable: async () => {
      try {
        const res = (module.exports.sqlite || sqliteDb).prepare('SELECT 1 AS ok').get();
        return Boolean(res?.ok);
      } catch (err) {
        return false;
      }
    },
    getLastDbError: () => null,
    translatePgToSqlite,
    close: async () => {
      try {
        (module.exports.sqlite || sqliteDb).close();
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

  let lastDbError = null;

  async function isPrimaryDbAvailable() {
    try {
      const res = await pool.query('SELECT 1 AS ok');
      lastDbError = null;
      return Boolean(res?.rows?.[0]?.ok);
    } catch (err) {
      lastDbError = err.message;
      return false;
    }
  }

  function getLastDbError() {
    return lastDbError;
  }

  function executeSqliteQuery(targetDb, rawSql, params = []) {
    const sDb = targetDb;
    if (!sDb) throw new Error('No SQLite database attached for branch query execution');
    registerSqliteFunctions(sDb);
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

    let maxParamIdx = 0;
    const numberedMatches = sql.match(/\?(\d+)/g);
    if (numberedMatches) {
      for (const m of numberedMatches) {
        const idx = parseInt(m.slice(1), 10);
        if (idx > maxParamIdx) maxParamIdx = idx;
      }
    } else {
      const qMatches = sql.match(/\?/g);
      if (qMatches) maxParamIdx = qMatches.length;
    }
    const safeParams = maxParamIdx > 0 ? normalizedParams.slice(0, maxParamIdx) : [];

    const stmt = sDb.prepare(sql);

    if (isSelect || hasReturning) {
      const rawRows = stmt.all(...safeParams);
      const rows = rawRows.map((r) => ({ ...r }));
      return { rows, rowCount: rows.length };
    } else {
      const res = stmt.run(...safeParams);
      return { rows: [], rowCount: res.changes, lastInsertRowid: res.lastInsertRowid };
    }
  }

  module.exports = {
    _isBranchMode: false,
    pool,
    sqlite: null,
    query: (text, params = []) => {
      if (module.exports.sqlite && typeof text === 'string' && /sync_queue/i.test(text)) {
        return executeSqliteQuery(module.exports.sqlite, text, params);
      }
      return pool.query(text, params);
    },
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
    getLastDbError,
    translatePgToSqlite,
    close: async () => {
      if (pool) {
        await pool.end();
      }
    },
  };
}
