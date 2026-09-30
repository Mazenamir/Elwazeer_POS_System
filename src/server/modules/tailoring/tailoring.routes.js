const express = require('express');
const controller = require('./tailoring.controller');

const router = express.Router();

// Alterations
router.get('/alterations', controller.listAlterations);
router.post('/alterations', controller.createAlteration);
router.patch('/alterations/:id', controller.updateAlteration);
router.delete('/alterations/:id', controller.deleteAlteration);

// Tailoring Orders
router.get('/tailoring-orders', controller.listTailoringOrders);
router.post('/tailoring-orders', controller.createTailoringOrder);
router.delete('/tailoring-orders/:id', controller.deleteTailoringOrder);
router.put('/tailoring-orders/:id/pay-remaining', controller.payRemainingTailoringOrder);

module.exports = router;
