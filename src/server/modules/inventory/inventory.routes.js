const express = require('express');
const controller = require('./inventory.controller');
const { requireInventoryAdmin, requirePermission } = require('../../middleware/rbac.middleware');
const { productUploadMiddleware } = require('../../middleware/upload.middleware');

const router = express.Router();

// Lookups and Metadata
router.get('/inventory/metadata', controller.getMetadata);
router.get('/inventory/categories', controller.getCategories);
router.get('/inventory/models', controller.getModels);
router.get('/inventory/barcodes', controller.getBarcodes);
router.get('/inventory/variants', controller.getVariants);
router.get('/inventory/names', controller.listProductNames);
router.get('/products/names', controller.listProductNames);

// Colors APIs
router.get('/colors', controller.listColors);
router.post('/colors', requirePermission('inventory_admin', 'inventory.products.create', 'inventory.products.edit'), controller.createColor);
router.get('/inventory/colors', controller.listColors);
router.post('/inventory/colors', requirePermission('inventory_admin', 'inventory.products.create', 'inventory.products.edit'), controller.createColor);

// Sizes APIs
router.get('/sizes', controller.listSizes);
router.post('/sizes', requirePermission('inventory_admin', 'inventory.products.create', 'inventory.products.edit'), controller.createSize);
router.get('/inventory/sizes', controller.listSizes);
router.post('/inventory/sizes', requirePermission('inventory_admin', 'inventory.products.create', 'inventory.products.edit'), controller.createSize);

// Stock Transfers
router.post('/inventory/transfer', requirePermission('inventory_admin', 'inventory.transfers.request'), controller.transferStock);
router.get('/inventory/transfers/requests', requirePermission('inventory_admin', 'inventory.transfers.request', 'inventory.transfers.approve', 'inventory.transfers.view'), controller.listTransferRequests);
router.post('/inventory/transfers/:id/approve', requirePermission('inventory_admin', 'inventory.transfers.approve'), controller.approveTransfer);
router.post('/inventory/transfers/:id/reject', requirePermission('inventory_admin', 'inventory.transfers.approve'), controller.rejectTransfer);
router.get('/inventory/transfers/incoming', requirePermission('inventory_admin', 'inventory.transfers.receive', 'inventory.transfers.view'), controller.listIncomingTransfers);
router.post('/inventory/transfers/:id/receive', requirePermission('inventory_admin', 'inventory.transfers.receive'), controller.receiveTransfer);
router.get('/inventory/transfers/logs', requirePermission('inventory_admin', 'inventory.transfers.view', 'inventory.transfers.request', 'inventory.transfers.approve', 'inventory.transfers.receive'), controller.listTransferLogs);
router.get('/inventory/transfers', requirePermission('inventory_admin', 'inventory.transfers.view', 'inventory.transfers.request', 'inventory.transfers.approve', 'inventory.transfers.receive'), controller.listTransferLogs);

const { requireSensitiveOperation } = require('../../middleware/sensitiveOperation.middleware');

const requireInventoryPassword = requireSensitiveOperation('inventory', 'inventory_mutation');

// Products CRUD
router.get('/inventory/branch-matrix', requirePermission('inventory_admin', 'inventory_view_all_branches', 'inventory.matrix.view'), controller.getBranchMatrix);
router.post('/inventory/duplicate-check', controller.checkDuplicatesBatch);
router.get('/inventory/duplicate-check', controller.checkDuplicateSingle);
router.get('/inventory/search', requirePermission('inventory_admin', 'inventory.products.view', 'pos.sales.view'), controller.searchInventory);
router.get('/inventory', requirePermission('inventory_admin', 'inventory.products.view', 'pos.sales.view'), controller.listInventory);
router.get('/products', requirePermission('inventory_admin', 'inventory.products.view', 'pos.sales.view'), controller.listInventory);
router.get('/inventory/:id', requirePermission('inventory_admin', 'inventory.products.view', 'pos.sales.view'), controller.getInventoryById);
router.post('/inventory', requirePermission('inventory_admin', 'inventory.products.create', 'inventory.products.edit'), productUploadMiddleware, controller.createProduct);
router.put('/inventory/:id', requirePermission('inventory_admin', 'inventory.products.edit'), requireInventoryPassword, productUploadMiddleware, controller.updateProduct);
router.delete('/inventory/:id', requirePermission('inventory_admin', 'inventory.products.delete'), requireInventoryPassword, controller.deleteProduct);
router.post('/inventory/:id/duplicate', requirePermission('inventory_admin', 'inventory.products.duplicate', 'inventory.products.create'), requireInventoryPassword, controller.duplicateProduct);

module.exports = router;
