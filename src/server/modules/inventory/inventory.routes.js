const express = require('express');
const controller = require('./inventory.controller');
const { requireInventoryAdmin } = require('../../middleware/rbac.middleware');
const { productUploadMiddleware } = require('../../middleware/upload.middleware');

const router = express.Router();

// Lookups and Metadata
router.get('/inventory/metadata', controller.getMetadata);
router.get('/inventory/models', controller.getModels);
router.get('/inventory/barcodes', controller.getBarcodes);
router.get('/inventory/variants', controller.getVariants);
router.get('/inventory/names', controller.listProductNames);
router.get('/products/names', controller.listProductNames);

// Colors APIs
router.get('/colors', controller.listColors);
router.post('/colors', requireInventoryAdmin, controller.createColor);
router.get('/inventory/colors', controller.listColors);
router.post('/inventory/colors', requireInventoryAdmin, controller.createColor);

// Sizes APIs
router.get('/sizes', controller.listSizes);
router.post('/sizes', requireInventoryAdmin, controller.createSize);
router.get('/inventory/sizes', controller.listSizes);
router.post('/inventory/sizes', requireInventoryAdmin, controller.createSize);

// Stock Transfers
router.post('/inventory/transfer', controller.transferStock);
router.get('/inventory/transfers/requests', controller.listTransferRequests);
router.post('/inventory/transfers/:id/approve', controller.approveTransfer);
router.post('/inventory/transfers/:id/reject', controller.rejectTransfer);
router.get('/inventory/transfers/incoming', controller.listIncomingTransfers);
router.post('/inventory/transfers/:id/receive', controller.receiveTransfer);

// Products CRUD
router.post('/inventory/duplicate-check', controller.checkDuplicatesBatch);
router.get('/inventory/duplicate-check', controller.checkDuplicateSingle);
router.get('/inventory/search', controller.searchInventory);
router.get('/inventory', controller.listInventory);
router.get('/products', controller.listInventory);
router.get('/inventory/:id', controller.getInventoryById);
router.post('/inventory', requireInventoryAdmin, productUploadMiddleware, controller.createProduct);
router.put('/inventory/:id', requireInventoryAdmin, productUploadMiddleware, controller.updateProduct);
router.delete('/inventory/:id', requireInventoryAdmin, controller.deleteProduct);

module.exports = router;
