const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database/connection');
const config = require('../../config/env');
const { ALL_PERMISSIONS, normalizePermissions, defaultPermissionsForRole } = require('../../../shared/constants/permissions');
const { DEFAULT_SETTINGS } = require('../../../shared/constants/system');
const { getDatabaseCairoNow } = require('../../../shared/utils/date');

// In-memory lockout tracker: username -> { count, lockedUntil }
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

async function checkNeedsSetup() {
  if (config.IS_BRANCH_MODE) {
    return false;
  }
  const { rows } = await db.query('SELECT COUNT(*) as count FROM users');
  return Number(rows[0]?.count || 0) === 0;
}

async function executeSetup({ username, password, full_name }) {
  const needsSetup = await checkNeedsSetup();
  if (!needsSetup) {
    const error = new Error('System already setup');
    error.statusCode = 403;
    throw error;
  }

  if (!username || !password || !full_name) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  return db.transaction(async (tx) => {
    // 1. Create default branches if none exist
    const branchCheck = await tx.query('SELECT COUNT(*) as count FROM branches');
    let branchId = null;

    if (Number(branchCheck.rows[0].count) === 0) {
      const branchRes = await tx.query(
        'INSERT INTO branches (name, location, is_main_warehouse) VALUES ($1, $2, $3) RETURNING id',
        ['المخزن الرئيسي', 'المقر الرئيسي', true]
      );
      branchId = branchRes.rows[0].id;

      await tx.query(
        'INSERT INTO branches (name, location, is_main_warehouse) VALUES ($1, $2, $3) RETURNING id',
        ['الفرع الأول', 'الموقع الرئيسي', false]
      );
    } else {
      const branchRes = await tx.query('SELECT id FROM branches ORDER BY id LIMIT 1');
      branchId = branchRes.rows[0].id;
    }

    // 2. Create the admin user
    await tx.query(
      'INSERT INTO users (username, password_hash, role, branch_id, permissions) VALUES ($1, $2, $3, $4, $5)',
      [username.trim(), passwordHash, 'admin', branchId, JSON.stringify(ALL_PERMISSIONS)]
    );

    // 3. Initialize default settings
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await tx.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        [key, value]
      );
    }

    return { success: true };
  });
}

async function authenticateUser(username, password) {
  const cleanUsername = String(username || '').trim();

  // Check lockout
  const attempt = loginAttempts.get(cleanUsername);
  if (attempt && attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
    const remainingMin = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
    const err = new Error(`الحساب مقفل مؤقتاً، حاول مرة أخرى بعد ${remainingMin} دقيقة`);
    err.statusCode = 429;
    throw err;
  }

  let user = null;
  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare('SELECT * FROM users WHERE username = ?');
    user = stmt.get(cleanUsername);
    if (!user) {
      // Fallback: normalize Arabic hamza variants (أ إ آ → ا) for comparison
      const normalized = cleanUsername.replace(/[أإآ]/g, 'ا');
      const all = db.sqlite.prepare('SELECT * FROM users').all();
      user = all.find(u => u.username.replace(/[أإآ]/g, 'ا').toLowerCase() === normalized.toLowerCase()) || null;
    }
    if (user && typeof user.permissions === 'string') {
      try {
        user.permissions = JSON.parse(user.permissions);
      } catch {}
    }
  } else {
    // Try exact match first
    let result = await db.query('SELECT * FROM users WHERE username = $1', [cleanUsername]);
    if (!result.rows.length) {
      // Fallback: case-insensitive + normalize Arabic hamza (أ إ آ → ا)
      const normalized = cleanUsername
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ة]/g, 'ه')
        .toLowerCase();
      result = await db.query(
        `SELECT * FROM users WHERE LOWER(REPLACE(REPLACE(REPLACE(username, 'أ','ا'),'إ','ا'),'آ','ا')) = $1`,
        [normalized]
      );
    }
    user = result.rows[0];
  }

  if (!user) {
    const err = new Error('بيانات الدخول غير صحيحة');
    err.statusCode = 401;
    throw err;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const prev = loginAttempts.get(cleanUsername) || { count: 0, lockedUntil: null };
    const newCount = prev.count + 1;
    if (newCount >= LOGIN_MAX_ATTEMPTS) {
      loginAttempts.set(cleanUsername, { count: newCount, lockedUntil: Date.now() + LOGIN_LOCKOUT_MS });
    } else {
      loginAttempts.set(cleanUsername, { count: newCount, lockedUntil: null });
    }
    const err = new Error('بيانات الدخول غير صحيحة');
    err.statusCode = 401;
    throw err;
  }

  // Reset failed attempts on success
  loginAttempts.delete(cleanUsername);

  const permissions = normalizePermissions(user.permissions);
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id, permissions },
    config.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return { token, user };
}

