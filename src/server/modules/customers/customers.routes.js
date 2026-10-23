const express = require('express');
const controller = require('./customers.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/customers', requirePermission('Customers.html'), controller.listCustomers);
router.post('/customers', requirePermission('Customers.html'), controller.createCustomer);
router.put('/customers/:id', requirePermission('Customers.html'), controller.updateCustomer);
router.delete('/customers/:id', requirePermission('Customers.html'), controller.deleteCustomer);
router.get('/customers/:id/history', requirePermission('Customers.html'), controller.getCustomerHistory);

module.exports = router;
