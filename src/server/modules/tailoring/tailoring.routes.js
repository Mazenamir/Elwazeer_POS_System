const express = require('express');
const controller = require('./tailoring.controller');
const { requirePermission } = require('../../middleware/auth.middleware');

const router = express.Router();

// Alterations
router.get('/alterations', requirePermission('alterations.view', 'alterations.create', 'alterations.edit', 'tailoring.view'), controller.listAlterations);
router.post('/alterations', requirePermission('alterations.create'), controller.createAlteration);
router.patch('/alterations/:id', requirePermission('alterations.edit'), controller.updateAlteration);
router.delete('/alterations/:id', requirePermission('alterations.delete'), controller.deleteAlteration);

// Tailoring Orders
router.get('/tailoring-orders', requirePermission('tailoring.view', 'tailoring.create', 'tailoring.edit', 'alterations.view'), controller.listTailoringOrders);
router.post('/tailoring-orders', requirePermission('tailoring.create'), controller.createTailoringOrder);
router.delete('/tailoring-orders/:id', requirePermission('tailoring.delete', 'tailoring.edit', 'tailoring.create'), controller.deleteTailoringOrder);
router.put('/tailoring-orders/:id/cancel', requirePermission('tailoring.delete', 'tailoring.edit', 'tailoring.create'), controller.deleteTailoringOrder);
router.put('/tailoring-orders/:id/pay-remaining', requirePermission('tailoring.edit', 'tailoring.create'), controller.payRemainingTailoringOrder);

module.exports = router;
