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

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    if (hasPermission(req.user, permission)) {
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

