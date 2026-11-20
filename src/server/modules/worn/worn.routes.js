const express = require('express');
const controller = require('./worn.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/worn-products/summary', requirePermission('worn_products.view', 'worn_products.create', 'worn_products.edit'), controller.getSummary);
router.get('/worn-products', requirePermission('worn_products.view', 'worn_products.create', 'worn_products.edit'), controller.listWornProducts);
router.post('/worn-products', requirePermission('worn_products.create'), controller.createWornProduct);
router.patch('/worn-products/:id', requirePermission('worn_products.edit'), controller.updateWornProduct);
router.delete('/worn-products/:id', requirePermission('worn_products.delete'), controller.deleteWornProduct);

module.exports = router;
