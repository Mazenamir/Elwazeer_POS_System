const express = require('express');
const controller = require('./rentals.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

// Rental Inventory - Specific routes before parameterized :id
router.get('/rental-inventory', requirePermission('Rentals.html', 'RentalInventory.html'), controller.listRentalInventory);
router.post('/rental-inventory', requirePermission('Rentals.html', 'RentalInventory.html'), controller.createRentalInventory);
router.post('/rental-inventory/transfer-from-sales', requirePermission('Rentals.html', 'RentalInventory.html'), controller.transferFromSales);
router.get('/rental-inventory/:id/availability', requirePermission('Rentals.html', 'RentalInventory.html'), controller.checkAvailability);
router.put('/rental-inventory/:id', requirePermission('Rentals.html', 'RentalInventory.html'), controller.updateRentalInventory);
router.delete('/rental-inventory/:id', requirePermission('Rentals.html', 'RentalInventory.html'), controller.deleteRentalInventory);

// Rentals - Specific routes before parameterized :id
router.get('/rentals/summary', requirePermission('Rentals.html'), controller.getRentalsSummary);
router.get('/rentals', requirePermission('Rentals.html'), controller.listRentals);
router.post('/rentals', requirePermission('Rentals.html'), controller.createRental);
router.put('/rentals/:id/status', requirePermission('Rentals.html'), controller.updateRentalStatus);
router.put('/rentals/:id/pickup', requirePermission('Rentals.html'), controller.pickupRental);
router.put('/rentals/:id/cancel', requirePermission('Rentals.html'), controller.cancelRental);
router.put('/rentals/:id/return', requirePermission('Rentals.html'), controller.returnRental);
router.post('/rentals/:id/return', requirePermission('Rentals.html'), controller.returnRental);
router.put('/rentals/:id/settle-payment', requirePermission('Rentals.html'), controller.settleRentalPayment);
router.post('/rentals/:id/settle-payment', requirePermission('Rentals.html'), controller.settleRentalPayment);
router.put('/rentals/:id/sell', requirePermission('Rentals.html'), controller.sellRental);

module.exports = router;
