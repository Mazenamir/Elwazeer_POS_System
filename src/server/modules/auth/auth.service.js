const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database/connection');
const config = require('../../config/env');
const {
  ALL_PERMISSIONS,
  ALL_GRANULAR_PERMISSIONS,
  normalizePermissions,
  expandPermissionsWithLegacy,
  defaultPermissionsForRole,
} = require('../../../shared/constants/permissions');
const { DEFAULT_SETTINGS } = require('../../../shared/constants/system');
const { getDatabaseCairoNow } = require('../../../shared/utils/date');
const auditService = require('../audit/audit.service');
const sensitiveService = require('./sensitivePassword.service');

// In-memory lockout tracker: username -> { count, lockedUntil }
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

// User session cache: userId -> { token_version, role, branch_id, branch_scope, branch_ids, permissions, cachedAt }
const userCache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds freshness window

// Set of explicitly revoked / deleted user IDs
const revokedUserIds = new Set();

function isUserRevoked(userId) {
  if (!userId) return false;
  return revokedUserIds.has(Number(userId));
}

function revokeUserId(userId) {
  if (!userId) return;
  const num = Number(userId);
  revokedUserIds.add(num);
  invalidateUserCache(num);
}

async function hasAnyUser() {
  try {
    if (config.IS_BRANCH_MODE) {
      if (!db.sqlite) return false;
      const row = db.sqlite.prepare('SELECT COUNT(*) as count FROM users').get();
      return Number(row?.count || 0) > 0;
    }
    const { rows } = await db.query('SELECT COUNT(*) as count FROM users');
    return Number(rows[0]?.count || 0) > 0;
  } catch {
    return false;
  }
}

function invalidateUserCache(userId) {
  if (userId) {
    userCache.delete(Number(userId));
    userCache.delete(String(userId));
  } else {
    userCache.clear();
  }
}

async function invalidateUser(userId) {
  const numId = Number(userId);
  invalidateUserCache(numId);
  let newVersion = 1;
  if (config.IS_BRANCH_MODE) {
    if (db.sqlite) {
      db.sqlite.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?').run(numId);
      const row = db.sqlite.prepare('SELECT token_version FROM users WHERE id = ?').get(numId);
      newVersion = Number(row?.token_version || 1);
    }
  } else {
    const { rows } = await db.query(
      'UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = $1 RETURNING token_version',
      [numId]
    );
    newVersion = Number(rows[0]?.token_version || 1);
  }
  return newVersion;
}

