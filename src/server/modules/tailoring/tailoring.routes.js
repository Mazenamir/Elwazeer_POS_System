const express = require('express');
const controller = require('./tailoring.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

// Alterations
router.get('/alterations', requirePermission('Alterations.html', 'Tailoring.html'), controller.listAlterations);
router.post('/alterations', requirePermission('Alterations.html', 'Tailoring.html'), controller.createAlteration);
router.patch('/alterations/:id', requirePermission('Alterations.html', 'Tailoring.html'), controller.updateAlteration);
router.delete('/alterations/:id', requirePermission('Alterations.html', 'Tailoring.html'), controller.deleteAlteration);

// Tailoring Orders
router.get('/tailoring-orders', requirePermission('Tailoring.html', 'Alterations.html'), controller.listTailoringOrders);
router.post('/tailoring-orders', requirePermission('Tailoring.html', 'Alterations.html'), controller.createTailoringOrder);
router.delete('/tailoring-orders/:id', requirePermission('Tailoring.html', 'Alterations.html'), controller.deleteTailoringOrder);
router.put('/tailoring-orders/:id/pay-remaining', requirePermission('Tailoring.html', 'Alterations.html'), controller.payRemainingTailoringOrder);

module.exports = router;
