const express = require('express');
const controller = require('./suppliers.controller');
const { requirePermission, requireInventoryAdmin } = require('../../middleware/auth.middleware');

const router = express.Router();

// Supplier Options (lookup for selects/dropdowns)
router.get('/suppliers/options', requirePermission('inventory_admin', 'Suppliers.html', 'inventory.products.view', 'inventory.products.create', 'suppliers.list.view', 'suppliers.create'), controller.getOptions);

// Suppliers CRUD
router.get('/suppliers', requirePermission('suppliers.list.view'), controller.listSuppliers);
router.post('/suppliers', requirePermission('suppliers.create'), controller.createSupplier);
router.put('/suppliers/:id', requirePermission('suppliers.edit'), controller.updateSupplier);
router.delete('/suppliers/:id', requirePermission('suppliers.delete'), controller.deleteSupplier);

// Supply Records & Restock
router.get('/supply-records', requirePermission('suppliers.list.view', 'suppliers.purchases.create'), controller.listSupplyRecords);
router.post('/supply-records', requirePermission('suppliers.purchases.create', 'suppliers.create'), controller.createSupplyRecord);
router.post('/inventory/bulk-restock', requirePermission('suppliers.purchases.create', 'suppliers.create'), controller.bulkRestock);

// Transactions, Returns & Statements
router.post('/suppliers/transactions', requirePermission('suppliers.purchases.create', 'suppliers.edit'), controller.createTransaction);
router.post('/suppliers/returns', requirePermission('suppliers.purchases.create', 'suppliers.edit'), controller.processReturn);
router.get('/suppliers/:id/statement', requirePermission('suppliers.list.view'), controller.getStatement);
router.get('/suppliers/ledger', requirePermission('suppliers.list.view'), controller.getSuppliersLedger);

module.exports = router;
