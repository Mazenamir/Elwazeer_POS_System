const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { requirePermission } = require('../../middleware/rbac.middleware');
const { exportLimiter } = require('../../middleware/rateLimit.middleware');

// Dashboard & Top Products shortcuts (requires Dashboard.html permission or admin)
router.get(['/dashboard', '/reports/dashboard'], requirePermission('dashboard.stats.view'), reportsController.getDashboard);
router.get(['/top-products', '/reports/top-products-by-branch'], requirePermission('dashboard.stats.view', 'reports.sales.view'), reportsController.getTopProductsByBranch);

// Reports
router.get(['/reports/profit', '/profit'], requirePermission('reports.profits.view'), reportsController.getProfitReport);
router.get(['/reports/monthly-history', '/monthly-history'], requirePermission('reports.monthly.view', 'reports.sales.view'), reportsController.getMonthlyHistory);
router.get(['/reports/daily-history', '/daily-history'], requirePermission('reports.daily.view', 'reports.sales.view'), reportsController.getDailyHistory);
router.get(['/reports/top-products', '/top-products-report'], requirePermission('reports.sales.view'), reportsController.getTopProductsReport);
router.get(['/reports/daily', '/daily'], requirePermission('reports.daily.view', 'reports.sales.view', 'cash_drawer.settlement.view'), reportsController.getDailyReport);

// Additional report queries
router.get(['/reports/summary', '/summary'], requirePermission('reports.sales.view', 'reports.daily.view', 'reports.monthly.view'), reportsController.getSummaryReport);
router.get(['/reports/sales', '/sales'], requirePermission('reports.sales.view'), reportsController.getSalesReport);
router.get(['/reports/rentals', '/rentals'], requirePermission('reports.sales.view', 'rentals.contracts.view'), reportsController.getRentalsReport);
router.get(['/reports/expenses', '/expenses'], requirePermission('reports.sales.view', 'expenses.list.view'), reportsController.getExpensesReport);
router.get(['/reports/inventory', '/inventory'], requirePermission('reports.sales.view', 'inventory.products.view'), reportsController.getInventoryReport);

// Extended Excel-modeled branch reports & Master Sheet
const masterSheetRoutes = [
  '/reports/master-sheet',
  '/reports/monthly-master',
  '/reports/master',
  '/master-sheet',
  '/monthly-master',
  '/master',
];
router.get(masterSheetRoutes, requirePermission('reports.master_sheet.view'), reportsController.getMonthlyMasterReport);

router.get(['/reports/extended-daily', '/extended-daily'], requirePermission('reports.daily.view', 'reports.sales.view', 'cash_drawer.settlement.view'), reportsController.getExtendedDailyReport);
router.get(['/reports/ohda', '/ohda'], requirePermission('reports.sales.view', 'reports.monthly.view', 'expenses.list.view', 'employees.payroll.view'), reportsController.getMonthlyOhdaReport);
router.get(['/reports/salary-sheet', '/salary-sheet'], requirePermission('employees.payroll.view', 'reports.sales.view'), reportsController.getMonthlySalarySheet);
router.get(['/reports/kpi', '/kpi'], requirePermission('reports.sales.view', 'reports.monthly.view'), reportsController.getSalesKpiReport);
router.get(['/reports/suppliers-ledger', '/suppliers-ledger'], requirePermission('suppliers.list.view', 'reports.sales.view'), reportsController.getSuppliersLedger);
router.post(['/reports/attendance-quick-log', '/attendance-quick-log'], requirePermission('employees.attendance.edit', 'employees.attendance.view'), reportsController.updateDailyAttendanceQuick);

// Exports (.xlsx and printable HTML)
router.get(['/reports/export/excel', '/export/excel'], requirePermission('reports.export.excel', 'inventory.products.view', 'suppliers.list.view'), exportLimiter, reportsController.exportExcel);
router.get([
  '/reports/export/consolidated-excel',
  '/reports/export/master-excel',
  '/export/consolidated-excel',
  '/export/master-excel',
], requirePermission('reports.export.excel', 'reports.master_sheet.view'), exportLimiter, reportsController.exportConsolidatedExcel);
router.get(['/reports/export/pdf-html', '/export/pdf-html'], requirePermission('reports.export.pdf', 'reports.sales.view'), exportLimiter, reportsController.exportPdfHtml);
router.get([
  '/reports/export/master-pdf',
  '/export/master-pdf',
  '/reports/export/consolidated-pdf',
  '/export/consolidated-pdf',
], requirePermission('reports.export.pdf', 'reports.master_sheet.view'), exportLimiter, reportsController.exportMasterPdf);

module.exports = router;
