const express = require('express');
const controller = require('./suppliers.controller');
const { requirePermission, requireInventoryAdmin } = require('../../middleware/auth.middleware');

const router = express.Router();

// Supplier Options (lookup for selects/dropdowns)
router.get('/suppliers/options', requirePermission('Suppliers.html', 'inventory_admin'), controller.getOptions);

// Suppliers CRUD
router.get('/suppliers', requirePermission('Suppliers.html', 'inventory_admin'), controller.listSuppliers);
router.post('/suppliers', requireInventoryAdmin, controller.createSupplier);
router.put('/suppliers/:id', requireInventoryAdmin, controller.updateSupplier);
router.delete('/suppliers/:id', requireInventoryAdmin, controller.deleteSupplier);

// Supply Records & Restock
router.get('/supply-records', requirePermission('Suppliers.html', 'inventory_admin'), controller.listSupplyRecords);
router.post('/supply-records', requireInventoryAdmin, controller.createSupplyRecord);
router.post('/inventory/bulk-restock', requireInventoryAdmin, controller.bulkRestock);

// Transactions, Returns & Statements
router.post('/suppliers/transactions', requireInventoryAdmin, controller.createTransaction);
router.post('/suppliers/returns', requireInventoryAdmin, controller.processReturn);
router.get('/suppliers/:id/statement', requirePermission('Suppliers.html', 'inventory_admin'), controller.getStatement);

module.exports = router;
