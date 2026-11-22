const express = require('express');
const controller = require('./rentals.controller');
const { requirePermission } = require('../../middleware/auth.middleware');
const { productUploadMiddleware } = require('../../middleware/upload.middleware');
const { requireBranchRentalsEnabled } = require('../../middleware/branchScope.middleware');

const router = express.Router();
router.use(requireBranchRentalsEnabled);

// Rental Inventory - Specific routes before parameterized :id
router.get('/rental-inventory', requirePermission('rental_inventory.items.view', 'rental_inventory.items.create', 'rental_inventory.items.edit', 'rentals.contracts.view', 'rentals.contracts.create'), controller.listRentalInventory);
router.get('/rental-inventory/categories', requirePermission('rental_inventory.items.view', 'rental_inventory.items.create', 'rental_inventory.items.edit', 'rentals.contracts.view', 'rentals.contracts.create'), controller.getRentalCategories);
router.post('/rental-inventory', requirePermission('rental_inventory.items.create', 'inventory_admin'), productUploadMiddleware, controller.createRentalInventory);
router.post('/rental-inventory/transfer-from-sales', requirePermission('rental_inventory.items.create', 'inventory_admin'), controller.transferFromSales);
router.get('/rental-inventory/:id/availability', requirePermission('rental_inventory.items.view', 'rentals.contracts.view', 'rentals.contracts.create'), controller.checkAvailability);
router.put('/rental-inventory/:id', requirePermission('rental_inventory.items.edit', 'inventory_admin'), productUploadMiddleware, controller.updateRentalInventory);
router.delete('/rental-inventory/:id', requirePermission('rental_inventory.items.delete', 'inventory_admin'), controller.deleteRentalInventory);

// Rentals - Specific routes before parameterized :id
router.get('/rentals/summary', requirePermission('rentals.contracts.view', 'rentals.contracts.create', 'rentals.contracts.edit'), controller.getRentalsSummary);
router.get('/rentals/preparation', requirePermission('rentals.contracts.view', 'rentals.contracts.create', 'rentals.contracts.edit'), controller.getRentalPreparationList);
router.get('/rentals/history-ledger', requirePermission('rentals.contracts.view', 'rentals.contracts.create', 'rentals.contracts.edit'), controller.getRentalHistoryLedger);
router.post('/rentals/scan-action', requirePermission('rentals.contracts.edit', 'rentals.contracts.return', 'rentals.contracts.create'), controller.handleScanAction);
router.get('/rentals', requirePermission('rentals.contracts.view', 'rentals.contracts.create', 'rentals.contracts.edit'), controller.listRentals);
router.post('/rentals', requirePermission('rentals.contracts.create'), controller.createRental);
router.put('/rentals/:id/prepare', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.setRentalPrepared);
router.put('/rentals/:id/status', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.updateRentalStatus);
router.put('/rentals/:id/pickup', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.pickupRental);
router.put('/rentals/:id/cancel', requirePermission('rentals.contracts.cancel'), controller.cancelRental);
router.put('/rentals/:id/return', requirePermission('rentals.contracts.return', 'rentals.contracts.edit'), controller.returnRental);
router.post('/rentals/:id/return', requirePermission('rentals.contracts.return', 'rentals.contracts.edit'), controller.returnRental);
router.post('/rentals/:id/items', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.addRentalItems);
router.put('/rentals/:id/items', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.addRentalItems);
router.put('/rentals/:id/settle-payment', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.settleRentalPayment);
router.post('/rentals/:id/settle-payment', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.settleRentalPayment);
router.put('/rentals/:id/sell', requirePermission('rentals.contracts.edit', 'rentals.contracts.create'), controller.sellRental);

module.exports = router;
