const reportsService = require('./reports.service');
const reportsExcel = require('./reports.excel');
const reportsPdf = require('./reports.pdf');

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

/**
 * Excel Export Endpoint (.xlsx)
 * GET /api/reports/export/excel?type=daily_history|monthly_history|profit|top_products|daily_details|sales|rentals|expenses|summary|inventory
 */
async function exportExcel(req, res, next) {
  try {
    const type = req.query.type || 'daily_history';
    const branchName = req.query.branch_name || (req.query.branch_id && req.query.branch_id !== 'all' ? `فرع #${req.query.branch_id}` : 'كافة الفروع');
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
        const data = await reportsService.getDailyReport(req.query, req.user);
        buffer = await reportsExcel.generateDailyReportExcel(data, { branchName, period: data.date || '-' });
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
      case 'daily_details': {
        const data = await reportsService.getDailyReport(req.query, req.user);
        buffer = await reportsExcel.generateDailyReportExcel(data, { branchName, period: data.date || '-' });
        fileName = `daily-report-${data.date || new Date().toISOString().split('T')[0]}.xlsx`;
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
      default: {
        return res.status(400).json({ error: `نوع التقرير غير معروف: ${type}` });
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
    const type = req.query.type || 'daily_history';
    const branchName = req.query.branch_name || (req.query.branch_id && req.query.branch_id !== 'all' ? `فرع #${req.query.branch_id}` : 'كافة الفروع');
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
      default: {
        return res.status(400).json({ error: `نوع التقرير غير معروف: ${type}` });
      }
    }

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
  exportExcel,
  exportPdfHtml,
};
