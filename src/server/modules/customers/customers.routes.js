const express = require('express');
const controller = require('./customers.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

router.get('/customers', requirePermission('customers.list.view', 'customers.create', 'customers.edit'), controller.listCustomers);
router.post('/customers', requirePermission('customers.create'), controller.createCustomer);
router.put('/customers/:id', requirePermission('customers.edit'), controller.updateCustomer);
router.delete('/customers/:id', requirePermission('customers.delete'), controller.deleteCustomer);
router.get('/customers/:id/history', requirePermission('customers.list.view', 'customers.create', 'customers.edit'), controller.getCustomerHistory);

module.exports = router;
