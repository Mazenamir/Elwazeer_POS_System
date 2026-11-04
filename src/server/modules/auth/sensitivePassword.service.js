/**
 * Elwazeer POS System — Sensitive Operations Security & Approval Tokens
 * Protects:
 *   1. Profit analytics
 *   2. Invoice editing
 *   3. Invoice returns / refunds
 *   4. Inventory management (edit, delete, duplicate)
 *   5. Salary / Payroll access
 *
 * Implements:
 *   - Secure bcrypt hashing
 *   - Brute-force rate limiting & lockout
 *   - Short-lived, single-use, cryptographically signed approval tokens
 *   - Audit logging of all attempts and approvals
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../database/connection');
const config = require('../../config/env');
const auditService = require('../audit/audit.service');

// In-memory lockout tracker: key -> { count, lockedUntil }
const sensitiveAttempts = new Map();
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

// Single-use consumed tokens set: tokenJti -> expiryTimestamp
const consumedTokens = new Map();

// Periodic cleanup of consumed tokens
setInterval(() => {
  const now = Date.now();
  for (const [jti, expiresAt] of consumedTokens.entries()) {
    if (expiresAt < now) consumedTokens.delete(jti);
  }
}, 60000).unref();

const PASSWORD_KEY_MAP = {
  profit: 'profit_password',
  invoice_edit: 'invoice_edit_password',
  return: 'return_password',
  inventory: 'inventory_password',
  salary: 'salary_password',
};

function getAttemptKeys(type, ip, userId) {
  const keys = [];
  keys.push(`${type}:${userId || 'anon'}:${ip || 'unknown'}`);
  if (userId) keys.push(`${type}:user:${userId}`);
  if (ip && ip !== 'unknown') keys.push(`${type}:ip:${ip}`);
  return keys;
}

function getLockoutStatus(type, ip, userId) {
  const keys = getAttemptKeys(type, ip, userId);
  let maxCount = 0;
  let lockedUntil = null;
  const now = Date.now();

  for (const key of keys) {
    const record = sensitiveAttempts.get(key);
    if (record) {
      if (record.count > maxCount) maxCount = record.count;
      if (record.lockedUntil && record.lockedUntil > now) {
        if (!lockedUntil || record.lockedUntil > lockedUntil) {
          lockedUntil = record.lockedUntil;
        }
      }
    }
  }

  const locked = Boolean(lockedUntil && lockedUntil > now);
  const remaining_seconds = locked ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  return {
    locked,
    remaining_seconds,
    failed_attempts: maxCount,
  };
}

function checkLockout(type, ip, userId) {
  const keys = getAttemptKeys(type, ip, userId);
  for (const key of keys) {
    const record = sensitiveAttempts.get(key);
    if (record && record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingMin = Math.ceil((record.lockedUntil - Date.now()) / 60000);
      const err = new Error(`تم إيقاف المحاولات مؤقتاً بسبب تكرار الخطأ. حاول بعد ${remainingMin} دقيقة`);
      err.statusCode = 429;
      throw err;
    }
  }
}

function recordAttempt(type, ip, userId, success) {
  const keys = getAttemptKeys(type, ip, userId);
  for (const key of keys) {
    if (success) {
      sensitiveAttempts.delete(key);
    } else {
      const prev = sensitiveAttempts.get(key) || { count: 0, lockedUntil: null };
      const newCount = prev.count + 1;
      if (newCount >= MAX_VERIFY_ATTEMPTS) {
        sensitiveAttempts.set(key, { count: newCount, lockedUntil: Date.now() + LOCKOUT_MS });
      } else {
        sensitiveAttempts.set(key, { count: newCount, lockedUntil: null });
      }
    }
  }
}

/**
 * Retrieves the stored bcrypt hash for a given password type.
 * Also checks legacy plain setting, upgrading it to bcrypt if found.
 */
