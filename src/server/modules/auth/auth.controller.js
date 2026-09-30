const authService = require('./auth.service');
const config = require('../../config/env');
const db = require('../../database/connection');
const { getDatabaseCairoNow, getCairoDateTimeParts, CAIRO_TIME_ZONE } = require('../../../shared/utils/date');

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

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.IS_PRODUCTION,
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      role: user.role,
      branch_id: user.branch_id,
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
      const user = db.sqlite.prepare('SELECT id, username, role, branch_id, permissions FROM users WHERE id = ?').get(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ user });
    }

    const { rows } = await db.query(`
      SELECT u.id, u.username, u.role, u.branch_id, u.permissions, e.name as full_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      WHERE u.id = $1
    `, [req.user.id]);

    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

async function verifySalaryPassword(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });

    const ok = await authService.verifySalaryPassword(password);
    if (!ok) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function verifyInvoiceEditPassword(req, res, next) {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'كلمة المرور مطلوبة' });

    const ok = await authService.verifyInvoiceEditPassword(password);
    if (!ok) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function updateOwnAccount(req, res, next) {
  try {
    const userId = req.user.id;
    const { token } = await authService.updateOwnAccount(userId, req.body);

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.IS_PRODUCTION,
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({ success: true, message: 'Account updated' });
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

module.exports = {
  checkSetup,
  setup,
  login,
  logout,
  logoutGet,
  getMe,
  verifySalaryPassword,
  verifyInvoiceEditPassword,
  updateOwnAccount,
  createBranchUser,
  listBranchUsers,
  updateBranchUser,
  deleteBranchUser,
  getServerTime,
};
