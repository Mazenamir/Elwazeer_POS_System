const express = require('express');
const router = express.Router();
const controller = require('./sales.controller');
const { requirePermission } = require('../../middleware/auth.middleware');
const authService = require('../auth/auth.service');

const { requireSensitiveOperation } = require('../../middleware/sensitiveOperation.middleware');

const invoiceEditMw = requireSensitiveOperation('invoice_edit', 'invoice_edit');
async function requireInvoiceEditPassword(req, res, next) {
  return invoiceEditMw(req, res, next);
}

const returnMw = requireSensitiveOperation('return', 'order_return');
async function requireReturnPassword(req, res, next) {
  return returnMw(req, res, next);
}

// POS Sequence
router.get('/next-order-id', requirePermission('pos.sales.view', 'index.html'), controller.getNextOrderId);

// Order Search (must be declared before /orders/:id)
router.get('/orders/search', requirePermission('pos.invoices.search', 'index.html'), controller.searchOrders);

// Orders CRUD & Cashier
router.get('/orders', requirePermission('pos.invoices.view', 'index.html'), controller.listOrders);
router.post('/orders', requirePermission('pos.sales.create', 'index.html'), controller.createOrder);
router.get('/orders/:id/details', requirePermission('pos.invoices.view', 'index.html'), controller.getOrderDetails);
router.post('/orders/:id/pay-remaining', requirePermission('pos.invoices.view', 'index.html'), controller.payRemaining);
router.put('/orders/:id', requirePermission('pos.invoices.edit'), requireInvoiceEditPassword, controller.updateOrder);

// Returns
router.get('/returns', requirePermission('pos.returns.view', 'index.html'), controller.listReturns);
router.post('/returns', requirePermission('pos.invoices.refund'), requireReturnPassword, controller.createReturn);

module.exports = router;
