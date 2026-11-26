/**
 * Elwazeer POS System — Centralized Rotating JSONL Error Logger
 * Writes sanitized, structured error records to <dataDir>/logs/errors.jsonl
 * Works independently of PostgreSQL/SQLite so database outages are always captured.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per log file
const MAX_ROTATED_FILES = 2; // errors.1.jsonl, errors.2.jsonl
const MAX_STRING_LEN = 2000;
const MAX_STACK_LEN = 4000;
const MAX_SANITIZE_DEPTH = 4;

const SENSITIVE_KEY_REGEX = /(password|passwd|secret|token|authorization|cookie|api[_-]?key|sync[_-]?key|base64)/i;
const DEDUP_WINDOW_MS = 15000;
const MAX_BURST_PER_WINDOW = 3;
const MAX_DEDUP_KEYS = 200;
const recentSignatureMap = new Map();

function shouldSuppressBurstError(entry) {
  const sig = `${entry.source || 'server'}|${entry.code || ''}|${entry.path || ''}|${String(entry.rawMessage || entry.message || '').slice(0, 120)}`;
  const now = Date.now();
  const prev = recentSignatureMap.get(sig);
  if (prev && (now - prev.windowStart) < DEDUP_WINDOW_MS) {
    prev.count += 1;
    if (prev.count > MAX_BURST_PER_WINDOW) {
      return true;
    }
    return false;
  }
  if (recentSignatureMap.size >= MAX_DEDUP_KEYS) {
    for (const [k, v] of recentSignatureMap.entries()) {
      if ((now - v.windowStart) >= DEDUP_WINDOW_MS) {
        recentSignatureMap.delete(k);
      }
    }
    if (recentSignatureMap.size >= MAX_DEDUP_KEYS) {
      const oldestKey = recentSignatureMap.keys().next().value;
      if (oldestKey !== undefined) recentSignatureMap.delete(oldestKey);
    }
  }
  recentSignatureMap.set(sig, { windowStart: now, count: 1 });
  return false;
}

function getLogsDir(customDir = null) {
  return customDir || path.join(config.dataDir, 'logs');
}

function getLogFilePath(customDir = null) {
  return path.join(getLogsDir(customDir), 'errors.jsonl');
}

function generateErrorId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ERR-${y}${m}${d}-${suffix}`;
}

function sanitizeValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) {
      return `[REDACTED_DATA_URI:${value.length}chars]`;
    }
    return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}...[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return String(value).slice(0, 200);

  if (depth >= MAX_SANITIZE_DEPTH) return '[MaxDepth]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1, seen));
  }

  const out = {};
  const keys = Object.keys(value).slice(0, 50);
  for (const key of keys) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitizeValue(value[key], depth + 1, seen);
    }
  }
  return out;
}

function rotateIfNeeded(filePath, maxBytes = MAX_LOG_FILE_BYTES) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return;

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    for (let i = MAX_ROTATED_FILES; i >= 1; i -= 1) {
      const target = path.join(dir, `${base}.${i}${ext}`);
      const source = i === 1 ? filePath : path.join(dir, `${base}.${i - 1}${ext}`);
      if (i === MAX_ROTATED_FILES && fs.existsSync(target)) {
        try { fs.unlinkSync(target); } catch {}
      }
      if (fs.existsSync(source)) {
        try { fs.renameSync(source, target); } catch {}
      }
    }
  } catch {
    // Non-blocking: rotation failure must never crash callers
  }
}

function logError(entry = {}, options = {}) {
  const errorId = entry.errorId || generateErrorId();
  if (!options.logsDir && options.dedupe !== false && shouldSuppressBurstError(entry)) {
    return errorId;
  }
  try {
    const dir = getLogsDir(options.logsDir);
    const filePath = getLogFilePath(options.logsDir);
    fs.mkdirSync(dir, { recursive: true });
    rotateIfNeeded(filePath, options.maxBytes || MAX_LOG_FILE_BYTES);

    const record = {
      errorId,
      timestamp: new Date().toISOString(),
      source: String(entry.source || 'server').slice(0, 40),
      level: String(entry.level || 'error').slice(0, 20),
      code: entry.code ? String(entry.code).slice(0, 80) : null,
      statusCode: entry.statusCode ? Number(entry.statusCode) : null,
      message: String(entry.message || 'Unknown error').slice(0, MAX_STRING_LEN),
      rawMessage: entry.rawMessage && entry.rawMessage !== entry.message
        ? String(entry.rawMessage).slice(0, MAX_STRING_LEN)
        : null,
      method: entry.method ? String(entry.method).slice(0, 16) : null,
      path: entry.path ? String(entry.path).slice(0, 500) : null,
      userId: entry.userId !== undefined && entry.userId !== null ? Number(entry.userId) || entry.userId : null,
      username: entry.username ? String(entry.username).slice(0, 100) : null,
      branchId: entry.branchId !== undefined && entry.branchId !== null ? Number(entry.branchId) || entry.branchId : null,
      mode: config.IS_BRANCH_MODE ? 'branch' : 'master',
      stack: entry.stack ? String(entry.stack).slice(0, MAX_STACK_LEN) : null,
      details: entry.details !== undefined && entry.details !== null ? sanitizeValue(entry.details) : null,
    };

    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (writeErr) {
    console.error('[ErrorLogger] Failed to write error log:', writeErr.message);
  }
  return errorId;
}

function readJsonlLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content) return [];
    const lines = content.split('\n');
    const items = [];
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        items.push(JSON.parse(line));
      } catch {
        // Skip malformed partial lines
      }
    }
    return items;
  } catch {
    return [];
  }
}

function readRecentErrors(query = {}, options = {}) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 100, 1), 500);
  const sourceFilter = query.source && query.source !== 'all' ? String(query.source).toLowerCase().trim() : null;
  const levelFilter = query.level && query.level !== 'all' ? String(query.level).toLowerCase().trim() : null;
  const searchFilter = query.search ? String(query.search).toLowerCase().trim() : null;

  const dir = getLogsDir(options.logsDir);
  const candidateFiles = [
    path.join(dir, 'errors.jsonl'),
    path.join(dir, 'errors.1.jsonl'),
    path.join(dir, 'errors.2.jsonl'),
  ];

  const matched = [];
  let totalScanned = 0;

  for (const file of candidateFiles) {
    if (matched.length >= limit) break;
    const records = readJsonlLines(file);
    for (const rec of records) {
      totalScanned += 1;
      if (sourceFilter && String(rec.source || '').toLowerCase() !== sourceFilter) continue;
      if (levelFilter && String(rec.level || '').toLowerCase() !== levelFilter) continue;
      if (searchFilter) {
        const haystack = [
          rec.errorId,
          rec.message,
          rec.rawMessage,
          rec.code,
          rec.path,
          rec.username,
          rec.source,
          rec.stack,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchFilter)) continue;
      }
      matched.push(rec);
      if (matched.length >= limit) break;
    }
  }

  let fileSizeBytes = 0;
  try {
    const primary = path.join(dir, 'errors.jsonl');
    if (fs.existsSync(primary)) fileSizeBytes = fs.statSync(primary).size;
  } catch {}

  return {
    items: matched,
    count: matched.length,
    totalScanned,
    fileSizeBytes,
    logFilePath: getLogFilePath(options.logsDir),
  };
}

function clearErrorLogs(options = {}) {
  const dir = getLogsDir(options.logsDir);
  const files = [
    path.join(dir, 'errors.jsonl'),
    path.join(dir, 'errors.1.jsonl'),
    path.join(dir, 'errors.2.jsonl'),
  ];
  let cleared = 0;
  for (const f of files) {
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        cleared += 1;
      }
    } catch {}
  }
  return { ok: true, cleared };
}

module.exports = {
  MAX_LOG_FILE_BYTES,
  generateErrorId,
  sanitizeValue,
  logError,
  readRecentErrors,
  getLogFilePath,
  clearErrorLogs,
};
