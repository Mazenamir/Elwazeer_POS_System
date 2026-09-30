const express = require('express');
const controller = require('./sales.controller');

const router = express.Router();

// POS Sequence
router.get('/next-order-id', controller.getNextOrderId);

// Order Search (must be declared before /orders/:id)
router.get('/orders/search', controller.searchOrders);

// Orders CRUD & Cashier
router.get('/orders', controller.listOrders);
router.post('/orders', controller.createOrder);
router.get('/orders/:id/details', controller.getOrderDetails);
router.post('/orders/:id/pay-remaining', controller.payRemaining);
router.put('/orders/:id', controller.updateOrder);

// Returns
router.get('/returns', controller.listReturns);
router.post('/returns', controller.createReturn);

module.exports = router;
