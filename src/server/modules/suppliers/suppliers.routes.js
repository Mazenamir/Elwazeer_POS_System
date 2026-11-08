const express = require('express');
const controller = require('./suppliers.controller');
const { requirePermission, requireInventoryAdmin } = require('../../middleware/auth.middleware');

const router = express.Router();

// Supplier Options (lookup for selects/dropdowns)
router.get('/suppliers/options', requirePermission('inventory_admin', 'Suppliers.html', 'inventory.products.view', 'inventory.products.create', 'suppliers.list.view', 'suppliers.create'), controller.getOptions);

// Suppliers CRUD
router.get('/suppliers', requirePermission('inventory_admin', 'suppliers.list.view'), controller.listSuppliers);
router.post('/suppliers', requirePermission('inventory_admin', 'suppliers.create'), controller.createSupplier);
router.put('/suppliers/:id', requirePermission('inventory_admin', 'suppliers.edit'), controller.updateSupplier);
router.delete('/suppliers/:id', requirePermission('inventory_admin', 'suppliers.delete'), controller.deleteSupplier);

// Supply Records & Restock
router.get('/supply-records', requirePermission('inventory_admin', 'Suppliers.html', 'suppliers.list.view', 'suppliers.purchases.create'), controller.listSupplyRecords);
router.post('/supply-records', requirePermission('inventory_admin', 'suppliers.purchases.create', 'suppliers.create'), controller.createSupplyRecord);
router.post('/inventory/bulk-restock', requirePermission('inventory_admin', 'suppliers.purchases.create', 'suppliers.create'), controller.bulkRestock);

// Transactions, Returns & Statements
router.post('/suppliers/transactions', requirePermission('inventory_admin', 'Suppliers.html', 'suppliers.purchases.create', 'suppliers.edit', 'Expenses.html', 'expenses.create'), controller.createTransaction);
router.post('/suppliers/returns', requirePermission('inventory_admin', 'suppliers.purchases.create', 'suppliers.edit'), controller.processReturn);
router.get('/suppliers/:id/statement', requirePermission('inventory_admin', 'Suppliers.html', 'suppliers.list.view', 'Reports.html', 'reports.sales.view'), controller.getStatement);
router.get('/suppliers/ledger', requirePermission('inventory_admin', 'Suppliers.html', 'suppliers.list.view', 'Reports.html', 'reports.sales.view'), controller.getSuppliersLedger);

module.exports = router;
