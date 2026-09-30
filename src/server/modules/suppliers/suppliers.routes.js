const express = require('express');
const controller = require('./suppliers.controller');
const { requireInventoryAdmin } = require('../../middleware/rbac.middleware');

const router = express.Router();

// Supplier Options (lookup for selects/dropdowns)
router.get('/suppliers/options', controller.getOptions);

// Suppliers CRUD
router.get('/suppliers', controller.listSuppliers);
router.post('/suppliers', requireInventoryAdmin, controller.createSupplier);
router.put('/suppliers/:id', requireInventoryAdmin, controller.updateSupplier);
router.delete('/suppliers/:id', requireInventoryAdmin, controller.deleteSupplier);

// Supply Records & Restock
router.get('/supply-records', controller.listSupplyRecords);
router.post('/supply-records', controller.createSupplyRecord);
router.post('/inventory/bulk-restock', controller.bulkRestock);

// Transactions, Returns & Statements
router.post('/suppliers/transactions', controller.createTransaction);
router.post('/suppliers/returns', controller.processReturn);
router.get('/suppliers/:id/statement', controller.getStatement);

module.exports = router;
