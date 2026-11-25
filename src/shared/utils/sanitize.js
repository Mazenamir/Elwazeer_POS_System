/**
 * Shared PostgreSQL / SQLite input & sync payload sanitizers.
 * Prevents PostgreSQL 22P02 (invalid_text_representation) errors across
 * ::date, ::time, ::timestamp, ::timestamptz, ::uuid, ::numeric, and ::integer columns.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JUNK_STRINGS = new Set(['', 'null', 'undefined', 'nan', 'invalid date', 'infinity', '-infinity']);

function isJunkValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    return JUNK_STRINGS.has(val.trim().toLowerCase());
  }
  if (typeof val === 'number') {
    return !Number.isFinite(val);
  }
  return false;
}

function sanitizeUuid(val) {
  if (isJunkValue(val)) return null;
  const s = String(val).trim();
  return UUID_REGEX.test(s) ? s : null;
}

function sanitizeTime(val) {
  if (isJunkValue(val)) return null;
  const raw = String(val).trim();
  const match = raw.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(AM|PM|ص|م)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const rawMeridiem = match[4] ? match[4].toUpperCase() : null;
  const meridiem = rawMeridiem === 'ص' ? 'AM' : (rawMeridiem === 'م' ? 'PM' : rawMeridiem);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else {
    if (hours === 24) hours = 0;
    if (hours < 0 || hours > 23) return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sanitizeDate(val) {
  if (isJunkValue(val)) return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCFullYear() === y && check.getUTCMonth() + 1 === m && check.getUTCDate() === d) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      }
    }
    return null;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    if (y >= 1900 && y <= 2200) return `${y}-${m}-${d}`;
  }
  return null;
}

function sanitizeTimestamp(val) {
  if (isJunkValue(val)) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString();
  }
  const str = String(val).trim();
  // Pure YYYY-MM-DD is valid for PG ::timestamp / ::timestamptz as well
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return sanitizeDate(str);
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    if (y >= 1900 && y <= 2200) return parsed.toISOString();
  }
  return null;
}

function sanitizeNumber(val, fallback = null) {
  if (isJunkValue(val)) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeInt(val, fallback = null) {
  const n = sanitizeNumber(val, null);
  return n !== null ? Math.round(n) : fallback;
}

const TIME_FIELDS = new Set([
  'check_in',
  'check_out',
  'shift_start',
  'shift_end',
  'start_time',
  'end_time',
]);

const DATE_FIELDS = new Set([
  'date',
  'join_date',
  'end_date',
  'expense_date',
  'transaction_date',
  'delivery_date',
  'rental_date',
  'expected_return_date',
  'actual_return_date',
  'actual_pickup_date',
  'due_date',
  'recorded_date',
  'event_date',
  'wedding_date',
]);

const TIMESTAMP_FIELDS = new Set([
  'created_at',
  'updated_at',
  'prepared_at',
  'order_date',
  'return_date',
  'payment_date',
  'synced_at',
  'applied_at',
]);

const STRICT_UUID_FIELDS = new Set([
  'rental_group_uuid',
  'purchase_batch_id',
]);

function sanitizeObjectFields(obj, entityType, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectFields(item, entityType, depth + 1));
  }

  const out = { ...obj };
  for (const [key, val] of Object.entries(out)) {
    if (val === undefined) continue;

    if (Array.isArray(val)) {
      out[key] = val.map((item) =>
        item && typeof item === 'object' ? sanitizeObjectFields(item, entityType, depth + 1) : item
      );
      continue;
    }

    if (val && typeof val === 'object' && !(val instanceof Date)) {
      out[key] = sanitizeObjectFields(val, entityType, depth + 1);
      continue;
    }

    if (TIME_FIELDS.has(key)) {
      out[key] = sanitizeTime(val);
    } else if (DATE_FIELDS.has(key)) {
      // rental return_date is a DATE on rentals, while returns.return_date is a TIMESTAMP
      out[key] = sanitizeDate(val);
    } else if (TIMESTAMP_FIELDS.has(key)) {
      if (key === 'return_date' && entityType === 'rental') {
        out[key] = sanitizeDate(val);
      } else {
        out[key] = sanitizeTimestamp(val);
      }
    } else if (STRICT_UUID_FIELDS.has(key)) {
      out[key] = sanitizeUuid(val);
    } else if (key === 'offline_uuid' && entityType !== 'employee') {
      out[key] = sanitizeUuid(val);
    } else if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'nan' || lower === 'invalid date' || lower === 'undefined' || lower === 'null') {
        out[key] = null;
      }
    }
  }
  return out;
}

function sanitizeSyncPayload(entityType, rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return {};
  return sanitizeObjectFields(rawPayload, entityType, 0);
}

module.exports = {
  UUID_REGEX,
  isJunkValue,
  sanitizeUuid,
  sanitizeTime,
  sanitizeDate,
  sanitizeTimestamp,
  sanitizeNumber,
  sanitizeInt,
  sanitizeSyncPayload,
};
