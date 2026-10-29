const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { exportLimiter } = require('../../middleware/rateLimit.middleware');

// Dashboard & Top Products shortcuts (requires Dashboard.html permission or admin)
router.get(['/dashboard', '/reports/dashboard'], requirePermission('Dashboard.html'), reportsController.getDashboard);
router.get(['/top-products', '/reports/top-products-by-branch'], requirePermission('Dashboard.html'), reportsController.getTopProductsByBranch);

// Reports (requires Reports.html permission or admin)
router.get(['/reports/profit', '/profit'], requirePermission('Reports.html'), reportsController.getProfitReport);
router.get(['/reports/monthly-history', '/monthly-history'], requirePermission('Reports.html'), reportsController.getMonthlyHistory);
router.get(['/reports/daily-history', '/daily-history'], requirePermission('Reports.html'), reportsController.getDailyHistory);
router.get(['/reports/top-products', '/top-products-report'], requirePermission('Reports.html'), reportsController.getTopProductsReport);
router.get(['/reports/daily', '/daily'], requirePermission('Reports.html'), reportsController.getDailyReport);

// Additional report queries
router.get(['/reports/summary', '/summary'], requirePermission('Reports.html'), reportsController.getSummaryReport);
router.get(['/reports/sales', '/sales'], requirePermission('Reports.html'), reportsController.getSalesReport);
router.get(['/reports/rentals', '/rentals'], requirePermission('Reports.html'), reportsController.getRentalsReport);
router.get(['/reports/expenses', '/expenses'], requirePermission('Reports.html'), reportsController.getExpensesReport);
router.get(['/reports/inventory', '/inventory'], requirePermission('Reports.html'), reportsController.getInventoryReport);

// Extended Excel-modeled branch reports & Master Sheet
const masterSheetRoutes = [
  '/reports/master-sheet',
  '/reports/monthly-master',
  '/reports/master',
  '/master-sheet',
  '/monthly-master',
  '/master',
];
router.get(masterSheetRoutes, requirePermission('Reports.html'), reportsController.getMonthlyMasterReport);

router.get(['/reports/extended-daily', '/extended-daily'], requirePermission('Reports.html'), reportsController.getExtendedDailyReport);
router.get(['/reports/ohda', '/ohda'], requirePermission('Reports.html'), reportsController.getMonthlyOhdaReport);
router.get(['/reports/salary-sheet', '/salary-sheet'], requirePermission('Reports.html'), reportsController.getMonthlySalarySheet);
router.get(['/reports/kpi', '/kpi'], requirePermission('Reports.html'), reportsController.getSalesKpiReport);
router.get(['/reports/suppliers-ledger', '/suppliers-ledger'], requirePermission('Reports.html'), reportsController.getSuppliersLedger);
router.post(['/reports/attendance-quick-log', '/attendance-quick-log'], requirePermission('Reports.html'), reportsController.updateDailyAttendanceQuick);

// Exports (.xlsx and printable HTML)
router.get(['/reports/export/excel', '/export/excel'], requirePermission('Reports.html', 'Suppliers.html'), exportLimiter, reportsController.exportExcel);
router.get([
  '/reports/export/consolidated-excel',
  '/reports/export/master-excel',
  '/export/consolidated-excel',
  '/export/master-excel',
], requirePermission('Reports.html'), exportLimiter, reportsController.exportConsolidatedExcel);
router.get(['/reports/export/pdf-html', '/export/pdf-html'], requirePermission('Reports.html'), exportLimiter, reportsController.exportPdfHtml);
router.get([
  '/reports/export/master-pdf',
  '/export/master-pdf',
  '/reports/export/consolidated-pdf',
  '/export/consolidated-pdf',
], requirePermission('Reports.html'), exportLimiter, reportsController.exportMasterPdf);

module.exports = router;
