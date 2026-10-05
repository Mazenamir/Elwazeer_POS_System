const express = require('express');
const controller = require('./worn.controller');

const router = express.Router();

router.get('/worn-products/summary', controller.getSummary);
router.get('/worn-products', controller.listWornProducts);
router.post('/worn-products', controller.createWornProduct);
router.patch('/worn-products/:id', controller.updateWornProduct);

module.exports = router;