async function getUserFreshData(userId) {
  if (!userId) return null;
  const numId = Number(userId);

  const cached = userCache.get(numId);
  if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
    return cached;
  }

  let user = null;
  try {
    if (config.IS_BRANCH_MODE) {
      if (!db.sqlite) return null;
      user = db.sqlite.prepare(`
        SELECT id, username, role, branch_id, branch_scope, branch_ids, permissions, token_version
        FROM users WHERE id = ?
      `).get(numId);
    } else {
      const { rows } = await db.query(`
        SELECT id, username, role, branch_id, branch_scope, branch_ids, permissions, token_version
        FROM users WHERE id = $1
      `, [numId]);
      user = rows[0] || null;
    }
  } catch {
    return null;
  }

  if (!user) {
    userCache.delete(numId);
    return null;
  }

  let branchIds = [];
  if (Array.isArray(user.branch_ids)) {
    branchIds = user.branch_ids;
  } else if (typeof user.branch_ids === 'string') {
    try { branchIds = JSON.parse(user.branch_ids); } catch { branchIds = []; }
  }

  const isBranchMode = Boolean(config.IS_BRANCH_MODE);
  const effectiveBranchId = isBranchMode ? Number(config.BRANCH_ID || user.branch_id || 1) : user.branch_id;

  const fresh = {
    id: user.id,
    username: user.username,
    role: user.role,
    branch_id: effectiveBranchId,
    branch_scope: user.branch_scope || (user.role === 'admin' ? 'all' : 'single'),
    branch_ids: branchIds,
    permissions: normalizePermissions(user.permissions),
    token_version: Number(user.token_version || 1),
    cachedAt: Date.now(),
  };

  userCache.set(numId, fresh);
  return fresh;
}

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

    // 2. Create the admin user with all-branch scope and all permissions
    const allPerms = [...ALL_PERMISSIONS, ...ALL_GRANULAR_PERMISSIONS];
    await tx.query(
      `INSERT INTO users (full_name, username, password_hash, role, branch_id, permissions, branch_scope, branch_ids, token_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [full_name.trim(), username.trim(), passwordHash, 'admin', branchId, JSON.stringify(allPerms), 'all', JSON.stringify([]), 1]
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
      user = all.find((u) => u.username.replace(/[أإآ]/g, 'ا').toLowerCase() === normalized.toLowerCase()) || null;
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
  const displayName = user.full_name || user.username;
  const branchScope = user.branch_scope || (user.role === 'admin' ? 'all' : 'single');
  let branchIds = [];
  if (Array.isArray(user.branch_ids)) {
    branchIds = user.branch_ids;
  } else if (typeof user.branch_ids === 'string') {
    try { branchIds = JSON.parse(user.branch_ids); } catch { branchIds = []; }
  }

  const tokenVersion = Number(user.token_version || 1);

  const isBranchMode = Boolean(config.IS_BRANCH_MODE);
  const effectiveBranchId = isBranchMode ? Number(config.BRANCH_ID || user.branch_id || 1) : user.branch_id;

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name || null,
      name: displayName,
      role: user.role,
      branch_id: effectiveBranchId,
      branch_scope: branchScope,
      branch_ids: branchIds,
      token_version: tokenVersion,
      permissions,
    },
    config.JWT_SECRET,
    { expiresIn: '30d' }
  );

  let branchName = user.branch_name || null;
  if (!branchName && user.branch_id) {
    if (config.IS_BRANCH_MODE) {
      const b = db.sqlite.prepare('SELECT name FROM branches WHERE id = ?').get(user.branch_id);
      branchName = b?.name || null;
    } else {
      const bRes = await db.query('SELECT name FROM branches WHERE id = $1', [user.branch_id]);
      branchName = bRes.rows[0]?.name || null;
    }
  }

  // Populate cache immediately
  userCache.set(Number(user.id), {
    id: user.id,
    username: user.username,
    role: user.role,
    branch_id: user.branch_id,
    branch_scope: branchScope,
    branch_ids: branchIds,
    permissions,
    token_version: tokenVersion,
    cachedAt: Date.now(),
  });

  await auditService.log({
    userId: user.id,
    username: user.username,
    action: 'user_login',
    branchId: user.branch_id,
    outcome: 'success',
  });

  return {
    token,
    user: {
      ...user,
      permissions,
      name: displayName,
      full_name: user.full_name || null,
      branch_name: branchName,
      branch_scope: branchScope,
      branch_ids: branchIds,
      token_version: tokenVersion,
    },
  };
}

// Sensitive Operations Password Verifications
async function verifySalaryPassword(password) {
  if (password === null || password === undefined || password === '') return false;
  return sensitiveService.verifyPassword('salary', password);
}

async function verifyInvoiceEditPassword(password) {
  if (password === null || password === undefined || password === '') return false;
  return sensitiveService.verifyPassword('invoice_edit', password);
}

async function verifyProfitPassword(password) {
  if (password === null || password === undefined || password === '') return false;
  return sensitiveService.verifyPassword('profit', password);
}

async function verifyReturnPassword(password) {
  if (password === null || password === undefined || password === '') return false;
  return sensitiveService.verifyPassword('return', password);
}

async function verifyInventoryPassword(password) {
  if (password === null || password === undefined || password === '') return false;
  return sensitiveService.verifyPassword('inventory', password);
}

/**
 * Update personal admin/user account details (username, full_name, personal password)
 * Requires current_password verification when password update is requested.
 */
async function updateOwnAccount(userId, { current_password, password, new_password, confirm_password, confirmPassword, username, full_name }) {
  // Fetch current user from DB
  let existingUser = null;
  if (config.IS_BRANCH_MODE) {
    existingUser = db.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  } else {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    existingUser = rows[0] || null;
  }

  if (!existingUser) {
    const err = new Error('المستخدم غير موجود');
    err.statusCode = 404;
    throw err;
  }

  // Admin is allowed to change personal username; branch users keep their assigned username
  let cleanUsername = existingUser.username;
  if (existingUser.role === 'admin' && username !== undefined && String(username).trim() !== '') {
    cleanUsername = String(username).trim();
  }

  const cleanFullName = full_name !== undefined ? String(full_name || '').trim() : undefined;
  if (!cleanUsername) {
    const err = new Error('اسم المستخدم مطلوب');
    err.statusCode = 400;
    throw err;
  }

  // Check unique username collision
  if (cleanUsername !== existingUser.username) {
    let check = null;
    if (config.IS_BRANCH_MODE) {
      check = db.sqlite.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, userId);
    } else {
      const res = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [cleanUsername, userId]);
      check = res.rows[0];
    }
    if (check) {
      const err = new Error('اسم المستخدم مستخدم بالفعل');
      err.statusCode = 400;
      throw err;
    }
  }

  let newPasswordHash = null;
  let incrementVersion = false;

  const targetPassword = password || new_password;
  const targetConfirm = confirm_password !== undefined ? confirm_password : confirmPassword;

  // If password update requested: require and verify current password
  if (targetPassword && String(targetPassword).trim() !== '') {
    const cleanNewPassword = String(targetPassword).trim();
    if (cleanNewPassword.length < 4) {
      const err = new Error('كلمة المرور الجديدة يجب ألا تقل عن 4 أحرف');
      err.statusCode = 400;
      throw err;
    }

    if (targetConfirm !== undefined && String(targetConfirm).trim() !== cleanNewPassword) {
      const err = new Error('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      err.statusCode = 400;
      throw err;
    }

    if (!current_password) {
      const err = new Error('كلمة المرور الحالية مطلوبة لتحديث كلمة المرور');
      err.statusCode = 400;
      throw err;
    }

    const currentMatches = await bcrypt.compare(String(current_password).trim(), existingUser.password_hash);
    if (!currentMatches) {
      const err = new Error('كلمة المرور الحالية غير صحيحة');
      err.statusCode = 400;
      throw err;
    }

    newPasswordHash = await bcrypt.hash(cleanNewPassword, 10);
    incrementVersion = true;
  }

  const nextVersion = incrementVersion ? (Number(existingUser.token_version || 1) + 1) : Number(existingUser.token_version || 1);

  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare(`
      UPDATE users
      SET username = ?,
          full_name = COALESCE(?, full_name),
          password_hash = COALESCE(?, password_hash),
          token_version = ?
      WHERE id = ?
    `).run(cleanUsername, cleanFullName !== undefined ? cleanFullName : null, newPasswordHash, nextVersion, userId);

    const syncedRow = db.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (syncedRow) {
      try {
        const { queueSyncOperation } = require('../sync/sync.service');
        await queueSyncOperation(db, null, 'user', 'update', userId, syncedRow.branch_id || null, {
          id: syncedRow.id,
          username: syncedRow.username,
          full_name: syncedRow.full_name,
          password_hash: syncedRow.password_hash,
          role: syncedRow.role,
          branch_id: syncedRow.branch_id,
          permissions: syncedRow.permissions,
          employee_id: syncedRow.employee_id,
          branch_scope: syncedRow.branch_scope,
          branch_ids: syncedRow.branch_ids,
          token_version: syncedRow.token_version,
        });
      } catch {}
    }
  } else {
    await db.query(`
      UPDATE users
      SET username = $1,
          full_name = COALESCE($2, full_name),
          password_hash = COALESCE($3, password_hash),
          token_version = $4
      WHERE id = $5
    `, [cleanUsername, cleanFullName !== undefined ? cleanFullName : null, newPasswordHash, nextVersion, userId]);
  }

  invalidateUserCache(userId);

  await auditService.log({
    userId,
    username: cleanUsername,
    action: incrementVersion ? 'user_password_change' : 'user_profile_update',
    branchId: existingUser.branch_id,
    outcome: 'success',
  });

  // Re-fetch updated user record
  let updatedUser = null;
  if (config.IS_BRANCH_MODE) {
    updatedUser = db.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  } else {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    updatedUser = rows[0];
  }

  const permissions = normalizePermissions(updatedUser.permissions);
  const displayName = updatedUser.full_name || updatedUser.username;
  const branchScope = updatedUser.branch_scope || (updatedUser.role === 'admin' ? 'all' : 'single');
  let branchIds = [];
  if (Array.isArray(updatedUser.branch_ids)) {
    branchIds = updatedUser.branch_ids;
  } else if (typeof updatedUser.branch_ids === 'string') {
    try { branchIds = JSON.parse(updatedUser.branch_ids); } catch { branchIds = []; }
  }

  const newToken = jwt.sign(
    {
      id: updatedUser.id,
      username: updatedUser.username,
      full_name: updatedUser.full_name || null,
      name: displayName,
      role: updatedUser.role,
      branch_id: updatedUser.branch_id,
      branch_scope: branchScope,
      branch_ids: branchIds,
      token_version: nextVersion,
      permissions,
    },
    config.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return {
    token: newToken,
    user: {
      ...updatedUser,
      permissions,
      name: displayName,
      full_name: updatedUser.full_name || null,
      branch_scope: branchScope,
      branch_ids: branchIds,
    },
  };
}

async function createBranchUser({
  full_name,
  name,
  username,
  password,
  branch_id,
  branch_scope = 'single',
  branch_ids = [],
  role,
  permissions,
  employee_id,
}) {
  const cleanUsername = String(username || '').trim();
  const cleanFullName = String(full_name || name || '').trim();
  if (!cleanUsername || !password) {
    const err = new Error('اسم المستخدم وكلمة المرور مطلوبان');
    err.statusCode = 400;
    throw err;
  }

  if (!cleanFullName) {
    const err = new Error('اسم الشخص / الموظف مطلوب');
    err.statusCode = 400;
    throw err;
  }

  const assignedRole = role || 'branch_user';
  const assignedBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : null;
  const assignedEmployeeId = (employee_id && Number(employee_id) > 0) ? Number(employee_id) : null;

  if (assignedRole !== 'admin' && !assignedBranchId) {
    const err = new Error('الفرع المخصص مطلوب لحساب المستخدم');
    err.statusCode = 400;
    throw err;
  }

  const assignedScope = assignedRole === 'admin' ? 'all' : (['all', 'selected', 'single'].includes(branch_scope) ? branch_scope : 'single');

  // Format and validate branch_ids
  let finalBranchIds = [];
  if (Array.isArray(branch_ids)) {
    finalBranchIds = branch_ids.map(Number).filter((id) => id > 0);
  } else if (typeof branch_ids === 'string') {
    try {
      finalBranchIds = JSON.parse(branch_ids).map(Number).filter((id) => id > 0);
    } catch {
      finalBranchIds = [];
    }
  }

  // Ensure default assigned branch is part of branch_ids if scope is selected
  if (assignedScope === 'selected' && assignedBranchId && !finalBranchIds.includes(assignedBranchId)) {
    finalBranchIds.push(assignedBranchId);
  }

  let finalPermissions;
  if (Array.isArray(permissions)) {
    finalPermissions = expandPermissionsWithLegacy(permissions);
  } else if (permissions !== undefined && permissions !== null) {
    finalPermissions = expandPermissionsWithLegacy(permissions);
  } else {
    finalPermissions = defaultPermissionsForRole(assignedRole);
  }
  finalPermissions = [...new Set(finalPermissions)];

  if (config.IS_BRANCH_MODE) {
    const userCheck = db.sqlite.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (userCheck) {
      const err = new Error('اسم المستخدم مستخدم بالفعل');
      err.statusCode = 400;
      throw err;
    }

    let branch = null;
    if (assignedBranchId) {
      branch = db.sqlite.prepare('SELECT id, name FROM branches WHERE id = ?').get(assignedBranchId);
      if (!branch) {
        const err = new Error('الفرع المحدد غير موجود');
        err.statusCode = 400;
        throw err;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const info = db.sqlite.prepare(`
      INSERT INTO users (
        full_name, username, password_hash, role, branch_id,
        permissions, employee_id, branch_scope, branch_ids, token_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      cleanFullName || null,
      cleanUsername,
      passwordHash,
      assignedRole,
      assignedBranchId,
      JSON.stringify(finalPermissions),
      assignedEmployeeId,
      assignedScope,
      JSON.stringify(finalBranchIds)
    );

    const newId = info.lastInsertRowid;
    try {
      const { queueSyncOperation } = require('../sync/sync.service');
      await queueSyncOperation(db, null, 'user', 'create', newId, assignedBranchId || null, {
        id: newId,
        full_name: cleanFullName || null,
        username: cleanUsername,
        password_hash: passwordHash,
        role: assignedRole,
        branch_id: assignedBranchId,
        permissions: finalPermissions,
        employee_id: assignedEmployeeId,
        branch_scope: assignedScope,
        branch_ids: finalBranchIds,
        token_version: 1,
      });
    } catch {}

    await auditService.log({
      action: 'user_created',
      resourceType: 'user',
      resourceId: newId,
      branchId: assignedBranchId,
      details: { username: cleanUsername, role: assignedRole, branch_scope: assignedScope },
    });

    return {
      id: newId,
      full_name: cleanFullName || null,
      name: cleanFullName || cleanUsername,
      username: cleanUsername,
      role: assignedRole,
      branch_id: assignedBranchId,
      branch_name: branch?.name || null,
      branch_scope: assignedScope,
      branch_ids: finalBranchIds,
      permissions: finalPermissions,
      employee_id: assignedEmployeeId,
    };
  }

  const userCheck = await db.query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
  if (userCheck.rows.length > 0) {
    const err = new Error('اسم المستخدم مستخدم بالفعل');
    err.statusCode = 400;
    throw err;
  }

  let branchName = null;
  if (assignedBranchId) {
    const bRes = await db.query('SELECT id, name FROM branches WHERE id = $1', [assignedBranchId]);
    if (bRes.rows.length === 0) {
      const err = new Error('الفرع المحدد غير موجود');
      err.statusCode = 400;
      throw err;
    }
    branchName = bRes.rows[0].name;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (
       full_name, username, password_hash, role, branch_id,
       permissions, employee_id, branch_scope, branch_ids, token_version
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
     RETURNING id, full_name, username, role, branch_id, permissions, employee_id, branch_scope, branch_ids`,
    [
      cleanFullName || null,
      cleanUsername,
      passwordHash,
      assignedRole,
      assignedBranchId,
      JSON.stringify(finalPermissions),
      assignedEmployeeId,
      assignedScope,
      JSON.stringify(finalBranchIds),
    ]
  );

  const newUser = rows[0];
  await auditService.log({
    action: 'user_created',
    resourceType: 'user',
    resourceId: newUser.id,
    branchId: assignedBranchId,
    details: { username: cleanUsername, role: assignedRole, branch_scope: assignedScope },
  });

  return {
    ...newUser,
    name: newUser.full_name || newUser.username,
    branch_name: branchName,
    branch_scope: newUser.branch_scope || assignedScope,
    branch_ids: finalBranchIds,
    permissions: normalizePermissions(newUser.permissions),
  };
}

async function listBranchUsers() {
  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.permissions,
             u.employee_id, u.branch_scope, u.branch_ids,
             COALESCE(u.full_name, u.username) as name,
             b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.id DESC
    `).all();
    return rows.map((r) => {
      let bIds = [];
      if (Array.isArray(r.branch_ids)) bIds = r.branch_ids;
      else if (typeof r.branch_ids === 'string') {
        try { bIds = JSON.parse(r.branch_ids); } catch {}
      }
      return {
        ...r,
        branch_scope: r.branch_scope || 'single',
        branch_ids: bIds,
        permissions: normalizePermissions(r.permissions),
      };
    });
  }

  const { rows } = await db.query(`
    SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.permissions,
           u.employee_id, u.branch_scope, u.branch_ids,
           COALESCE(u.full_name, e.name, u.username) as name,
           COALESCE(u.full_name, e.name, u.username) as full_name,
           b.name as branch_name,
           e.name as employee_name
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN employees e ON u.employee_id = e.id
    ORDER BY u.id DESC
  `);

  return rows.map((r) => {
    let bIds = [];
    if (Array.isArray(r.branch_ids)) bIds = r.branch_ids;
    else if (typeof r.branch_ids === 'string') {
      try { bIds = JSON.parse(r.branch_ids); } catch {}
    }
    return {
      ...r,
      branch_scope: r.branch_scope || 'single',
      branch_ids: bIds,
      permissions: normalizePermissions(r.permissions),
    };
  });
}

