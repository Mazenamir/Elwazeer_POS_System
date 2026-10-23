const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { requirePermission } = require('../../middleware/rbac.middleware');

// Dashboard & Top Products shortcuts (requires Dashboard.html permission or admin)
router.get('/dashboard', requirePermission('Dashboard.html'), reportsController.getDashboard);
router.get('/top-products', requirePermission('Dashboard.html'), reportsController.getTopProductsByBranch);

// Reports (requires Reports.html permission or admin)
router.get('/reports/profit', requirePermission('Reports.html'), reportsController.getProfitReport);
router.get('/reports/monthly-history', requirePermission('Reports.html'), reportsController.getMonthlyHistory);
router.get('/reports/daily-history', requirePermission('Reports.html'), reportsController.getDailyHistory);
router.get('/reports/top-products', requirePermission('Reports.html'), reportsController.getTopProductsReport);
router.get('/reports/daily', requirePermission('Reports.html'), reportsController.getDailyReport);

// Additional report queries
router.get('/reports/summary', requirePermission('Reports.html'), reportsController.getSummaryReport);
router.get('/reports/sales', requirePermission('Reports.html'), reportsController.getSalesReport);
router.get('/reports/rentals', requirePermission('Reports.html'), reportsController.getRentalsReport);
router.get('/reports/expenses', requirePermission('Reports.html'), reportsController.getExpensesReport);
router.get('/reports/inventory', requirePermission('Reports.html'), reportsController.getInventoryReport);

// Extended Excel-modeled branch reports
router.get('/reports/extended-daily', requirePermission('Reports.html'), reportsController.getExtendedDailyReport);
router.get('/reports/ohda', requirePermission('Reports.html'), reportsController.getMonthlyOhdaReport);
router.get('/reports/salary-sheet', requirePermission('Reports.html'), reportsController.getMonthlySalarySheet);
router.get('/reports/kpi', requirePermission('Reports.html'), reportsController.getSalesKpiReport);
router.post('/reports/attendance-quick-log', requirePermission('Reports.html'), reportsController.updateDailyAttendanceQuick);

// Exports (.xlsx and printable HTML)
router.get('/reports/export/excel', requirePermission('Reports.html'), reportsController.exportExcel);
router.get('/reports/export/consolidated-excel', requirePermission('Reports.html'), reportsController.exportConsolidatedExcel);
router.get('/reports/export/pdf-html', requirePermission('Reports.html'), reportsController.exportPdfHtml);

module.exports = router;
