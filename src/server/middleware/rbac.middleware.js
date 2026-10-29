const { hasPermission, hasInventoryAdminAccess } = require('../../shared/constants/permissions');

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    if (res) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
    return false;
  }
  if (typeof next === 'function') next();
  return true;
}

function requirePermission(...permissions) {
  const flattened = permissions.flat(Infinity);
  return function requirePermission(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    const allowed = flattened.some((p) => {
      if (p === 'inventory_admin') return hasInventoryAdminAccess(req.user);
      return hasPermission(req.user, p);
    });
    if (allowed) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}

function requireInventoryAdmin(req, res, next) {
  if (!req.user) {
    if (res) res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  if (hasInventoryAdminAccess(req.user)) {
    if (typeof next === 'function') return next();
    return true;
  }
  if (res) {
    res.status(403).json({ error: 'Forbidden' });
  }
  return false;
}

module.exports = {
  requireAdmin,
  requirePermission,
  requireInventoryAdmin,
  hasInventoryAdminAccess,
};

