/**
 * Elwazeer POS System — Multi-Branch Access Control & Scoping Engine
 * Supports:
 *   - Scope A: 'all' (unrestricted all branches)
 *   - Scope B: 'selected' (explicit list of authorized branches)
 *   - Scope C: 'single' (locked to assigned primary branch)
 * Strict Server-Side Query & Mutation Enforcement
 */

const db = require('../database/connection');
const config = require('../config/env');

/**
 * Returns null if user has unrestricted all-branch access (admin or scope='all').
 * Otherwise returns an array of integer branch IDs.
 */
function getUserAuthorizedBranchIds(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.branch_scope === 'all') {
    return null; // null indicates all branches allowed
  }

  const ids = new Set();
  if (user.branch_id && Number(user.branch_id) > 0) {
    ids.add(Number(user.branch_id));
  }

  if (user.branch_scope === 'selected' && user.branch_ids) {
    let parsed = [];
    if (Array.isArray(user.branch_ids)) {
      parsed = user.branch_ids;
    } else if (typeof user.branch_ids === 'string') {
      try {
        parsed = JSON.parse(user.branch_ids);
      } catch {
        parsed = [];
      }
    }
    if (Array.isArray(parsed)) {
      parsed.forEach((id) => {
        const num = Number(id);
        if (num > 0) ids.add(num);
      });
    }
  }

  return Array.from(ids);
}

/**
 * Checks whether user is permitted to interact with targetBranchId.
 * targetBranchId can be number, string, or 'all'/null for consolidated access.
 */
function hasBranchAccess(user, targetBranchId) {
  if (!user) return false;
  if (user.role === 'admin' || user.branch_scope === 'all') {
    return true;
  }

  // Requesting all branches or unassigned
  if (targetBranchId === null || targetBranchId === undefined || targetBranchId === '' || targetBranchId === 'all') {
    return false; // Non-admin without 'all' scope cannot access consolidated 'all'
  }

  const targetId = Number(targetBranchId);
  if (!targetId || isNaN(targetId)) return false;

  const authorized = getUserAuthorizedBranchIds(user);
  if (authorized === null) return true;
  return authorized.includes(targetId);
}

/**
 * Validates branch access and throws a 403 Forbidden Error if unauthorized.
 */
function validateBranchAccess(user, targetBranchId) {
  if (!hasBranchAccess(user, targetBranchId)) {
    const err = new Error('غير مصرح لك بالوصول إلى بيانات هذا الفرع');
    err.statusCode = 403;
    err.status = 403;
    throw err;
  }
}

/**
 * Express middleware to validate branch access from req.params, req.query, or req.body
 */
function requireBranchAccess(extractor) {
  return function branchAccessMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let branchId = null;
    if (typeof extractor === 'function') {
      branchId = extractor(req);
    } else if (typeof extractor === 'string') {
      branchId = req.params[extractor] || req.query[extractor] || req.body?.[extractor];
    } else {
      branchId = req.params.branch_id || req.query.branch_id || req.body?.branch_id;
    }

    if (branchId !== undefined && branchId !== null && branchId !== '') {
      if (!hasBranchAccess(req.user, branchId)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول إلى بيانات هذا الفرع' });
      }
    }
    next();
  };
}

/**
 * Checks whether a branch has the rentals module enabled
 */
async function isBranchRentalsEnabled(branchId) {
  const targetId = Number(branchId);
  if (!targetId) return true;

  try {
    if (config.IS_BRANCH_MODE) {
      const row = db.sqlite.prepare('SELECT rentals_enabled FROM branches WHERE id = ?').get(targetId);
      if (!row) return true;
      return Number(row.rentals_enabled) !== 0;
    }

    const { rows } = await db.query('SELECT rentals_enabled FROM branches WHERE id = $1', [targetId]);
    if (rows.length === 0) return true;
    return rows[0].rentals_enabled !== false;
  } catch (err) {
    return true; // Fallback to enabled if column check encounters unexpected error
  }
}

/**
 * Middleware that verifies rentals are enabled for the target branch
 */
async function requireBranchRentalsEnabled(reqOrBranchId, res = null, next = null) {
  let branchId = null;
  if (typeof reqOrBranchId === 'number' || (typeof reqOrBranchId === 'string' && !isNaN(Number(reqOrBranchId)))) {
    branchId = Number(reqOrBranchId);
  } else if (typeof reqOrBranchId === 'object' && reqOrBranchId !== null) {
    branchId = reqOrBranchId.body?.branch_id || reqOrBranchId.query?.branch_id || reqOrBranchId.user?.branch_id;
  }

  if (branchId) {
    const enabled = await isBranchRentalsEnabled(branchId);
    if (!enabled) {
      const err = new Error('قسم التأجير معطل في هذا الفرع');
      err.statusCode = 400;
      if (res && typeof res.status === 'function') {
        return res.status(400).json({ error: 'قسم التأجير معطل في هذا الفرع', code: 'RENTALS_DISABLED' });
      }
      throw err;
    }
  }
  if (typeof next === 'function') {
    next();
  }
}

module.exports = {
  getUserAuthorizedBranchIds,
  hasBranchAccess,
  validateBranchAccess,
  requireBranchAccess,
  isBranchRentalsEnabled,
  requireBranchRentalsEnabled,
};