async function getStoredPasswordHash(type) {
  const baseKey = PASSWORD_KEY_MAP[type] || `${type}_password`;
  const hashKey = `${baseKey}_hash`;

  let hashVal = null;
  let legacyVal = null;

  if (config.IS_BRANCH_MODE) {
    if (!db.sqlite) return null;
    const hashRow = db.sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(hashKey);
    if (hashRow?.value) hashVal = hashRow.value;
    const legacyRow = db.sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(baseKey);
    if (legacyRow?.value) legacyVal = legacyRow.value;
  } else {
    const { rows } = await db.query(
      'SELECT key, value FROM settings WHERE key IN ($1, $2)',
      [hashKey, baseKey]
    );
    for (const r of rows) {
      if (r.key === hashKey) hashVal = r.value;
      if (r.key === baseKey) legacyVal = r.value;
    }
  }

  if (hashVal && (hashVal.startsWith('$2a$') || hashVal.startsWith('$2b$'))) {
    return hashVal;
  }

  // If hashVal is not set but legacyVal exists, upgrade it
  if (legacyVal) {
    if (legacyVal.startsWith('$2a$') || legacyVal.startsWith('$2b$')) {
      return legacyVal;
    }
    // Upgrade legacy plain value to hash in settings table
    const newHash = await bcrypt.hash(legacyVal, 10);
    try {
      if (config.IS_BRANCH_MODE) {
        db.sqlite.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(hashKey, newHash);
      } else {
        await db.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [hashKey, newHash]
        );
      }
    } catch {}
    return newHash;
  }

  return null;
}

/**
 * Verifies a sensitive password against its stored hash
 */
async function verifyPassword(type, inputPassword, context = {}) {
  const { user = null, req = null, resourceId = null, branchId = null } = context;
  const ip = req?.ip || req?.socket?.remoteAddress || null;
  const userId = user?.id || null;
  const username = user?.username || 'system';

  if (!inputPassword && inputPassword !== 0) {
    return false;
  }

  checkLockout(type, ip, userId);

  const cleanPassword = String(inputPassword).trim();
  const storedHash = await getStoredPasswordHash(type);

  if (!storedHash) {
    recordAttempt(type, ip, userId, false);
    await auditService.log({
      userId,
      username,
      action: `sensitive_auth_failed_${type}`,
      resourceType: type,
      resourceId,
      branchId: branchId || user?.branch_id,
      outcome: 'failure',
      details: { reason: 'Password not configured' },
      ipAddress: ip,
    });
    const err = new Error('لم يتم تعيين كلمة المرور لهذه العملية بعد. يرجى من مدير النظام تعيينها من شاشة الإعدادات');
    err.statusCode = 403;
    err.code = 'PASSWORD_NOT_CONFIGURED';
    throw err;
  }

  let isValid = false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    isValid = await bcrypt.compare(cleanPassword, storedHash);
  } else {
    isValid = cleanPassword === storedHash;
  }

  recordAttempt(type, ip, userId, isValid);

  await auditService.log({
    userId,
    username,
    action: isValid ? `sensitive_auth_success_${type}` : `sensitive_auth_failed_${type}`,
    resourceType: type,
    resourceId,
    branchId: branchId || user?.branch_id,
    outcome: isValid ? 'success' : 'failure',
    details: { type },
    ipAddress: ip,
  });

  return isValid;
}

/**
 * Creates a cryptographically signed, short-lived approval token
 */
