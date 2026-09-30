const express = require('express');
const controller = require('./rentals.controller');

const router = express.Router();

// Rental Inventory - Specific routes before parameterized :id
router.get('/rental-inventory', controller.listRentalInventory);
router.post('/rental-inventory', controller.createRentalInventory);
router.post('/rental-inventory/transfer-from-sales', controller.transferFromSales);
router.get('/rental-inventory/:id/availability', controller.checkAvailability);
router.put('/rental-inventory/:id', controller.updateRentalInventory);
router.delete('/rental-inventory/:id', controller.deleteRentalInventory);

// Rentals - Specific routes before parameterized :id
router.get('/rentals/summary', controller.getRentalsSummary);
router.get('/rentals', controller.listRentals);
router.post('/rentals', controller.createRental);
router.put('/rentals/:id/pickup', controller.pickupRental);
router.put('/rentals/:id/cancel', controller.cancelRental);
router.put('/rentals/:id/return', controller.returnRental);
router.put('/rentals/:id/sell', controller.sellRental);

module.exports = router;
