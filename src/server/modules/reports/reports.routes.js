const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');

// Dashboard & Top Products shortcuts
router.get('/dashboard', reportsController.getDashboard);
router.get('/top-products', reportsController.getTopProductsByBranch);

// Reports
router.get('/reports/profit', reportsController.getProfitReport);
router.get('/reports/monthly-history', reportsController.getMonthlyHistory);
router.get('/reports/daily-history', reportsController.getDailyHistory);
router.get('/reports/top-products', reportsController.getTopProductsReport);
router.get('/reports/daily', reportsController.getDailyReport);

module.exports = router;
