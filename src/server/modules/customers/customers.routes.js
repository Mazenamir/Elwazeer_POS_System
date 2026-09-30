const express = require('express');
const controller = require('./customers.controller');

const router = express.Router();

router.get('/customers', controller.listCustomers);
router.post('/customers', controller.createCustomer);
router.put('/customers/:id', controller.updateCustomer);
router.delete('/customers/:id', controller.deleteCustomer);
router.get('/customers/:id/history', controller.getCustomerHistory);

module.exports = router;
