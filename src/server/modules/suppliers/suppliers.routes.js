const express = require('express');
const controller = require('./suppliers.controller');
const { requirePermission, requireInventoryAdmin } = require('../../middleware/auth.middleware');

const router = express.Router();

// Supplier Options (lookup for selects/dropdowns)
router.get('/suppliers/options', requirePermission('Suppliers.html', 'inventory_admin'), controller.getOptions);

// Suppliers CRUD
router.get('/suppliers', requirePermission('Suppliers.html', 'inventory_admin'), controller.listSuppliers);
router.post('/suppliers', requirePermission('inventory_admin', 'suppliers.create'), controller.createSupplier);
router.put('/suppliers/:id', requirePermission('inventory_admin', 'suppliers.edit'), controller.updateSupplier);
router.delete('/suppliers/:id', requirePermission('inventory_admin', 'suppliers.delete'), controller.deleteSupplier);

// Supply Records & Restock
router.get('/supply-records', requirePermission('Suppliers.html', 'inventory_admin'), controller.listSupplyRecords);
router.post('/supply-records', requirePermission('inventory_admin', 'suppliers.purchases.create', 'suppliers.create'), controller.createSupplyRecord);
router.post('/inventory/bulk-restock', requirePermission('inventory_admin', 'suppliers.purchases.create', 'suppliers.create'), controller.bulkRestock);

// Transactions, Returns & Statements
router.post('/suppliers/transactions', requirePermission('Suppliers.html', 'inventory_admin', 'Expenses.html'), controller.createTransaction);
router.post('/suppliers/returns', requirePermission('inventory_admin', 'suppliers.purchases.create', 'suppliers.edit'), controller.processReturn);
router.get('/suppliers/:id/statement', requirePermission('Suppliers.html', 'inventory_admin', 'Reports.html'), controller.getStatement);
router.get('/suppliers/ledger', requirePermission('Suppliers.html', 'inventory_admin', 'Reports.html'), controller.getSuppliersLedger);

module.exports = router;
