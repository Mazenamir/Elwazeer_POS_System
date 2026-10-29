const reportsService = require('./reports.service');
const reportsExcel = require('./reports.excel');
const reportsPdf = require('./reports.pdf');
const { getBranchBranding, getReportBranchId } = require('./reports.helpers');
const db = require('../../database/connection');

async function getDashboard(req, res, next) {
  try {
    const data = await reportsService.getDashboard(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getTopProductsByBranch(req, res, next) {
  try {
    const data = await reportsService.getTopProductsByBranch(req.query, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getProfitReport(req, res, next) {
  try {
    const report = await reportsService.getProfitReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getMonthlyHistory(req, res, next) {
  try {
    const history = await reportsService.getMonthlyHistory(req.query, req.user);
    res.json(history);
  } catch (err) {
    next(err);
  }
}

async function getDailyHistory(req, res, next) {
  try {
    const history = await reportsService.getDailyHistory(req.query, req.user);
    res.json(history);
  } catch (err) {
    next(err);
  }
}

async function getTopProductsReport(req, res, next) {
  try {
    const report = await reportsService.getTopProductsReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getDailyReport(req, res, next) {
  try {
    const report = await reportsService.getDailyReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getSummaryReport(req, res, next) {
  try {
    const report = await reportsService.getSummaryReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getSalesReport(req, res, next) {
  try {
    const report = await reportsService.getSalesReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getRentalsReport(req, res, next) {
  try {
    const report = await reportsService.getRentalsReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getExpensesReport(req, res, next) {
  try {
    const report = await reportsService.getExpensesReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getInventoryReport(req, res, next) {
  try {
    const report = await reportsService.getInventoryReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getExtendedDailyReport(req, res, next) {
  try {
    const report = await reportsService.getExtendedDailyReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getMonthlyOhdaReport(req, res, next) {
  try {
    const report = await reportsService.getMonthlyOhdaReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getMonthlySalarySheet(req, res, next) {
  try {
    const report = await reportsService.getMonthlySalarySheet(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getSalesKpiReport(req, res, next) {
  try {
    const report = await reportsService.getSalesKpiReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function getMonthlyMasterReport(req, res, next) {
  try {
    const report = await reportsService.getMonthlyMasterReport(req.query, req.user);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function updateDailyAttendanceQuick(req, res, next) {
  try {
    const result = await reportsService.updateDailyAttendanceQuick(req.body, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getSuppliersLedger(req, res, next) {
  try {
    const suppliersService = require('../suppliers/suppliers.service');
    const ledger = await suppliersService.getSuppliersLedger(req.query, req.user, req);
    res.json(ledger);
  } catch (err) {
    next(err);
  }
}

async function exportConsolidatedExcel(req, res, next) {
  try {
    const buffer = await reportsExcel.generateConsolidatedBranchExcel(req.query, req.user);
    const month = (req.query.month || new Date().toISOString().slice(0, 7));
    const reportBranchId = getReportBranchId(req.user, req.query);
    const branchSuffix = !reportBranchId || reportBranchId === 'all' ? 'all' : reportBranchId;
    const fileName = `consolidated-report-${branchSuffix}-${month}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

/**
 * Excel Export Endpoint (.xlsx)
 * GET /api/reports/export/excel?type=daily_history|monthly_history|profit|top_products|daily_details|sales|rentals|expenses|summary|inventory
 */
async function exportExcel(req, res, next) {
  try {
    const rawType = req.query.type || 'daily_history';
    const type = String(rawType).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const reportBranchId = getReportBranchId(req.user, req.query);
    const branding = await getBranchBranding(db, reportBranchId);
    const isAll = !reportBranchId || reportBranchId === 'all';
    const branchName = isAll ? 'كل الفروع' : (req.query.branch_name || branding.branchName);
    let buffer;
    let fileName = `report-${type}-${new Date().toISOString().split('T')[0]}.xlsx`;

    switch (type) {
      case 'daily': {
        if (!req.query.date) {
          const data = await reportsService.getDailyHistory(req.query, req.user);
          const period = req.query.date_from || req.query.date_to ? `${req.query.date_from || ''} إلى ${req.query.date_to || ''}` : `آخر ${req.query.days || 30} يوماً`;
          buffer = await reportsExcel.generateDailyHistoryExcel(data, { branchName, period });
          fileName = `daily-history-${new Date().toISOString().split('T')[0]}.xlsx`;
          break;
        }
        const data = await reportsService.getExtendedDailyReport(req.query, req.user);
        buffer = await reportsExcel.generateDailyReportExcel(data, { branchName, date: req.query.date, period: req.query.date || '-' });
        fileName = `daily-report-${data.date || new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'daily_details': {
        const data = await reportsService.getExtendedDailyReport(req.query, req.user);
        buffer = await reportsExcel.generateDailyReportExcel(data, { branchName, date: req.query.date, period: data.date || '-' });
        fileName = `daily-report-${data.date || new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'daily_history': {
        const data = await reportsService.getDailyHistory(req.query, req.user);
        const period = req.query.date_from || req.query.date_to ? `${req.query.date_from || ''} إلى ${req.query.date_to || ''}` : `آخر ${req.query.days || 30} يوماً`;
        buffer = await reportsExcel.generateDailyHistoryExcel(data, { branchName, period });
        fileName = `daily-history-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'monthly':
      case 'monthly_history': {
        const data = await reportsService.getMonthlyHistory(req.query, req.user);
        buffer = await reportsExcel.generateMonthlyHistoryExcel(data, { branchName, period: 'آخر 12 شهراً' });
        fileName = `monthly-history-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'profit': {
        const data = await reportsService.getProfitReport(req.query, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : (data.month || '-');
        buffer = await reportsExcel.generateProfitReportExcel(data, { branchName, period });
        fileName = `profit-report-${data.month || new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'top_products': {
        const data = await reportsService.getTopProductsReport(req.query, req.user);
        buffer = await reportsExcel.generateTopProductsExcel(data, { branchName, period: 'تقرير مبيعات وتأجير الأصناف' });
        fileName = `top-products-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'sales': {
        const data = await reportsService.getSalesReport({ ...req.query, limit: 50000 }, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        buffer = await reportsExcel.generateSalesReportExcel(data, { branchName, period });
        fileName = `sales-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'rentals': {
        const data = await reportsService.getRentalsReport({ ...req.query, limit: 50000 }, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        buffer = await reportsExcel.generateRentalsReportExcel(data, { branchName, period });
        fileName = `rentals-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'expenses': {
        const data = await reportsService.getExpensesReport({ ...req.query, limit: 50000 }, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        buffer = await reportsExcel.generateExpensesReportExcel(data, { branchName, period });
        fileName = `expenses-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'summary': {
        const data = await reportsService.getSummaryReport(req.query, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        buffer = await reportsExcel.generateSummaryReportExcel(data, { branchName, period });
        fileName = `summary-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'inventory': {
        const data = await reportsService.getInventoryReport(req.query, req.user);
        buffer = await reportsExcel.generateInventoryReportExcel(data, { branchName, period: 'جرد المخزون الحالي' });
        fileName = `inventory-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'suppliers': {
        const suppliersService = require('../suppliers/suppliers.service');
        const suppliersData = await suppliersService.listSuppliers({ ...req.query, all: 'true' }, req.user, req);
        const suppliersList = Array.isArray(suppliersData) ? suppliersData : (suppliersData?.items || suppliersData?.suppliers || suppliersData?.data || []);
        buffer = await reportsExcel.generateSuppliersReportExcel(suppliersList, {
          branchName,
          period: 'كافة الموردين والشركات',
        });
        fileName = `suppliers-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'suppliers_ledger': {
        const suppliersService = require('../suppliers/suppliers.service');
        const ledger = await suppliersService.getSuppliersLedger(req.query, req.user, req);
        const startDate = req.query.start_date || req.query.startDate || req.query.date_from || req.query.from || null;
        const endDate = req.query.end_date || req.query.endDate || req.query.date_to || req.query.to || null;
        buffer = await reportsExcel.generateSuppliersLedgerExcel(ledger, {
          branchName,
          period: startDate && endDate
            ? `${startDate} إلى ${endDate}`
            : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات (تراكمي)')),
        });
        fileName = `suppliers-ledger-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'supplier_statement': {
        const suppliersService = require('../suppliers/suppliers.service');
        const supplierId = req.query.supplier_id || req.query.id;
        if (!supplierId) {
          return res.status(400).json({ error: 'محدد المورد مطلوب لتصدير كشف الحساب' });
        }
        const statement = await suppliersService.getSupplierStatement(supplierId, null, req.query, req.user);
        const startDate = req.query.start_date || req.query.startDate || req.query.date_from || req.query.from || null;
        const endDate = req.query.end_date || req.query.endDate || req.query.date_to || req.query.to || null;
        buffer = await reportsExcel.generateSupplierStatementExcel(statement, {
          branchName,
          period: startDate && endDate
            ? `${startDate} إلى ${endDate}`
            : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات (تراكمي)')),
        });
        const supName = (statement.supplier?.name || `supplier_${supplierId}`).replace(/[^\w\u0600-\u06FF]/g, '_');
        fileName = `supplier-statement-${supName}-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'branch_matrix': {
        const inventoryService = require('../inventory/inventory.service');
        const matrixData = await inventoryService.getBranchMatrix({ ...req.query, limit: 10000 }, req.user);
        buffer = await reportsExcel.generateBranchMatrixExcel(matrixData, {
          title: 'تقرير أرصدة البضائع الموزعة بالفروع والمخزن الرئيسي',
          isAdmin: req.user?.role === 'admin',
          user: req.user,
        });
        fileName = `branch-stock-matrix-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'transfer_logs':
      case 'transfers': {
        const inventoryService = require('../inventory/inventory.service');
        const transferData = await inventoryService.listTransferLogs({ ...req.query, limit: 'all' }, req.user);
        const startDate = req.query.date_from || req.query.startDate;
        const endDate = req.query.date_to || req.query.endDate;
        buffer = await reportsExcel.generateTransferLogsExcel(transferData, {
          branchName,
          period: startDate && endDate
            ? `${startDate} إلى ${endDate}`
            : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات')),
        });
        fileName = `branch-transfers-log-${new Date().toISOString().split('T')[0]}.xlsx`;
        break;
      }
      case 'ohda': {
        const data = await reportsService.getMonthlyOhdaReport(req.query, req.user);
        buffer = await reportsExcel.generateOhdaReportExcel(data, { branchName, period: req.query.month || '-' });
        fileName = `ohda-report-${req.query.month || new Date().toISOString().slice(0, 7)}.xlsx`;
        break;
      }
      case 'salary':
      case 'salary_sheet': {
        const data = await reportsService.getMonthlySalarySheet(req.query, req.user);
        buffer = await reportsExcel.generateSalaryReportExcel(data, { branchName, period: req.query.month || '-' });
        fileName = `salary-report-${req.query.month || new Date().toISOString().slice(0, 7)}.xlsx`;
        break;
      }
      case 'kpi': {
        const data = await reportsService.getSalesKpiReport(req.query, req.user);
        buffer = await reportsExcel.generateKpiReportExcel(data, { branchName, period: req.query.month || '-' });
        fileName = `kpi-report-${req.query.month || new Date().toISOString().slice(0, 7)}.xlsx`;
        break;
      }
      case 'master':
      case 'master_sheet':
      case 'monthly_master':
      case 'consolidated': {
        buffer = await reportsExcel.generateConsolidatedBranchExcel(req.query, req.user);
        const month = (req.query.month || new Date().toISOString().slice(0, 7));
        const branchId = req.query.branch_id || 'branch';
        fileName = `consolidated-report-${branchId}-${month}.xlsx`;
        break;
      }
      default: {
        return res.status(400).json({ error: `نوع التقرير غير معروف: ${rawType}` });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

/**
 * Printable / PDF HTML Export Endpoint
 * GET /api/reports/export/pdf-html?type=daily_history|monthly_history|profit|top_products|daily_details|sales|rentals|expenses|summary|inventory
 */
async function exportPdfHtml(req, res, next) {
  try {
    const rawType = req.query.type || 'daily_history';
    const type = String(rawType).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const reportBranchId = getReportBranchId(req.user, req.query);
    const branding = await getBranchBranding(db, reportBranchId);
    const isAll = !reportBranchId || reportBranchId === 'all';
    const branchName = isAll ? 'كل الفروع' : (req.query.branch_name || branding.branchName);
    let html = '';

    switch (type) {
      case 'daily': {
        if (!req.query.date) {
          const data = await reportsService.getDailyHistory(req.query, req.user);
          const period = req.query.date_from || req.query.date_to ? `${req.query.date_from || ''} إلى ${req.query.date_to || ''}` : `آخر ${req.query.days || 30} يوماً`;
          html = reportsPdf.generateDailyHistoryPdfHtml(data, { branchName, period });
          break;
        }
        const data = await reportsService.getDailyReport(req.query, req.user);
        html = reportsPdf.generateDailyDetailsPdfHtml(data, { branchName, period: data.date || '-' });
        break;
      }
      case 'daily_history': {
        const data = await reportsService.getDailyHistory(req.query, req.user);
        const period = req.query.date_from || req.query.date_to ? `${req.query.date_from || ''} إلى ${req.query.date_to || ''}` : `آخر ${req.query.days || 30} يوماً`;
        html = reportsPdf.generateDailyHistoryPdfHtml(data, { branchName, period });
        break;
      }
      case 'monthly':
      case 'monthly_history': {
        const data = await reportsService.getMonthlyHistory(req.query, req.user);
        html = reportsPdf.generateMonthlyHistoryPdfHtml(data, { branchName, period: 'آخر 12 شهراً' });
        break;
      }
      case 'profit': {
        const data = await reportsService.getProfitReport(req.query, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : (data.month || '-');
        html = reportsPdf.generateProfitReportPdfHtml(data, { branchName, period });
        break;
      }
      case 'top_products': {
        const data = await reportsService.getTopProductsReport(req.query, req.user);
        html = reportsPdf.generateTopProductsPdfHtml(data, { branchName, period: 'الأكثر طلباً ومبيعاً' });
        break;
      }
      case 'daily_details': {
        const data = await reportsService.getDailyReport(req.query, req.user);
        html = reportsPdf.generateDailyDetailsPdfHtml(data, { branchName, period: data.date || '-' });
        break;
      }
      case 'sales': {
        const data = await reportsService.getSalesReport({ ...req.query, limit: 50000 }, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        html = reportsPdf.generateSalesPdfHtml(data, { branchName, period });
        break;
      }
      case 'rentals': {
        const data = await reportsService.getRentalsReport({ ...req.query, limit: 50000 }, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        html = reportsPdf.generateRentalsPdfHtml(data, { branchName, period });
        break;
      }
      case 'expenses': {
        const data = await reportsService.getExpensesReport({ ...req.query, limit: 50000 }, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        html = reportsPdf.generateExpensesPdfHtml(data, { branchName, period });
        break;
      }
      case 'summary': {
        const data = await reportsService.getSummaryReport(req.query, req.user);
        const period = data.date_from && data.date_to ? `${data.date_from} إلى ${data.date_to}` : '-';
        html = reportsPdf.generateSummaryPdfHtml(data, { branchName, period });
        break;
      }
      case 'inventory': {
        const data = await reportsService.getInventoryReport(req.query, req.user);
        html = reportsPdf.generateInventoryPdfHtml(data, { branchName, period: 'جرد المخزون الحالي' });
        break;
      }
      case 'suppliers':
      case 'suppliers_ledger': {
        const suppliersService = require('../suppliers/suppliers.service');
        const ledger = await suppliersService.getSuppliersLedger(req.query, req.user, req);
        const startDate = req.query.start_date || req.query.startDate || req.query.date_from || req.query.from || null;
        const endDate = req.query.end_date || req.query.endDate || req.query.date_to || req.query.to || null;
        const period = startDate && endDate
          ? `${startDate} إلى ${endDate}`
          : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات (تراكمي)'));
        html = reportsPdf.generateSuppliersLedgerPdfHtml(ledger, { branchName, period });
        break;
      }
      case 'supplier_statement': {
        const suppliersService = require('../suppliers/suppliers.service');
        const supplierId = req.query.supplier_id || req.query.id;
        if (!supplierId) {
          return res.status(400).json({ error: 'محدد المورد مطلوب لتصدير كشف الحساب' });
        }
        const statement = await suppliersService.getSupplierStatement(supplierId, null, req.query, req.user);
        const startDate = req.query.start_date || req.query.startDate || req.query.date_from || req.query.from || null;
        const endDate = req.query.end_date || req.query.endDate || req.query.date_to || req.query.to || null;
        const period = startDate && endDate
          ? `${startDate} إلى ${endDate}`
          : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات (تراكمي)'));
        html = reportsPdf.generateSupplierStatementPdfHtml(statement, { branchName, period });
        break;
      }
      case 'branch_matrix': {
        const inventoryService = require('../inventory/inventory.service');
        const matrixData = await inventoryService.getBranchMatrix({ ...req.query, limit: 10000 }, req.user);
        html = reportsPdf.generateBranchMatrixPdfHtml(matrixData, {
          branchName,
          title: 'تقرير أرصدة البضائع الموزعة بالفروع والمخزن الرئيسي',
          isAdmin: req.user?.role === 'admin',
          user: req.user,
        });
        break;
      }
      case 'transfer_logs':
      case 'transfers': {
        const inventoryService = require('../inventory/inventory.service');
        const transferData = await inventoryService.listTransferLogs({ ...req.query, limit: 'all' }, req.user);
        const startDate = req.query.date_from || req.query.startDate;
        const endDate = req.query.date_to || req.query.endDate;
        const period = startDate && endDate
          ? `${startDate} إلى ${endDate}`
          : (startDate ? `من ${startDate}` : (endDate ? `حتى ${endDate}` : 'كافة الفترات'));
        html = reportsPdf.generateTransferLogsPdfHtml(transferData, { branchName, period });
        break;
      }
      case 'ohda': {
        const data = await reportsService.getMonthlyOhdaReport(req.query, req.user);
        html = reportsPdf.generateOhdaPdfHtml(data, { branchName, period: req.query.month || '-' });
        break;
      }
      case 'salary':
      case 'salary_sheet': {
        const data = await reportsService.getMonthlySalarySheet(req.query, req.user);
        html = reportsPdf.generateSalaryPdfHtml(data, { branchName, period: req.query.month || '-' });
        break;
      }
      case 'kpi': {
        const data = await reportsService.getSalesKpiReport(req.query, req.user);
        html = reportsPdf.generateKpiPdfHtml(data, { branchName, period: req.query.month || '-' });
        break;
      }
      case 'master':
      case 'master_sheet':
      case 'monthly_master':
      case 'consolidated': {
        const masterReport = await reportsService.getMonthlyMasterReport(req.query, req.user);
        html = reportsPdf.generateConsolidatedPdfHtml(masterReport, {
          branchName: masterReport.branch_name || branchName,
          period: req.query.month || masterReport.month || '-',
          branding: masterReport.branding,
        });
        break;
      }
      default: {
        return res.status(400).json({ error: `نوع التقرير غير معروف: ${rawType}` });
      }
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
}

async function exportMasterPdf(req, res, next) {
  try {
    const query = { ...req.query, type: 'master' };
    const reportBranchId = getReportBranchId(req.user, query);
    const branding = await getBranchBranding(db, reportBranchId);
    const isAll = !reportBranchId || reportBranchId === 'all';
    const branchName = isAll ? 'كل الفروع' : (query.branch_name || branding.branchName);
    const masterReport = await reportsService.getMonthlyMasterReport(query, req.user);
    const html = reportsPdf.generateConsolidatedPdfHtml(masterReport, {
      branchName: masterReport.branch_name || branchName,
      period: query.month || masterReport.month || '-',
      branding: masterReport.branding,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  getTopProductsByBranch,
  getProfitReport,
  getMonthlyHistory,
  getDailyHistory,
  getTopProductsReport,
  getDailyReport,
  getSummaryReport,
  getSalesReport,
  getRentalsReport,
  getExpensesReport,
  getInventoryReport,
  getExtendedDailyReport,
  getMonthlyOhdaReport,
  getMonthlySalarySheet,
  getSalesKpiReport,
  getMonthlyMasterReport,
  updateDailyAttendanceQuick,
  getSuppliersLedger,
  exportConsolidatedExcel,
  exportExcel,
  exportPdfHtml,
  exportMasterPdf,
};
