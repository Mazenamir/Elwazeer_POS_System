/**
 * Elwazeer POS System — Sensitive Operations Middleware
 * Enforces admin-controlled password requirements before sensitive mutations / reads
 */

const sensitiveService = require('../modules/auth/sensitivePassword.service');
const auditService = require('../modules/audit/audit.service');

function requireSensitiveOperation(passwordType, operationName) {
  return async function sensitiveOperationMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const resourceId = req.params?.id || req.body?.id || null;
    const branchId = req.body?.branch_id || req.query?.branch_id || req.user?.branch_id;

    // If this operation is not configured with a password, allow through directly without password requirement
    const storedHash = await sensitiveService.getStoredPasswordHash(passwordType);
    if (!storedHash) {
      return next();
    }

    // Check approval token first (header or body)
    const token = req.headers['x-approval-token'] || req.body?.approval_token;
    if (token) {
      try {
        sensitiveService.consumeApprovalToken(token, {
          op: operationName || passwordType,
          user: req.user,
          resourceId,
          branchId,
        });
        await auditService.log({
          userId: req.user.id,
          username: req.user.username,
          action: `sensitive_op_approved_${operationName || passwordType}`,
          resourceType: passwordType,
          resourceId,
          branchId,
          outcome: 'success',
          details: { method: 'approval_token' },
          ipAddress: req.ip,
        });
        return next();
      } catch (err) {
        return res.status(err.statusCode || 403).json({ error: err.message, code: 'INVALID_APPROVAL_TOKEN' });
      }
    }

    // Check direct password in headers or body
    const password =
      req.headers[`x-${passwordType}-password`] ||
      req.headers['x-sensitive-password'] ||
      req.headers['x-invoice-edit-password'] ||
      req.body?.[`${passwordType}_password`] ||
      req.body?.invoice_edit_password ||
      req.body?.sensitive_password ||
      req.query?.[`${passwordType}_password`];

    // Admin accounts bypass password requirement unless an explicit password was sent
    if (req.user.role === 'admin' && !password) {
      await auditService.log({
        userId: req.user.id,
        username: req.user.username,
        action: `sensitive_op_admin_override_${operationName || passwordType}`,
        resourceType: passwordType,
        resourceId,
        branchId,
        outcome: 'success',
        details: { method: 'admin_role' },
        ipAddress: req.ip,
      });
      return next();
    }

    if (!password) {
      const typeArabic = {
        profit: 'عرض الأرباح',
        invoice_edit: 'تعديل الفاتورة',
        return: 'استرجاع الفاتورة',
        inventory: 'إدارة وتعديل المخزون',
        salary: 'عرض الرواتب',
      }[passwordType] || 'العمليات الحساسة';

      return res.status(403).json({
        error: `كلمة مرور ${typeArabic} مطلوبة لإتمام هذه العملية`,
        code: 'PASSWORD_REQUIRED',
        passwordType,
      });
    }

    try {
      const isValid = await sensitiveService.verifyPassword(passwordType, password, {
        user: req.user,
        req,
        resourceId,
        branchId,
      });

      if (!isValid) {
        return res.status(403).json({
          error: 'كلمة المرور غير صحيحة',
          code: 'INVALID_PASSWORD',
        });
      }

      await auditService.log({
        userId: req.user.id,
        username: req.user.username,
        action: `sensitive_op_approved_${operationName || passwordType}`,
        resourceType: passwordType,
        resourceId,
        branchId,
        outcome: 'success',
        details: { method: 'password' },
        ipAddress: req.ip,
      });

      next();
    } catch (err) {
      return res.status(err.statusCode || 403).json({ error: err.message });
    }
  };
}

module.exports = {
  requireSensitiveOperation,
};
