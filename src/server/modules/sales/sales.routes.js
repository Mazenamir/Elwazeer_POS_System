const express = require('express');
const controller = require('./sales.controller');
const { requirePermission } = require('../../middleware/auth.middleware');
const authService = require('../auth/auth.service');

const router = express.Router();

async function requireInvoiceEditPassword(req, res, next) {
  const password = req.headers['x-invoice-edit-password'] || req.body?.invoice_edit_password;
  if (password && !req.body?.invoice_edit_password) {
    if (!req.body) req.body = {};
    req.body.invoice_edit_password = password;
  }
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  if (!password) {
    return res.status(403).json({ error: 'كلمة مرور تعديل الفاتورة مطلوبة' });
  }
  const isValid = await authService.verifyInvoiceEditPassword(password);
  if (!isValid) {
    return res.status(403).json({ error: 'كلمة مرور تعديل الفاتورة غير صحيحة' });
  }
  next();
}

// POS Sequence
router.get('/next-order-id', requirePermission('index.html'), controller.getNextOrderId);

// Order Search (must be declared before /orders/:id)
router.get('/orders/search', requirePermission('index.html'), controller.searchOrders);

// Orders CRUD & Cashier
router.get('/orders', requirePermission('index.html'), controller.listOrders);
router.post('/orders', requirePermission('index.html'), controller.createOrder);
router.get('/orders/:id/details', requirePermission('index.html'), controller.getOrderDetails);
router.post('/orders/:id/pay-remaining', requirePermission('index.html'), controller.payRemaining);
router.put('/orders/:id', requirePermission('index.html'), requireInvoiceEditPassword, controller.updateOrder);

// Returns
router.get('/returns', requirePermission('index.html'), controller.listReturns);
router.post('/returns', requirePermission('index.html'), controller.createReturn);

module.exports = router;