async function updateBranchUser(id, {
  full_name,
  name,
  username,
  password,
  branch_id,
  branch_scope,
  branch_ids,
  role,
  permissions,
  employee_id,
}) {
  let cleanUsername = username !== undefined ? String(username || '').trim() : undefined;
  if (cleanUsername === '') {
    const err = new Error('Username cannot be empty');
    err.statusCode = 400;
    throw err;
  }

  const cleanFullName = full_name !== undefined || name !== undefined ? String(full_name || name || '').trim() : undefined;
  if (cleanFullName !== undefined && cleanFullName === '') {
    const err = new Error('اسم الشخص / الموظف لا يمكن أن يكون فارغاً');
    err.statusCode = 400;
    throw err;
  }

  const assignedBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : (branch_id !== undefined ? null : undefined);
  const assignedRole = role || undefined;
  const assignedEmployeeId = (employee_id && Number(employee_id) > 0) ? Number(employee_id) : (employee_id !== undefined ? null : undefined);

  let finalPermissions;
  if (Array.isArray(permissions)) {
    finalPermissions = expandPermissionsWithLegacy(permissions);
  } else if (permissions !== undefined && permissions !== null) {
    finalPermissions = expandPermissionsWithLegacy(permissions);
  }
  if (finalPermissions) {
    finalPermissions = [...new Set(finalPermissions)];
  }

  let finalBranchIds;
  if (Array.isArray(branch_ids)) {
    finalBranchIds = branch_ids.map(Number).filter((b) => b > 0);
  } else if (typeof branch_ids === 'string') {
    try {
      finalBranchIds = JSON.parse(branch_ids).map(Number).filter((b) => b > 0);
    } catch {
      finalBranchIds = [];
    }
  }

  if (config.IS_BRANCH_MODE) {
    const existing = db.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }
    if (!cleanUsername) cleanUsername = existing.username;

    const userCheck = db.sqlite.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, id);
    if (userCheck) {
      const err = new Error('Username already exists');
      err.statusCode = 400;
      throw err;
    }

    const targetRole = assignedRole || existing.role || 'branch_user';
    const targetBranchId = assignedBranchId !== undefined ? assignedBranchId : existing.branch_id;
    const targetEmployeeId = assignedEmployeeId !== undefined ? assignedEmployeeId : (existing.employee_id ?? null);
    const targetScope = branch_scope !== undefined ? branch_scope : (existing.branch_scope || 'single');

    if (targetRole !== 'admin' && (!targetBranchId || Number(targetBranchId) <= 0)) {
      const err = new Error('الفرع المخصص مطلوب لحساب المستخدم');
      err.statusCode = 400;
      throw err;
    }

    if (targetBranchId) {
      const branch = db.sqlite.prepare('SELECT id, name FROM branches WHERE id = ?').get(targetBranchId);
      if (!branch) {
        const err = new Error('الفرع المحدد غير موجود');
        err.statusCode = 400;
        throw err;
      }
    }

    let bIdsToSave = existing.branch_ids || '[]';
    if (finalBranchIds !== undefined) {
      if (targetScope === 'selected' && targetBranchId && !finalBranchIds.includes(targetBranchId)) {
        finalBranchIds.push(targetBranchId);
      }
      bIdsToSave = JSON.stringify(finalBranchIds);
    }

    const permissionsToSave = finalPermissions !== undefined ? JSON.stringify(finalPermissions) : existing.permissions;
    const nextTokenVersion = (Number(existing.token_version || 1) + 1);

    if (password && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password, 10);
      db.sqlite.prepare(`
        UPDATE users
        SET full_name = COALESCE(?, full_name),
            username = ?,
            password_hash = ?,
            role = ?,
            branch_id = ?,
            permissions = ?,
            employee_id = COALESCE(?, employee_id),
            branch_scope = ?,
            branch_ids = ?,
            token_version = ?
        WHERE id = ?
      `).run(
        cleanFullName !== undefined ? cleanFullName : null,
        cleanUsername,
        passwordHash,
        targetRole,
        targetBranchId,
        permissionsToSave,
        targetEmployeeId,
        targetScope,
        bIdsToSave,
        nextTokenVersion,
        id
      );
    } else {
      db.sqlite.prepare(`
        UPDATE users
        SET full_name = COALESCE(?, full_name),
            username = ?,
            role = ?,
            branch_id = ?,
            permissions = ?,
            employee_id = COALESCE(?, employee_id),
            branch_scope = ?,
            branch_ids = ?,
            token_version = ?
        WHERE id = ?
      `).run(
        cleanFullName !== undefined ? cleanFullName : null,
        cleanUsername,
        targetRole,
        targetBranchId,
        permissionsToSave,
        targetEmployeeId,
        targetScope,
        bIdsToSave,
        nextTokenVersion,
        id
      );
    }

    invalidateUserCache(id);

    const syncedRow = db.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (syncedRow) {
      try {
        const { queueSyncOperation } = require('../sync/sync.service');
        await queueSyncOperation(db, null, 'user', 'update', Number(id), syncedRow.branch_id || null, {
          id: syncedRow.id,
          username: syncedRow.username,
          full_name: syncedRow.full_name,
          password_hash: syncedRow.password_hash,
          role: syncedRow.role,
          branch_id: syncedRow.branch_id,
          permissions: syncedRow.permissions,
          employee_id: syncedRow.employee_id,
          branch_scope: syncedRow.branch_scope,
          branch_ids: syncedRow.branch_ids,
          token_version: syncedRow.token_version,
        });
      } catch {}
    }

    await auditService.log({
      action: 'user_updated',
      resourceType: 'user',
      resourceId: id,
      branchId: targetBranchId,
      details: { username: cleanUsername, role: targetRole, branch_scope: targetScope },
    });

    const updated = db.sqlite.prepare(`
      SELECT u.id, u.full_name, u.username, u.role, u.branch_id, u.permissions,
             u.employee_id, u.branch_scope, u.branch_ids,
             COALESCE(u.full_name, u.username) as name,
             b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = ?
    `).get(id);

    let parsedBIds = [];
    try { parsedBIds = JSON.parse(updated?.branch_ids || '[]'); } catch {}

    return {
      ...updated,
      branch_scope: updated?.branch_scope || 'single',
      branch_ids: parsedBIds,
      permissions: normalizePermissions(updated?.permissions),
    };
  }

  // PostgreSQL mode
  const { rows: existingRows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  if (!existingRows.length) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  const existing = existingRows[0];
  if (!cleanUsername) cleanUsername = existing.username;

  const userCheck = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [cleanUsername, id]);
  if (userCheck.rows.length > 0) {
    const err = new Error('Username already exists');
    err.statusCode = 400;
    throw err;
  }

  const targetRole = assignedRole || existing.role || 'branch_user';
  const targetBranchId = assignedBranchId !== undefined ? assignedBranchId : existing.branch_id;
  const targetEmployeeId = assignedEmployeeId !== undefined ? assignedEmployeeId : existing.employee_id;
  const targetScope = branch_scope !== undefined ? branch_scope : (existing.branch_scope || 'single');

  if (targetRole !== 'admin' && (!targetBranchId || Number(targetBranchId) <= 0)) {
    const err = new Error('الفرع المخصص مطلوب لحساب المستخدم');
    err.statusCode = 400;
    throw err;
  }

  if (targetBranchId) {
    const bRes = await db.query('SELECT id, name FROM branches WHERE id = $1', [targetBranchId]);
    if (bRes.rows.length === 0) {
      const err = new Error('الفرع المحدد غير موجود');
      err.statusCode = 400;
      throw err;
    }
  }

  let bIdsToSave = existing.branch_ids || [];
  if (finalBranchIds !== undefined) {
    if (targetScope === 'selected' && targetBranchId && !finalBranchIds.includes(targetBranchId)) {
      finalBranchIds.push(targetBranchId);
    }
    bIdsToSave = finalBranchIds;
  }

  const nextTokenVersion = (Number(existing.token_version || 1) + 1);

  let query = 'UPDATE users SET username = $1, role = $2, branch_id = $3, branch_scope = $4, branch_ids = $5, token_version = $6';
  const params = [cleanUsername, targetRole, targetBranchId, targetScope, JSON.stringify(bIdsToSave), nextTokenVersion];

  if (cleanFullName !== undefined) {
    params.push(cleanFullName);
    query += `, full_name = $${params.length}`;
  }

  if (assignedEmployeeId !== undefined) {
    params.push(assignedEmployeeId);
    query += `, employee_id = $${params.length}`;
  }

  if (finalPermissions !== undefined) {
    params.push(JSON.stringify(finalPermissions));
    query += `, permissions = $${params.length}`;
  }

  if (password && password.trim() !== '') {
    const passwordHash = await bcrypt.hash(password, 10);
    params.push(passwordHash);
    query += `, password_hash = $${params.length}`;
  }

  params.push(id);
  query += ` WHERE id = $${params.length} RETURNING id, full_name, username, role, branch_id, permissions, employee_id, branch_scope, branch_ids`;

  const { rows } = await db.query(query, params);
  const updatedUser = rows[0];

  invalidateUserCache(id);

  await auditService.log({
    action: 'user_updated',
    resourceType: 'user',
    resourceId: id,
    branchId: targetBranchId,
    details: { username: cleanUsername, role: targetRole, branch_scope: targetScope },
  });

  let branchName = null;
  if (targetBranchId) {
    const bRes = await db.query('SELECT name FROM branches WHERE id = $1', [targetBranchId]);
    branchName = bRes.rows[0]?.name || null;
  }

  let parsedBIds = [];
  if (Array.isArray(updatedUser.branch_ids)) parsedBIds = updatedUser.branch_ids;
  else if (typeof updatedUser.branch_ids === 'string') {
    try { parsedBIds = JSON.parse(updatedUser.branch_ids); } catch {}
  }

  return {
    ...updatedUser,
    name: updatedUser.full_name || updatedUser.username,
    branch_name: branchName,
    branch_scope: updatedUser.branch_scope || targetScope,
    branch_ids: parsedBIds,
    permissions: normalizePermissions(updatedUser.permissions),
  };
}

