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
      'INSERT INTO users (full_name, username, password_hash, role, branch_id, permissions) VALUES ($1, $2, $3, $4, $5, $6)',
      [full_name.trim(), username.trim(), passwordHash, 'admin', branchId, JSON.stringify(ALL_PERMISSIONS)]
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
  const displayName = user.full_name || user.username;
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name || null,
      name: displayName,
      role: user.role,
      branch_id: user.branch_id,
      permissions,
    },
    config.JWT_SECRET,
    { expiresIn: '12h' }
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

  return {
    token,
    user: {
      ...user,
      permissions,
      name: displayName,
      full_name: user.full_name || null,
      branch_name: branchName,
    },
  };
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

async function updateOwnAccount(userId, { username, password, full_name }) {
  const cleanUsername = String(username || '').trim();
  const cleanFullName = full_name !== undefined ? String(full_name || '').trim() : undefined;
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
    let updateSql = 'UPDATE users SET username = $1';
    const params = [cleanUsername];

    if (cleanFullName !== undefined) {
      params.push(cleanFullName);
      updateSql += `, full_name = $${params.length}`;
    }

    if (password && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password, 10);
      params.push(passwordHash);
      updateSql += `, password_hash = $${params.length}`;
    }

    params.push(userId);
    updateSql += ` WHERE id = $${params.length}`;
    await tx.query(updateSql, params);
  });

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  const displayName = user.full_name || user.username;

  const permissions = normalizePermissions(user.permissions);
  const newToken = jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name || null,
      name: displayName,
      role: user.role,
      branch_id: user.branch_id,
      permissions,
    },
    config.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return {
    token: newToken,
    user: {
      ...user,
      permissions,
      name: displayName,
      full_name: user.full_name || null,
    },
  };
}

async function createBranchUser({ full_name, name, username, password, branch_id, role, permissions, employee_id }) {
  const cleanUsername = String(username || '').trim();
  const cleanFullName = String(full_name || name || '').trim();
  if (!cleanUsername || !password) {
    const err = new Error('Username and password required');
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

  let finalPermissions;
  if (Array.isArray(permissions)) {
    finalPermissions = normalizePermissions(permissions);
  } else if (permissions !== undefined && permissions !== null) {
    finalPermissions = normalizePermissions(permissions);
  } else {
    finalPermissions = defaultPermissionsForRole(assignedRole);
  }
  finalPermissions = [...new Set(finalPermissions)];

  if (config.IS_BRANCH_MODE) {
    const userCheck = db.sqlite.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (userCheck) {
      const err = new Error('Username already exists');
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
      INSERT INTO users (full_name, username, password_hash, role, branch_id, permissions, employee_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cleanFullName || null, cleanUsername, passwordHash, assignedRole, assignedBranchId, JSON.stringify(finalPermissions), assignedEmployeeId);

    return {
      id: info.lastInsertRowid,
      full_name: cleanFullName || null,
      name: cleanFullName || cleanUsername,
      username: cleanUsername,
      role: assignedRole,
      branch_id: assignedBranchId,
      branch_name: branch?.name || null,
      permissions: finalPermissions,
      employee_id: assignedEmployeeId,
    };
  }

  const userCheck = await db.query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
  if (userCheck.rows.length > 0) {
    const err = new Error('Username already exists');
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
    `INSERT INTO users (full_name, username, password_hash, role, branch_id, permissions, employee_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, full_name, username, role, branch_id, permissions, employee_id`,
    [cleanFullName || null, cleanUsername, passwordHash, assignedRole, assignedBranchId, JSON.stringify(finalPermissions), assignedEmployeeId]
  );

  return {
    ...rows[0],
    name: rows[0].full_name || rows[0].username,
    branch_name: branchName,
    permissions: normalizePermissions(rows[0].permissions),
  };
}

async function listBranchUsers() {
  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.permissions, u.employee_id,
             COALESCE(u.full_name, u.username) as name,
             b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.role != 'admin'
      ORDER BY u.id DESC
    `).all();
    return rows.map((r) => ({
      ...r,
      permissions: normalizePermissions(r.permissions),
    }));
  }

  const { rows } = await db.query(`
    SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.permissions, u.employee_id,
           COALESCE(u.full_name, e.name, u.username) as name,
           COALESCE(u.full_name, e.name, u.username) as full_name,
           b.name as branch_name,
           e.name as employee_name
    FROM users u
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN employees e ON u.employee_id = e.id
    WHERE u.role != 'admin'
    ORDER BY u.id DESC
  `);
  return rows.map((r) => ({
    ...r,
    permissions: normalizePermissions(r.permissions),
  }));
}

async function updateBranchUser(id, { full_name, name, username, password, branch_id, role, permissions, employee_id }) {
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
    finalPermissions = normalizePermissions(permissions);
  } else if (permissions !== undefined && permissions !== null) {
    finalPermissions = normalizePermissions(permissions);
  }
  if (finalPermissions) {
    finalPermissions = [...new Set(finalPermissions)];
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
    const targetEmployeeId = assignedEmployeeId !== undefined ? assignedEmployeeId : existing.employee_id;

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

    const permissionsToSave = finalPermissions !== undefined ? JSON.stringify(finalPermissions) : existing.permissions;

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
            employee_id = COALESCE(?, employee_id)
        WHERE id = ?
      `).run(
        cleanFullName !== undefined ? cleanFullName : null,
        cleanUsername,
        passwordHash,
        targetRole,
        targetBranchId,
        permissionsToSave,
        targetEmployeeId,
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
            employee_id = COALESCE(?, employee_id)
        WHERE id = ?
      `).run(
        cleanFullName !== undefined ? cleanFullName : null,
        cleanUsername,
        targetRole,
        targetBranchId,
        permissionsToSave,
        targetEmployeeId,
        id
      );
    }

    const updated = db.sqlite.prepare(`
      SELECT u.id, u.full_name, u.username, u.role, u.branch_id, u.permissions, u.employee_id,
             COALESCE(u.full_name, u.username) as name,
             b.name as branch_name
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = ?
    `).get(id);

    return {
      ...updated,
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

  let query = 'UPDATE users SET username = $1, role = $2, branch_id = $3';
  const params = [cleanUsername, targetRole, targetBranchId];

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
  query += ` WHERE id = $${params.length} RETURNING id, full_name, username, role, branch_id, permissions, employee_id`;

  const { rows } = await db.query(query, params);
  const updatedUser = rows[0];

  let branchName = null;
  if (assignedBranchId) {
    const bRes = await db.query('SELECT name FROM branches WHERE id = $1', [assignedBranchId]);
    branchName = bRes.rows[0]?.name || null;
  }

  return {
    ...updatedUser,
    name: updatedUser.full_name || updatedUser.username,
    branch_name: branchName,
    permissions: normalizePermissions(updatedUser.permissions),
  };
}

async function deleteBranchUser(id) {
  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(id);
    return { success: true };
  }
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
