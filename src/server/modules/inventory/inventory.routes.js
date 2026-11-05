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
router.post('/inventory/transfer', controller.transferStock);
router.get('/inventory/transfers/requests', controller.listTransferRequests);
router.post('/inventory/transfers/:id/approve', controller.approveTransfer);
router.post('/inventory/transfers/:id/reject', controller.rejectTransfer);
router.get('/inventory/transfers/incoming', controller.listIncomingTransfers);
router.post('/inventory/transfers/:id/receive', controller.receiveTransfer);
router.get('/inventory/transfers/logs', controller.listTransferLogs);
router.get('/inventory/transfers', controller.listTransferLogs);

const { requireSensitiveOperation } = require('../../middleware/sensitiveOperation.middleware');

const requireInventoryPassword = requireSensitiveOperation('inventory', 'inventory_mutation');

// Products CRUD
router.get('/inventory/branch-matrix', controller.getBranchMatrix);
router.post('/inventory/duplicate-check', controller.checkDuplicatesBatch);
router.get('/inventory/duplicate-check', controller.checkDuplicateSingle);
router.get('/inventory/search', controller.searchInventory);
router.get('/inventory', controller.listInventory);
router.get('/products', controller.listInventory);
router.get('/inventory/:id', controller.getInventoryById);
router.post('/inventory', requirePermission('inventory_admin', 'inventory.products.create', 'inventory.products.edit'), productUploadMiddleware, controller.createProduct);
router.put('/inventory/:id', requireInventoryAdmin, requireInventoryPassword, productUploadMiddleware, controller.updateProduct);
router.delete('/inventory/:id', requireInventoryAdmin, requireInventoryPassword, controller.deleteProduct);
router.post('/inventory/:id/duplicate', requireInventoryAdmin, requireInventoryPassword, controller.duplicateProduct);

module.exports = router;