function generateApprovalToken(opOrOpts, maybeOpts = {}) {
  let opts = {};
  if (typeof opOrOpts === 'string') {
    opts = { op: opOrOpts, ...maybeOpts };
  } else {
    opts = opOrOpts || {};
  }
  const { op, user, resourceId = null, branchId = null, ttlSeconds = 300 } = opts;
  const jti = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = {
    jti,
    op,
    userId: user?.id || null,
    resourceId: resourceId ? String(resourceId) : null,
    branchId: branchId ? Number(branchId) : (user?.branch_id || null),
    exp: expiresAt,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = config.JWT_SECRET || 'bebyoon-sensitive-secret';
  const sig = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
  const tokenStr = `${payloadBase64}.${sig}`;

  const res = {
    approval_token: tokenStr,
    token: tokenStr,
    expires_at: new Date(expiresAt).toISOString(),
    expires_in_seconds: ttlSeconds,
    toString: () => tokenStr,
    valueOf: () => tokenStr,
  };
  return res;
}

/**
 * Validates and consumes a single-use approval token.
 * Throws 403 Forbidden if token is invalid, expired, already used, or mismatched.
 */
function consumeApprovalToken(tokenInput, context = {}) {
  const token = (typeof tokenInput === 'object' && tokenInput !== null)
    ? (tokenInput.approval_token || String(tokenInput))
    : tokenInput;

  const { op, user, resourceId = null, branchId = null } = context;
  if (!token || typeof token !== 'string') {
    const err = new Error('رمز الموافقة الأمنية مطلوب');
    err.statusCode = 403;
    throw err;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    const err = new Error('رمز الموافقة الأمنية غير صالح');
    err.statusCode = 403;
    throw err;
  }

  const [payloadBase64, sig] = parts;
  const secret = config.JWT_SECRET || 'bebyoon-sensitive-secret';
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    const err = new Error('رمز الموافقة الأمنية مزور أو غير صالح');
    err.statusCode = 403;
    throw err;
  }

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    const err = new Error('رمز الموافقة الأمنية تالف');
    err.statusCode = 403;
    throw err;
  }

  if (Date.now() > payload.exp) {
    const err = new Error('انتهت صلاحية رمز الموافقة الأمنية');
    err.statusCode = 403;
    throw err;
  }

  if (consumedTokens.has(payload.jti)) {
    const err = new Error('تم استخدام رمز الموافقة الأمنية مسبقاً (غير قابل لإعادة الاستخدام)');
    err.statusCode = 403;
    throw err;
  }

  if (op && payload.op !== op) {
    const isEquivalent =
      (op === 'return' && payload.op === 'order_return') ||
      (op === 'order_return' && payload.op === 'return') ||
      (op === 'invoice_edit' && (payload.op === 'order_edit' || payload.op === 'invoice_edit')) ||
      (op === 'inventory_mutation' && (payload.op === 'inventory' || payload.op === 'edit' || payload.op === 'delete' || payload.op === 'duplicate')) ||
      (payload.op === 'inventory_mutation' && (op === 'inventory' || op === 'edit' || op === 'delete' || op === 'duplicate'));

    if (!isEquivalent) {
      const err = new Error(`رمز الموافقة مخصص لعملية أخرى (${payload.op})`);
      err.statusCode = 403;
      throw err;
    }
  }

  if (user && payload.userId && String(payload.userId) !== String(user.id)) {
    const err = new Error('رمز الموافقة مخصص لمستخدم آخر');
    err.statusCode = 403;
    throw err;
  }

  if (branchId && payload.branchId && Number(payload.branchId) !== Number(branchId)) {
    const err = new Error('رمز الموافقة مخصص لفرع آخر');
    err.statusCode = 403;
    throw err;
  }

  if (resourceId && payload.resourceId && String(payload.resourceId) !== String(resourceId)) {
    const err = new Error('رمز الموافقة مخصص لسجل آخر');
    err.statusCode = 403;
    throw err;
  }

  // Consume token
  consumedTokens.set(payload.jti, payload.exp);
  return payload;
}

/**
 * Admin updates a sensitive password
 */
async function updateSensitivePassword(type, passwordsInput, adminUser = null) {
  if (adminUser && adminUser.role !== 'admin') {
    const err = new Error('تعديل كلمات المرور متاح للمدير فقط');
    err.statusCode = 403;
    throw err;
  }

  let cleanPassword = '';
  let cleanConfirm = '';
  if (typeof passwordsInput === 'string') {
    cleanPassword = passwordsInput.trim();
    cleanConfirm = passwordsInput.trim();
  } else if (typeof passwordsInput === 'object' && passwordsInput !== null) {
    cleanPassword = String(passwordsInput.password || passwordsInput.new_password || '').trim();
    cleanConfirm = String(passwordsInput.confirm_password || passwordsInput.confirmPassword || cleanPassword).trim();
  }

  if (!cleanPassword) {
    const err = new Error('كلمة المرور لا يمكن أن تكون فارغة');
    err.statusCode = 400;
    throw err;
  }

  if (cleanPassword.length < 3) {
    const err = new Error('يجب ألا تقل كلمة المرور عن 3 أحرف');
    err.statusCode = 400;
    throw err;
  }

  if (cleanPassword !== cleanConfirm) {
    const err = new Error('كلمة المرور وتأكيدها غير متطابقين');
    err.statusCode = 400;
    throw err;
  }

  const baseKey = PASSWORD_KEY_MAP[type] || `${type}_password`;
  const hashKey = `${baseKey}_hash`;
  const passwordHash = await bcrypt.hash(cleanPassword, 10);

  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(hashKey, passwordHash);
    // Remove plaintext legacy key if present
    db.sqlite.prepare('DELETE FROM settings WHERE key = ?').run(baseKey);
  } else {
    await db.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [hashKey, passwordHash]
    );
    await db.query('DELETE FROM settings WHERE key = $1', [baseKey]);
  }

  await auditService.log({
    userId: adminUser?.id || null,
    username: adminUser?.username || 'admin',
    action: `sensitive_password_updated_${type}`,
    resourceType: type,
    outcome: 'success',
    details: { type },
  });

  return { success: true, message: 'تم تحديث كلمة المرور بنجاح' };
}

/**
 * Returns whether each sensitive password has been configured and its lockout status
 */