async function verifySalaryPassword(password) {
  if (!password) return false;
  let globalPassword = '123';
  if (config.IS_BRANCH_MODE) {
    const row = db.sqlite.prepare("SELECT value FROM settings WHERE key = 'salary_password'").get();
    if (row?.value) globalPassword = row.value;
  } else {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'salary_password'");
    if (rows.length > 0 && rows[0].value) globalPassword = rows[0].value;
  }
  return String(password).trim() === String(globalPassword).trim();
}

async function verifyInvoiceEditPassword(password) {
  if (!password) return false;
  let invoicePassword = '123456';
  if (config.IS_BRANCH_MODE) {
    const row = db.sqlite.prepare("SELECT value FROM settings WHERE key = 'invoice_edit_password'").get();
    if (row?.value) invoicePassword = row.value;
  } else {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'invoice_edit_password'");
    if (rows.length > 0 && rows[0].value) invoicePassword = rows[0].value;
  }
  return String(password).trim() === String(invoicePassword).trim();
}

async function verifyProfitPassword(password) {
  if (!password) return false;
  let profitPassword = '123';
  if (config.IS_BRANCH_MODE) {
    const row = db.sqlite.prepare("SELECT value FROM settings WHERE key = 'profit_password'").get();
    if (row?.value) profitPassword = row.value;
  } else {
    const { rows } = await db.query("SELECT value FROM settings WHERE key = 'profit_password'");
    if (rows.length > 0 && rows[0].value) profitPassword = rows[0].value;
  }
  return String(password).trim() === String(profitPassword).trim();
}

async function updateOwnAccount(userId, { username, password }) {
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername) {
    const err = new Error('اسم المستخدم مطلوب');
    err.statusCode = 400;
    throw err;
  }

  const existing = await db.query(
    'SELECT id FROM users WHERE username = $1 AND id != $2',
    [cleanUsername, userId]
  );
  if (existing.rows.length > 0) {
    const err = new Error('اسم المستخدم مستخدم بالفعل');
    err.statusCode = 400;
    throw err;
  }

  await db.transaction(async (tx) => {
    if (password && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password, 10);
      await tx.query(
        'UPDATE users SET username = $1, password_hash = $2 WHERE id = $3',
        [cleanUsername, passwordHash, userId]
      );
    } else {
      await tx.query('UPDATE users SET username = $1 WHERE id = $2', [cleanUsername, userId]);
    }
  });

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = rows[0];

  const newToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, branch_id: user.branch_id, permissions: user.permissions },
    config.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return { token: newToken, user };
}

async function createBranchUser({ username, password, branch_id, role, permissions }) {
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername || !password) {
    const err = new Error('Username and password required');
    err.statusCode = 400;
    throw err;
  }

  let finalPermissions = normalizePermissions(permissions);
  if (finalPermissions.length === 0) {
    finalPermissions = defaultPermissionsForRole(role || 'branch_user');
  }

  const userCheck = await db.query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
  if (userCheck.rows.length > 0) {
    const err = new Error('Username already exists');
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    'INSERT INTO users (username, password_hash, role, branch_id, permissions) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, role, branch_id, permissions',
    [cleanUsername, passwordHash, role || 'branch_user', branch_id || null, JSON.stringify(finalPermissions)]
  );
  return rows[0];
}

async function listBranchUsers() {
  const { rows } = await db.query(
    "SELECT id, username, role, branch_id, permissions FROM users WHERE role != 'admin' ORDER BY id DESC"
  );
  return rows;
}

async function updateBranchUser(id, { username, password, branch_id, permissions }) {
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername) {
    const err = new Error('Username required');
    err.statusCode = 400;
    throw err;
  }

  let finalPermissions = normalizePermissions(permissions);
  if (finalPermissions.length === 0) {
    finalPermissions = defaultPermissionsForRole('branch_user');
  }

  const userCheck = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [cleanUsername, id]);
  if (userCheck.rows.length > 0) {
    const err = new Error('Username already exists');
    err.statusCode = 400;
    throw err;
  }

  if (password && password.trim() !== '') {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'UPDATE users SET username = $1, password_hash = $2, branch_id = $3, permissions = $4 WHERE id = $5 RETURNING id, username, role, branch_id, permissions',
      [cleanUsername, passwordHash, branch_id || null, JSON.stringify(finalPermissions), id]
    );
    return rows[0];
  }

  const { rows } = await db.query(
    'UPDATE users SET username = $1, branch_id = $2, permissions = $3 WHERE id = $4 RETURNING id, username, role, branch_id, permissions',
    [cleanUsername, branch_id || null, JSON.stringify(finalPermissions), id]
  );
  return rows[0];
}

async function deleteBranchUser(id) {
  await db.query("DELETE FROM users WHERE id = $1 AND role != 'admin'", [id]);
  return { success: true };
}

module.exports = {
  checkNeedsSetup,
  executeSetup,
  authenticateUser,
  verifySalaryPassword,
  verifyInvoiceEditPassword,
  verifyProfitPassword,
  updateOwnAccount,
  createBranchUser,
  listBranchUsers,
  updateBranchUser,
  deleteBranchUser,
};
