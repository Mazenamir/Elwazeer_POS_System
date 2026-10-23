const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('./auth.controller');
const { requireAdmin } = require('../../middleware/rbac.middleware');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'كثرة محاولات الدخول، برجاء المحاولة بعد 15 دقيقة' });
  },
});

// Public setup & session routes
router.get('/public/check-setup', controller.checkSetup);
router.post('/public/setup', controller.setup);
router.post('/login', loginLimiter, controller.login);
router.post('/logout', controller.logout);
router.get('/server-time', controller.getServerTime);

// Authenticated session routes
router.get('/me', controller.getMe);
router.post('/verify-password', controller.verifySalaryPassword);
router.post('/verify-invoice-edit-password', controller.verifyInvoiceEditPassword);
router.post('/verify-profit-password', controller.verifyProfitPassword);
router.put('/users/me', controller.updateOwnAccount);

// Admin-managed branch users
router.post('/users/branch', requireAdmin, controller.createBranchUser);
router.get('/users/branch', requireAdmin, controller.listBranchUsers);
router.put('/users/branch/:id', requireAdmin, controller.updateBranchUser);
router.delete('/users/branch/:id', requireAdmin, controller.deleteBranchUser);

module.exports = router;
