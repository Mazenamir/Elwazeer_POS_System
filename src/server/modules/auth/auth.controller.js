const authService = require('./auth.service');
const sensitiveService = require('./sensitivePassword.service');
const config = require('../../config/env');
const db = require('../../database/connection');
const { getDatabaseCairoNow, getCairoDateTimeParts, CAIRO_TIME_ZONE } = require('../../../shared/utils/date');
const {
  HIERARCHICAL_CATALOG,
  PERMISSION_DEFINITIONS,
  normalizePermissions,
  hasPermission,
} = require('../../../shared/constants/permissions');

async function checkSetup(req, res, next) {
  try {
    const needsSetup = await authService.checkNeedsSetup();
    res.json({ needsSetup });
  } catch (err) {
    next(err);
  }
}

async function setup(req, res, next) {
  try {
    const result = await authService.executeSetup(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const { token, user } = await authService.authenticateUser(username, password);

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const isBranchMode = Boolean(config.IS_BRANCH_MODE);
    res.json({
      success: true,
      token,
      user: {
        ...user,
        is_branch: isBranchMode,
        app_mode: isBranchMode ? 'branch' : 'master',
      },
      role: user.role,
      branch_id: user.branch_id,
      branch_scope: user.branch_scope,
      branch_ids: user.branch_ids,
      is_branch: isBranchMode,
      app_mode: isBranchMode ? 'branch' : 'master',
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  res.clearCookie('token');
  res.json({ success: true });
}

async function logoutGet(req, res) {
  res.clearCookie('token');
  res.redirect('/login.html');
}

async function getMe(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (config.IS_BRANCH_MODE) {
      const user = db.sqlite.prepare(`
        SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.permissions,
               u.branch_scope, u.branch_ids, u.token_version,
               COALESCE(u.full_name, u.username) as name,
               b.name as branch_name
        FROM users u
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE u.id = ?
      `).get(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      let branchIds = [];
      if (Array.isArray(user.branch_ids)) branchIds = user.branch_ids;
      else if (typeof user.branch_ids === 'string') {
        try { branchIds = JSON.parse(user.branch_ids); } catch {}
      }

      return res.json({
        user: {
          ...user,
          branch_scope: user.branch_scope || (user.role === 'admin' ? 'all' : 'single'),
          branch_ids: branchIds,
          permissions: normalizePermissions(user.permissions),
          is_branch: true,
          app_mode: 'branch',
        },
      });
    }

    const { rows } = await db.query(`
      SELECT u.id, u.username, u.full_name, u.role, u.branch_id, u.permissions,
             u.branch_scope, u.branch_ids, u.token_version,
             COALESCE(u.full_name, e.name, u.username) as name,
             COALESCE(u.full_name, e.name, u.username) as full_name,
             b.name as branch_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    let branchIds = [];
    if (Array.isArray(rows[0].branch_ids)) branchIds = rows[0].branch_ids;
    else if (typeof rows[0].branch_ids === 'string') {
      try { branchIds = JSON.parse(rows[0].branch_ids); } catch {}
    }

    res.json({
      user: {
        ...rows[0],
        branch_scope: rows[0].branch_scope || (rows[0].role === 'admin' ? 'all' : 'single'),
        branch_ids: branchIds,
        permissions: normalizePermissions(rows[0].permissions),
        is_branch: false,
        app_mode: 'master',
      },
    });
  } catch (err) {
    next(err);
  }
}

async function verifySalaryPassword(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول أولاً' });
    }
    if (!hasPermission(req.user, 'employees.payroll.view') && !hasPermission(req.user, 'Employees.html')) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بالوصول لمسير الرواتب' });
    }

    const { password } = req.body;
    if (password === null || password === undefined || password === '') {
      return res.status(400).json({ ok: false, error: 'كلمة المرور مطلوبة' });
    }

    const targetBranch = req.body?.branch_id || req.user?.branch_id;
    const { hasBranchAccess } = require('../../middleware/branchScope.middleware');
    if (targetBranch && !hasBranchAccess(req.user, targetBranch)) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بالوصول لبيانات هذا الفرع' });
    }

    const ok = await sensitiveService.verifyPassword('salary', password, { user: req.user, req, branchId: targetBranch });
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'كلمة المرور غير صحيحة' });
    }

    const approval = sensitiveService.generateApprovalToken({
      op: 'salary',
      user: req.user,
      branchId: targetBranch,
    });

    res.json({ ok: true, ...approval });
  } catch (err) {
    next(err);
  }
}

async function verifyInvoiceEditPassword(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول أولاً' });
    }
    if (!hasPermission(req.user, 'pos.invoices.edit')) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بتعديل الفواتير' });
    }

    const { password, order_id } = req.body;
    if (password === null || password === undefined || password === '') {
      return res.status(400).json({ ok: false, error: 'كلمة المرور مطلوبة' });
    }

    const targetBranch = req.body?.branch_id || req.user?.branch_id;
    const { hasBranchAccess } = require('../../middleware/branchScope.middleware');
    if (targetBranch && !hasBranchAccess(req.user, targetBranch)) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بالوصول لبيانات هذا الفرع' });
    }

    const ok = await sensitiveService.verifyPassword('invoice_edit', password, {
      user: req.user,
      req,
      resourceId: order_id,
      branchId: targetBranch,
    });

    if (!ok) {
      return res.status(400).json({ ok: false, error: 'كلمة المرور غير صحيحة' });
    }

    const approval = sensitiveService.generateApprovalToken({
      op: 'invoice_edit',
      user: req.user,
      resourceId: order_id,
      branchId: targetBranch,
    });

    res.json({ ok: true, ...approval });
  } catch (err) {
    next(err);
  }
}

async function verifyProfitPassword(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول أولاً' });
    }
    if (!hasPermission(req.user, 'reports.profits.view')) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بعرض بيانات الأرباح' });
    }

    const { password } = req.body;
    if (password === null || password === undefined || password === '') {
      return res.status(400).json({ ok: false, error: 'كلمة المرور مطلوبة' });
    }

    const targetBranch = req.body?.branch_id || req.user?.branch_id;
    const { hasBranchAccess } = require('../../middleware/branchScope.middleware');
    if (targetBranch && !hasBranchAccess(req.user, targetBranch)) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بالوصول لبيانات هذا الفرع' });
    }

    const ok = await sensitiveService.verifyPassword('profit', password, { user: req.user, req, branchId: targetBranch });
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'كلمة مرور الأرباح غير صحيحة' });
    }

    const approval = sensitiveService.generateApprovalToken({
      op: 'profit',
      user: req.user,
      branchId: targetBranch,
    });

    res.json({ ok: true, message: 'تم التحقق بنجاح', ...approval });
  } catch (err) {
    next(err);
  }
}

async function verifyReturnPassword(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول أولاً' });
    }
    if (!hasPermission(req.user, 'pos.invoices.refund')) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك باسترجاع الفواتير' });
    }

    const { password, order_id } = req.body;
    if (password === null || password === undefined || password === '') {
      return res.status(400).json({ ok: false, error: 'كلمة المرور مطلوبة' });
    }

    const targetBranch = req.body?.branch_id || req.user?.branch_id;
    const { hasBranchAccess } = require('../../middleware/branchScope.middleware');
    if (targetBranch && !hasBranchAccess(req.user, targetBranch)) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بالوصول لبيانات هذا الفرع' });
    }

    const ok = await sensitiveService.verifyPassword('return', password, {
      user: req.user,
      req,
      resourceId: order_id,
      branchId: targetBranch,
    });

    if (!ok) {
      return res.status(400).json({ ok: false, error: 'كلمة مرور الاسترجاع غير صحيحة' });
    }

    const approval = sensitiveService.generateApprovalToken({
      op: 'return',
      user: req.user,
      resourceId: order_id,
      branchId: targetBranch,
    });

    res.json({ ok: true, message: 'تم التحقق بنجاح', ...approval });
  } catch (err) {
    next(err);
  }
}

async function verifyInventoryPassword(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول أولاً' });
    }

    const { password, product_id, action } = req.body;

    if (action === 'delete') {
      if (!hasPermission(req.user, 'inventory.products.delete') && !hasPermission(req.user, 'inventory_admin')) {
        return res.status(403).json({ ok: false, error: 'غير مصرح لك بحذف الأصناف' });
      }
    } else if (action === 'duplicate') {
      if (!hasPermission(req.user, 'inventory.products.duplicate') && !hasPermission(req.user, 'inventory_admin')) {
        return res.status(403).json({ ok: false, error: 'غير مصرح لك بنسخ وتكرار الأصناف' });
      }
    } else {
      if (
        !hasPermission(req.user, 'inventory.products.edit') &&
        !hasPermission(req.user, 'inventory.products.delete') &&
        !hasPermission(req.user, 'inventory.products.duplicate') &&
        !hasPermission(req.user, 'inventory_admin')
      ) {
        return res.status(403).json({ ok: false, error: 'غير مصرح لك بإدارة وتعديل المخزون' });
      }
    }
    if (password === null || password === undefined || password === '') {
      return res.status(400).json({ ok: false, error: 'كلمة المرور مطلوبة' });
    }

    const targetBranch = req.body?.branch_id || req.user?.branch_id;
    const { hasBranchAccess } = require('../../middleware/branchScope.middleware');
    if (targetBranch && !hasBranchAccess(req.user, targetBranch)) {
      return res.status(403).json({ ok: false, error: 'غير مصرح لك بالوصول لبيانات هذا الفرع' });
    }

    const ok = await sensitiveService.verifyPassword('inventory', password, {
      user: req.user,
      req,
      resourceId: product_id,
      branchId: targetBranch,
    });

    if (!ok) {
      return res.status(400).json({ ok: false, error: 'كلمة مرور إدارة المخزون غير صحيحة' });
    }

    const approval = sensitiveService.generateApprovalToken({
      op: action || 'inventory',
      user: req.user,
      resourceId: product_id,
      branchId: targetBranch,
    });

    res.json({ ok: true, message: 'تم التحقق بنجاح', ...approval });
  } catch (err) {
    next(err);
  }
}

async function getSensitivePasswordStatus(req, res, next) {
  try {
    const status = await sensitiveService.getSensitivePasswordStatus({ req, user: req.user });
    res.json(status);
  } catch (err) {
    next(err);
  }
}

async function updateSensitivePassword(req, res, next) {
  try {
    const { type, password, new_password, newPassword, confirm_password, confirmPassword } = req.body;
    if (!type) return res.status(400).json({ error: 'نوع العملية الحساسة مطلوب' });
    const effectivePassword = password || new_password || newPassword;
    const effectiveConfirm = confirm_password || confirmPassword || effectivePassword;
    const result = await sensitiveService.updateSensitivePassword(
      type,
      {
        password: effectivePassword,
        new_password: effectivePassword,
        confirm_password: effectiveConfirm,
      },
      req.user
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteSensitivePassword(req, res, next) {
  try {
    const type = req.params?.type || req.body?.type;
    if (!type) return res.status(400).json({ error: 'نوع العملية الحساسة مطلوب' });
    const result = await sensitiveService.removeSensitivePassword(type, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateOwnAccount(req, res, next) {
  try {
    const userId = req.user.id;
    const { token, user } = await authService.updateOwnAccount(userId, req.body);

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, message: 'Account updated', token, user });
  } catch (err) {
    next(err);
  }
}

async function createBranchUser(req, res, next) {
  try {
    const user = await authService.createBranchUser(req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function listBranchUsers(req, res, next) {
  try {
    const users = await authService.listBranchUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function updateBranchUser(req, res, next) {
  try {
    const user = await authService.updateBranchUser(req.params.id, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function deleteBranchUser(req, res, next) {
  try {
    const result = await authService.deleteBranchUser(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getServerTime(req, res) {
  try {
    const cairoNow = await getDatabaseCairoNow(db);
    res.json({
      timezone: CAIRO_TIME_ZONE,
      now: cairoNow.iso_local,
      epoch_ms: Number(cairoNow.epoch_ms),
      date: cairoNow.date,
      time: cairoNow.time,
      month: cairoNow.month,
    });
  } catch (err) {
    const fallback = getCairoDateTimeParts();
    res.json({
      timezone: CAIRO_TIME_ZONE,
      now: `${fallback.date}T${fallback.time}:00`,
      epoch_ms: Date.now(),
      date: fallback.date,
      time: fallback.time,
      month: fallback.date.substring(0, 7),
      fallback: true,
    });
  }
}

async function getPermissions(req, res) {
  res.json({
    hierarchical: HIERARCHICAL_CATALOG,
    flat: PERMISSION_DEFINITIONS,
  });
}

module.exports = {
  checkSetup,
  setup,
  login,
  logout,
  logoutGet,
  getMe,
  getPermissions,
  verifySalaryPassword,
  verifyInvoiceEditPassword,
  verifyProfitPassword,
  verifyReturnPassword,
  verifyInventoryPassword,
  getSensitivePasswordStatus,
  updateSensitivePassword,
  deleteSensitivePassword,
  updateOwnAccount,
  createBranchUser,
  listBranchUsers,
  updateBranchUser,
  deleteBranchUser,
  getServerTime,
};