async function getSensitivePasswordStatus(context = {}) {
  const operations = ['profit', 'invoice_edit', 'return', 'inventory', 'salary'];
  const configuredMap = {};
  for (const op of operations) {
    configuredMap[op] = false;
  }

  const keys = operations.flatMap((t) => [
    `${PASSWORD_KEY_MAP[t]}_hash`,
    PASSWORD_KEY_MAP[t],
  ]);

  if (config.IS_BRANCH_MODE) {
    if (db.sqlite) {
      const rows = db.sqlite.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys);
      for (const r of rows) {
        if (r.value && r.value.trim() !== '') {
          for (const t of operations) {
            if (r.key.startsWith(PASSWORD_KEY_MAP[t])) configuredMap[t] = true;
          }
        }
      }
    }
  } else {
    const { rows } = await db.query(
      `SELECT key, value FROM settings WHERE key = ANY($1)`,
      [keys]
    );
    for (const r of rows) {
      if (r.value && r.value.trim() !== '') {
        for (const t of operations) {
          if (r.key.startsWith(PASSWORD_KEY_MAP[t])) configuredMap[t] = true;
        }
      }
    }
  }

  const status = {};
  const ip = context.req?.ip || context.req?.socket?.remoteAddress || null;
  const userId = context.user?.id || null;

  for (const op of operations) {
    const lockout = getLockoutStatus(op, ip, userId);
    status[op] = {
      configured: configuredMap[op],
      locked: lockout.locked,
      remaining_seconds: lockout.remaining_seconds,
      failed_attempts: lockout.failed_attempts,
    };
  }

  return status;
}

async function removeSensitivePassword(type, adminUser = null) {
  if (adminUser && adminUser.role !== 'admin') {
    const err = new Error('تعديل كلمات المرور متاح للمدير فقط');
    err.statusCode = 403;
    throw err;
  }

  const baseKey = PASSWORD_KEY_MAP[type] || `${type}_password`;
  const hashKey = `${baseKey}_hash`;

  if (config.IS_BRANCH_MODE) {
    if (db.sqlite) {
      db.sqlite.prepare('DELETE FROM settings WHERE key IN (?, ?)').run(hashKey, baseKey);
    }
  } else {
    await db.query('DELETE FROM settings WHERE key IN ($1, $2)', [hashKey, baseKey]);
  }

  // Clear any lockout records for this type
  for (const key of sensitiveAttempts.keys()) {
    if (key.startsWith(`${type}:`)) {
      sensitiveAttempts.delete(key);
    }
  }

  await auditService.log({
    userId: adminUser?.id || null,
    username: adminUser?.username || 'admin',
    action: `sensitive_password_removed_${type}`,
    resourceType: type,
    outcome: 'success',
    details: { type },
  });

  return { success: true, message: 'تم إزالة كلمة المرور وإلغاء حماية العملية بنجاح' };
}

async function setSensitivePassword(type, newPassword, adminUser = null) {
  return updateSensitivePassword(type, newPassword, adminUser || { role: 'admin' });
}

async function verifySensitivePassword(type, candidatePassword, options = {}) {
  return verifyPassword(type, candidatePassword, options);
}

function resetLockoutForTesting(type) {
  for (const key of sensitiveAttempts.keys()) {
    if (key.startsWith(`${type}:`)) {
      sensitiveAttempts.delete(key);
    }
  }
}

function getOperationStatus(type, ip = null, userId = null) {
  const keys = getAttemptKeys(type, ip, userId);
  const now = Date.now();
  let maxCount = 0;
  let lockedUntil = null;
  for (const key of keys) {
    const record = sensitiveAttempts.get(key);
    if (record) {
      if (record.count > maxCount) maxCount = record.count;
      if (record.lockedUntil && now < record.lockedUntil) {
        if (!lockedUntil || record.lockedUntil > lockedUntil) {
          lockedUntil = record.lockedUntil;
        }
      }
    }
  }
  const locked = Boolean(lockedUntil && now < lockedUntil);
  const remaining_seconds = locked ? Math.ceil((lockedUntil - now) / 1000) : 0;
  return {
    locked,
    remaining_seconds,
    failed_attempts: maxCount,
  };
}

module.exports = {
  verifyPassword,
  verifySensitivePassword,
  generateApprovalToken,
  consumeApprovalToken,
  updateSensitivePassword,
  removeSensitivePassword,
  setSensitivePassword,
  getSensitivePasswordStatus,
  getStoredPasswordHash,
  resetLockoutForTesting,
  getOperationStatus,
};