async function deleteBranchUser(id) {
  revokeUserId(id);

  if (config.IS_BRANCH_MODE) {
    const existing = db.sqlite.prepare("SELECT id, username, branch_id FROM users WHERE id = ? AND role != 'admin'").get(id);
    db.sqlite.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(id);
    if (existing) {
      try {
        const { queueSyncOperation } = require('../sync/sync.service');
        await queueSyncOperation(db, null, 'user', 'delete', Number(id), existing.branch_id || null, {
          id: existing.id,
          username: existing.username,
        });
      } catch {}
    }
  } else {
    await db.query("DELETE FROM users WHERE id = $1 AND role != 'admin'", [id]);
  }

  await auditService.log({
    action: 'user_deleted',
    resourceType: 'user',
    resourceId: id,
    outcome: 'success',
  });

  return { success: true };
}

module.exports = {
  checkNeedsSetup,
  executeSetup,
  authenticateUser,
  getUserFreshData,
  invalidateUserCache,
  invalidateUser,
  isUserRevoked,
  revokeUserId,
  hasAnyUser,
  verifySalaryPassword,
  verifyInvoiceEditPassword,
  verifyProfitPassword,
  verifyReturnPassword,
  verifyInventoryPassword,
  updateOwnAccount,
  createBranchUser,
  listBranchUsers,
  updateBranchUser,
  deleteBranchUser,
};
