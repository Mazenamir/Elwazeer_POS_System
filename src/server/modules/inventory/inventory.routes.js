const express = require('express');
const controller = require('./inventory.controller');
const { requireInventoryAdmin } = require('../../middleware/rbac.middleware');

const router = express.Router();

// Lookups and Metadata
router.get('/inventory/metadata', controller.getMetadata);
router.get('/inventory/models', controller.getModels);
router.get('/inventory/barcodes', controller.getBarcodes);
router.get('/inventory/variants', controller.getVariants);

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
router.post('/inventory', requireInventoryAdmin, controller.createProduct);
router.put('/inventory/:id', requireInventoryAdmin, controller.updateProduct);
router.delete('/inventory/:id', requireInventoryAdmin, controller.deleteProduct);

module.exports = router;
