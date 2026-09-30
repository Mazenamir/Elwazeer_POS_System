const { hasPermission, INVENTORY_ADMIN_PERMISSION } = require('../../shared/constants/permissions');

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    if (res) {
      res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية (مطلوب صلاحية مدير)' });
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
    return res.status(403).json({ error: `غير مصرح لك بالوصول إلى هذه الشاشة (${permission})` });
  };
}

function requireInventoryAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role === 'admin' || hasPermission(req.user, INVENTORY_ADMIN_PERMISSION)) {
    if (typeof next === 'function') return next();
    return true;
  }
  if (res) {
    res.status(403).json({ error: 'مطلوب صلاحية إدارة المخزون' });
  }
  return false;
}

module.exports = {
  requireAdmin,
  requirePermission,
  requireInventoryAdmin,
};
