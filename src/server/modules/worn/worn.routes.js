const express = require('express');
const controller = require('./worn.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/worn-products/summary', requirePermission('WornProducts.html'), controller.getSummary);
router.get('/worn-products', requirePermission('WornProducts.html'), controller.listWornProducts);
router.post('/worn-products', requirePermission('WornProducts.html'), controller.createWornProduct);
router.patch('/worn-products/:id', requirePermission('WornProducts.html'), controller.updateWornProduct);

module.exports = router;
