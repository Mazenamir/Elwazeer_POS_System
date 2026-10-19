const ExcelJS = require('exceljs');
const { sanitizeFormulaValue, formatCairoDateTime } = require('./reports.helpers');

/**
 * Creates a styled ExcelJS Workbook with right-to-left direction and consistent Cairo branding
 */
function createBaseWorkbook(title, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elwazeer POS System';
  workbook.lastModifiedBy = 'Elwazeer POS System';
  workbook.created = new Date();
  workbook.modified = new Date();

  return workbook;
}

function formatMoneyLabel(label, amount) {
  const parsed = Number(amount);
  const num = Number.isFinite(parsed) ? parsed : 0;
  const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const valStr = num < 0 ? `\u200E${formatted} ج.م` : `${formatted} ج.م`;
  return `${label}: ${valStr}`;
}

function applyWorksheetStyles(worksheet, title, options = {}) {
  worksheet.views = [{ rightToLeft: true }];

  // Row 1: Report Title
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 36;

  // Row 2: Metadata (Branch, Period, Generation Time)
  worksheet.mergeCells('A2:F2');
  const metaCell = worksheet.getCell('A2');
  const branchName = options.branchName || 'كافة الفروع (مجمّع)';
  const period = options.period || '-';
  const cairoTime = formatCairoDateTime();
  metaCell.value = `الفرع / النطاق: ${branchName}   |   الفترة: ${period}   |   تاريخ الاستخراج: ${cairoTime}`;
  metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 24;

  // Row 3: Blank separator
  worksheet.getRow(3).height = 10;
}

function formatPaymentMethodLabel(item) {
  if (!item) return '-';
  const splits = Array.isArray(item.payment_splits)
    ? item.payment_splits
    : (typeof item.payment_splits === 'string' ? (() => { try { return JSON.parse(item.payment_splits); } catch { return null; } })() : null);

  if (item.payment_method === 'split' || (splits && splits.length > 1)) {
    if (splits && splits.length > 0) {
      const parts = splits.map(s => {
        const m = String(s.method || '').toLowerCase();
        let mName = 'نقدي';
        if (['visa', 'card', 'بطاقة', 'فيزا'].includes(m)) mName = 'فيزا';
        else if (['bank_transfer', 'instapay', 'bank', 'انستاباي', 'تحويل بنكي'].includes(m)) mName = 'انستاباي';
        else if (['wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة'].includes(m)) mName = 'محفظة';
        else if (['debt', 'آجل'].includes(m)) mName = 'آجل';
        return `${mName}: ${Number(s.amount || 0)}`;
      });
      return `مجزأ (${parts.join(' + ')})`;
    }
    const parts = [];
    if (Number(item.cash_amount) > 0) parts.push(`نقدي: ${item.cash_amount}`);
    if (Number(item.bank_transfer_amount) > 0) parts.push(`انستاباي: ${item.bank_transfer_amount}`);
    if (Number(item.card_amount) > 0) parts.push(`فيزا: ${item.card_amount}`);
    if (Number(item.wallet_amount) > 0) parts.push(`محفظة: ${item.wallet_amount}`);
    return parts.length > 0 ? `مجزأ (${parts.join(' + ')})` : 'مجزأ';
  }

  const m = String(item.payment_method || '').toLowerCase();
  if (m === 'cash' || m === 'نقدي' || m === 'كاش') return 'نقدي';
  if (m === 'visa' || m === 'card' || m === 'فيزا' || m === 'بطاقة') return 'فيزا';
  if (['bank_transfer', 'bank', 'transfer', 'instapay', 'انستاباي', 'تحويل بنكي'].includes(m)) return 'تحويل بنكي / انستاباي';
  if (['wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة'].includes(m)) return 'فودافون كاش / محفظة';
  if (m === 'debt' || m === 'آجل') return 'آجل';
  return item.payment_method || '-';
}

function styleHeaderRow(row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Slate 800
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });
}

function styleDataRow(row, isEven = false) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });
}

function styleTotalRow(row) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });
}

function autoFitColumns(worksheet, minWidth = 14) {
  worksheet.columns.forEach((col) => {
    let maxLen = minWidth;
    col.eachCell({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum > 3) {
        const valStr = cell.value ? String(cell.value) : '';
        if (valStr.length > maxLen) {
          maxLen = Math.min(valStr.length + 4, 45);
        }
      }
    });
    col.width = maxLen;
  });
}

/**
 * 1. Daily Reports History Excel
 */
async function generateDailyHistoryExcel(historyRows, options = {}) {
  const wb = createBaseWorkbook('سجل التقارير اليومية');
  const ws = wb.addWorksheet('التقرير اليومي');
  applyWorksheetStyles(ws, 'سجل حركة الإيرادات والمصروفات اليومية', options);

  const headerRow = ws.getRow(4);
  headerRow.values = [
    'التاريخ',
    'مبيعات الكاشير (ج.م)',
    'متحصلات التأجير (ج.م)',
    'التفصيل والتعديلات (ج.م)',
    'إجمالي الإيرادات (ج.م)',
    'المصروفات التشغيلية (ج.م)',
    'الرواتب والمسحوبات (ج.م)',
    'تكلفة البضاعة (ج.م)',
    'صافي الربح (ج.م)',
  ];
  styleHeaderRow(headerRow);

  let currentLine = 5;
  let totalSales = 0;
  let totalRentals = 0;
  let totalTailoring = 0;
  let totalRev = 0;
  let totalExp = 0;
  let totalSal = 0;
  let totalCogs = 0;
  let totalProfit = 0;

  historyRows.forEach((item, idx) => {
    const row = ws.getRow(currentLine);
    const sales = Number(item.sales ?? item.sales_revenue ?? 0);
    const rentals = Number(item.rentals ?? item.rental_revenue ?? 0);
    const tailoring = Number(item.tailoring ?? item.tailoring_revenue ?? 0);
    const revenue = Number(item.revenue ?? (sales + rentals + tailoring));
    const expenses = Number(item.expenses ?? 0);
    const salaries = Number(item.salaries ?? 0);
    const cogs = Number(item.cogs ?? 0);
    const profit = Number(item.profit ?? item.net_profit ?? (revenue - expenses - salaries - cogs));

    totalSales += sales;
    totalRentals += rentals;
    totalTailoring += tailoring;
    totalRev += revenue;
    totalExp += expenses;
    totalSal += salaries;
    totalCogs += cogs;
    totalProfit += profit;

    row.values = [
      item.date || '-',
      sales,
      rentals,
      tailoring,
      revenue,
      expenses,
      salaries,
      cogs,
      profit,
    ];

    styleDataRow(row, idx % 2 === 1);
    for (let c = 2; c <= 9; c++) {
      row.getCell(c).numFmt = '#,##0.00';
    }
    currentLine++;
  });

  // Totals Row
  const totalRow = ws.getRow(currentLine);
  totalRow.values = [
    'الإجمالي',
    totalSales,
    totalRentals,
    totalTailoring,
    totalRev,
    totalExp,
    totalSal,
    totalCogs,
    totalProfit,
  ];
  styleTotalRow(totalRow);
  for (let c = 2; c <= 9; c++) {
    totalRow.getCell(c).numFmt = '#,##0.00';
  }

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

/**
 * 2. Monthly Financial Overview Excel
 */
async function generateMonthlyHistoryExcel(monthlyRows, options = {}) {
  const wb = createBaseWorkbook('التقرير المالي الشهري');
  const ws = wb.addWorksheet('الملخص الشهري');
  applyWorksheetStyles(ws, 'التقرير المالي وحركة الأرباح الشهرية', options);

  const headerRow = ws.getRow(4);
  headerRow.values = [
    'الشهر',
    'مبيعات الكاشير (ج.م)',
    'متحصلات التأجير (ج.م)',
    'التفصيل والتعديلات (ج.م)',
    'إجمالي الإيرادات (ج.م)',
    'المصروفات التشغيلية (ج.م)',
    'الرواتب والمسحوبات (ج.م)',
    'تكلفة البضاعة (ج.م)',
    'صافي الأرباح (ج.م)',
  ];
  styleHeaderRow(headerRow);

  let currentLine = 5;
  let totalSales = 0;
  let totalRentals = 0;
  let totalTailoring = 0;
  let totalRev = 0;
  let totalExp = 0;
  let totalSal = 0;
  let totalCogs = 0;
  let totalProfit = 0;

  monthlyRows.forEach((m, idx) => {
    const row = ws.getRow(currentLine);
    const sales = Number(m.sales ?? m.sales_revenue ?? 0);
    const rentals = Number(m.rentals ?? m.rental_revenue ?? 0);
    const tailoring = Number(m.tailoring ?? m.tailoring_revenue ?? 0);
    const revenue = Number(m.revenue ?? (sales + rentals + tailoring));
    const expenses = Number(m.expenses ?? 0);
    const salaries = Number(m.salaries ?? 0);
    const cogs = Number(m.cogs ?? 0);
    const profit = Number(m.profit ?? m.net_profit ?? (revenue - expenses - salaries - cogs));

    totalSales += sales;
    totalRentals += rentals;
    totalTailoring += tailoring;
    totalRev += revenue;
    totalExp += expenses;
    totalSal += salaries;
    totalCogs += cogs;
    totalProfit += profit;

    row.values = [
      m.month || '-',
      sales,
      rentals,
      tailoring,
      revenue,
      expenses,
      salaries,
      cogs,
      profit,
    ];

    styleDataRow(row, idx % 2 === 1);
    for (let c = 2; c <= 9; c++) {
      row.getCell(c).numFmt = '#,##0.00';
    }
    currentLine++;
  });

  const totalRow = ws.getRow(currentLine);
  totalRow.values = [
    'الإجمالي',
    totalSales,
    totalRentals,
    totalTailoring,
    totalRev,
    totalExp,
    totalSal,
    totalCogs,
    totalProfit,
  ];
  styleTotalRow(totalRow);
  for (let c = 2; c <= 9; c++) {
    totalRow.getCell(c).numFmt = '#,##0.00';
  }

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

/**
 * 3. Profit & Loss Statement Excel (with branch breakdown & details)
 */
async function generateProfitReportExcel(profitReport, options = {}) {
  const wb = createBaseWorkbook('تقرير الأرباح والخسائر');
  
  // Sheet 1: Consolidated Summary
  const ws1 = wb.addWorksheet('ملخص الأرباح والخسائر');
  applyWorksheetStyles(ws1, 'قائمة الدخل والأرباح والخسائر', options);

  const summary = profitReport.summary || profitReport;
  const kpiData = [
    ['إجمالي الإيرادات (المبيعات والتأجير والتفصيل)', Number(summary.total_revenue || summary.revenue || 0)],
    ['تكلفة البضاعة المباعة (COGS)', Number(summary.cogs || 0)],
    ['مجمل الربح (Gross Profit)', Number(summary.gross_profit || ((summary.total_revenue || 0) - (summary.cogs || 0)))],
    ['المصروفات التشغيلية والنثريات', Number(summary.expenses || 0)],
    ['الرواتب والمسحوبات المدفوعة', Number(summary.total_salaries_paid || summary.salaries || 0)],
    ['صافي الربح النهائي (Net Profit)', Number(summary.net_profit || 0)],
    ['المبلغ المحصّل بالدرج (كاش)', Number(summary.cash_drawer || 0)],
    ['هامش الربح الصافي %', summary.total_revenue ? Number(((summary.net_profit / summary.total_revenue) * 100).toFixed(2)) : 0],
  ];

  const headerRow1 = ws1.getRow(4);
  headerRow1.values = ['البند المالي', 'القيمة (ج.م)'];
  styleHeaderRow(headerRow1);

  kpiData.forEach(([label, val], idx) => {
    const row = ws1.getRow(5 + idx);
    row.values = [label, val];
    styleDataRow(row, idx % 2 === 1);
    if (idx === 7) {
      row.getCell(2).numFmt = '0.00"%"';
    } else {
      row.getCell(2).numFmt = '#,##0.00';
    }
  });

  autoFitColumns(ws1, 24);

  // Sheet 2: Branch Breakdown (if multi-branch)
  if (Array.isArray(profitReport.branch_reports) && profitReport.branch_reports.length > 0) {
    const ws2 = wb.addWorksheet('أداء الفروع');
    applyWorksheetStyles(ws2, 'مقارنة الأداء والأرباح حسب الفروع', options);

    const bHeader = ws2.getRow(4);
    bHeader.values = [
      'الفرع',
      'المبيعات',
      'التأجير',
      'التفصيل',
      'إجمالي الإيرادات',
      'تكلفة البضاعة',
      'المصروفات',
      'الرواتب',
      'صافي الربح',
      'صافي الكاش بالدرج',
    ];
    styleHeaderRow(bHeader);

    profitReport.branch_reports.forEach((b, idx) => {
      const row = ws2.getRow(5 + idx);
      row.values = [
        sanitizeFormulaValue(b.branch_name || `فرع #${b.branch_id}`),
        Number(b.total_sales || 0),
        Number(b.total_rentals || 0),
        Number(b.total_tailoring || 0),
        Number(b.total_revenue || 0),
        Number(b.cogs || 0),
        Number(b.expenses || 0),
        Number(b.total_salaries_paid || 0),
        Number(b.net_profit || 0),
        Number(b.cash_drawer || 0),
      ];
      styleDataRow(row, idx % 2 === 1);
      for (let c = 2; c <= 10; c++) {
        row.getCell(c).numFmt = '#,##0.00';
      }
    });

    autoFitColumns(ws2, 16);
  }

  // Sheet 3: Expenses Details
  if (profitReport.expenses?.items?.length > 0) {
    const wsExp = wb.addWorksheet('تفاصيل المصروفات');
    applyWorksheetStyles(wsExp, 'سجل المصروفات والنثريات التفصيلي', options);

    const expHeader = wsExp.getRow(4);
    expHeader.values = ['التاريخ', 'الفرع', 'البند / التصنيف', 'المبلغ (ج.م)', 'البيان / ملاحظات'];
    styleHeaderRow(expHeader);

    profitReport.expenses.items.forEach((e, idx) => {
      const row = wsExp.getRow(5 + idx);
      row.values = [
        e.expense_date || '-',
        sanitizeFormulaValue(e.branch_name || '-'),
        sanitizeFormulaValue(e.category || '-'),
        Number(e.amount || 0),
        sanitizeFormulaValue(e.notes || '-'),
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(4).numFmt = '#,##0.00';
    });

    autoFitColumns(wsExp, 16);
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 4. Top Selling Products Excel
 */
async function generateTopProductsExcel(data, options = {}) {
  const wb = createBaseWorkbook('المنتجات الأكثر مبيعاً وتأجيراً');
  const salesList = Array.isArray(data) ? data : (data?.top_sales || data?.products || []);
  const rentalsList = Array.isArray(data?.top_rentals) ? data.top_rentals : [];

  const ws = wb.addWorksheet('الأكثر مبيعاً');
  applyWorksheetStyles(ws, 'تقرير المنتجات الأكثر طلباً ومبيعاً', options);

  const headerRow = ws.getRow(4);
  headerRow.values = [
    '#',
    'اسم المنتج',
    'الباركود',
    'القسم / التصنيف',
    'اللون',
    'المقاس',
    'الفرع',
    'الكمية المباعة',
    'إجمالي الإيرادات المحققة (ج.م)',
  ];
  styleHeaderRow(headerRow);

  let currentLine = 5;
  let totalQty = 0;
  let totalRevenue = 0;

  salesList.forEach((p, idx) => {
    const row = ws.getRow(currentLine);
    const qty = Number(p.quantity_sold ?? p.total_sold ?? p.quantity ?? 0);
    const rev = Number(p.total_revenue ?? p.revenue ?? 0);
    totalQty += qty;
    totalRevenue += rev;

    row.values = [
      idx + 1,
      sanitizeFormulaValue(p.name || '-'),
      sanitizeFormulaValue(p.barcode ? String(p.barcode) : '-'),
      sanitizeFormulaValue(p.category || 'عام'),
      sanitizeFormulaValue(p.color || '-'),
      sanitizeFormulaValue(p.size || '-'),
      sanitizeFormulaValue(p.branch_name || '-'),
      qty,
      rev,
    ];

    styleDataRow(row, idx % 2 === 1);
    row.getCell(8).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0.00';
    currentLine++;
  });

  const totalRow = ws.getRow(currentLine);
  totalRow.values = ['الإجمالي', '', '', '', '', '', '', totalQty, totalRevenue];
  styleTotalRow(totalRow);
  totalRow.getCell(8).numFmt = '#,##0';
  totalRow.getCell(9).numFmt = '#,##0.00';

  autoFitColumns(ws);

  // Sheet 2: Top Rentals (if present)
  if (rentalsList.length > 0) {
    const wsRentals = wb.addWorksheet('الأكثر تأجيراً');
    applyWorksheetStyles(wsRentals, 'تقرير المنتجات الأكثر تأجيراً وإقبالاً', options);

    const rHeader = wsRentals.getRow(4);
    rHeader.values = ['#', 'اسم الموديل / القطعة', 'الباركود', 'القسم', 'اللون', 'المقاس', 'الفرع', 'مرات التأجير', 'إجمالي إيراد التأجير (ج.م)'];
    styleHeaderRow(rHeader);

    let rLine = 5;
    let totalTimes = 0;
    let totalRentRev = 0;

    rentalsList.forEach((r, idx) => {
      const row = wsRentals.getRow(rLine);
      const times = Number(r.times_rented ?? 0);
      const rev = Number(r.rental_revenue ?? r.total_revenue ?? 0);
      totalTimes += times;
      totalRentRev += rev;

      row.values = [
        idx + 1,
        sanitizeFormulaValue(r.name || '-'),
        sanitizeFormulaValue(r.barcode ? String(r.barcode) : '-'),
        sanitizeFormulaValue(r.category || '-'),
        sanitizeFormulaValue(r.color || '-'),
        sanitizeFormulaValue(r.size || '-'),
        sanitizeFormulaValue(r.branch_name || '-'),
        times,
        rev,
      ];

      styleDataRow(row, idx % 2 === 1);
      row.getCell(8).numFmt = '#,##0';
      row.getCell(9).numFmt = '#,##0.00';
      rLine++;
    });

    const rTotalRow = wsRentals.getRow(rLine);
    rTotalRow.values = ['الإجمالي', '', '', '', '', '', '', totalTimes, totalRentRev];
    styleTotalRow(rTotalRow);
    rTotalRow.getCell(8).numFmt = '#,##0';
    rTotalRow.getCell(9).numFmt = '#,##0.00';
    autoFitColumns(wsRentals);
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 5. Detailed Daily Invoices Report (Sales, Rentals, Tailoring, Cash)
 */
async function generateDailyReportExcel(dailyData, options = {}) {
  const wb = createBaseWorkbook('تفاصيل التقرير اليومي');
  
  // Sheet 1: Summary by branch
  const wsSummary = wb.addWorksheet('ملخص حركة اليوم');
  applyWorksheetStyles(wsSummary, `التقرير اليومي المفصل - ${options.date || dailyData.date || ''}`, options);

  const headerRow = wsSummary.getRow(4);
  headerRow.values = [
    'الفرع',
    'مبيعات الكاشير',
    'متحصلات التأجير',
    'متحصلات التفصيل',
    'إجمالي الإيرادات',
    'المصروفات',
    'صافي الكاش بالدرج',
  ];
  styleHeaderRow(headerRow);

  const branches = dailyData.branch_sales || [];
  branches.forEach((b, idx) => {
    const row = wsSummary.getRow(5 + idx);
    row.values = [
      sanitizeFormulaValue(b.branch_name || '-'),
      Number(b.total_sales || 0),
      Number(b.total_rentals || 0),
      Number(b.total_tailoring || 0),
      Number(b.total_revenue || 0),
      Number(b.expenses || 0),
      Number(b.cash_drawer || b.cash_in_drawer || b.net_cash || 0),
    ];
    styleDataRow(row, idx % 2 === 1);
    for (let c = 2; c <= 7; c++) {
      row.getCell(c).numFmt = '#,##0.00';
    }
  });

  autoFitColumns(wsSummary);

  // Sheet 2: Sales Invoices
  if (Array.isArray(dailyData.sales_invoices) && dailyData.sales_invoices.length > 0) {
    const wsSales = wb.addWorksheet('فواتير المبيعات');
    applyWorksheetStyles(wsSales, 'سجل فواتير مبيعات اليوم', options);

    const sHeader = wsSales.getRow(4);
    sHeader.values = ['رقم الفاتورة', 'الوقت / التاريخ', 'الكاشير / البائع', 'طريقة الدفع', 'الإجمالي (ج.م)', 'المدفوع (ج.م)', 'المتبقي (ج.م)'];
    styleHeaderRow(sHeader);

    dailyData.sales_invoices.forEach((inv, idx) => {
      const row = wsSales.getRow(5 + idx);
      row.values = [
        sanitizeFormulaValue(String(inv.invoice_number || '-')),
        inv.created_date || '-',
        sanitizeFormulaValue(inv.cashier_name || '-'),
        formatPaymentMethodLabel(inv),
        Number(inv.amount || 0),
        Number(inv.paid_amount || 0),
        Number(inv.remainder || 0),
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
    });

    autoFitColumns(wsSales);
  }

  // Sheet 3: Rental Invoices
  if (Array.isArray(dailyData.rental_invoices) && dailyData.rental_invoices.length > 0) {
    const wsRentals = wb.addWorksheet('عقود التأجير');
    applyWorksheetStyles(wsRentals, 'سجل عقود وتأجيرات اليوم', options);

    const rHeader = wsRentals.getRow(4);
    rHeader.values = ['رقم العقد', 'الوقت / التاريخ', 'المسؤول', 'طريقة الدفع', 'الإجمالي (ج.م)', 'العربون المدفوع (ج.م)', 'المتبقي (ج.م)', 'الحالة'];
    styleHeaderRow(rHeader);

    dailyData.rental_invoices.forEach((r, idx) => {
      const row = wsRentals.getRow(5 + idx);
      const rem = Number(r.remainder || r.remaining || 0);
      const statusLabel = r.status === 'returned'
        ? (rem > 0 ? 'مرتجع (غير خالص / عليه متبقي)' : 'تم الإرجاع (خالص)')
        : (r.status === 'active' ? 'تم الاستلام' : (r.status === 'booked' ? 'محجوزة' : (r.status || '-')));

      row.values = [
        sanitizeFormulaValue(String(r.invoice_number || '-')),
        r.created_date || '-',
        sanitizeFormulaValue(r.cashier_name || '-'),
        r.payment_method === 'cash' ? 'نقدي' : (r.payment_method || '-'),
        Number(r.amount || 0),
        Number(r.paid_amount || 0),
        rem,
        statusLabel,
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
    });

    autoFitColumns(wsRentals);
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 6. Sales Invoices Report (.xlsx)
 */
async function generateSalesReportExcel(salesData, options = {}) {
  const wb = createBaseWorkbook('تقرير فواتير المبيعات');
  const ws = wb.addWorksheet('فواتير المبيعات');
  applyWorksheetStyles(ws, 'سجل فواتير المبيعات والمتحصلات', options);

  const orders = Array.isArray(salesData.orders) ? salesData.orders : [];
  const summary = salesData.summary || {};

  ws.mergeCells('A4:C4');
  ws.getCell('A4').value = `إجمالي عدد الفواتير: ${Number(summary.total_orders || orders.length).toLocaleString('en-US')}`;
  ws.getCell('A4').font = { name: 'Arial', size: 10, bold: true };

  ws.mergeCells('D4:E4');
  ws.getCell('D4').value = formatMoneyLabel('إجمالي المبيعات', summary.total_amount);
  ws.getCell('D4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF15803D' } };

  ws.mergeCells('F4:G4');
  ws.getCell('F4').value = formatMoneyLabel('المحصل بالدرج (كاش)', summary.cash_paid);
  ws.getCell('F4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF047857' } };

  ws.mergeCells('H4:I4');
  ws.getCell('H4').value = formatMoneyLabel('المحصل انستاباي/تحويل', summary.bank_transfer_paid);
  ws.getCell('H4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF4338CA' } };

  ws.mergeCells('J4:K4');
  ws.getCell('J4').value = formatMoneyLabel('المحصل فيزا', summary.visa_paid);
  ws.getCell('J4').font = { name: 'Arial', size: 10, bold: true };

  ws.getCell('L4').value = formatMoneyLabel('المحصل محافظ', summary.wallet_paid);
  ws.getCell('L4').font = { name: 'Arial', size: 10, bold: true };

  ws.getRow(4).height = 24;
  ws.getRow(5).height = 10;

  const headerRow = ws.getRow(6);
  headerRow.values = [
    'رقم الفاتورة',
    'تاريخ ووقت البيع',
    'العميل',
    'رقم الهاتف',
    'الكاشير / البائع',
    'الفرع',
    'طريقة الدفع',
    'الأصناف / المنتجات',
    'إجمالي الفاتورة (ج.م)',
    'المدفوع (ج.م)',
    'المتبقي (ج.م)',
    'الحالة',
  ];
  styleHeaderRow(headerRow);

  let totalAmount = 0;
  let totalPaid = 0;
  let totalRemainder = 0;

  orders.forEach((o, idx) => {
    const row = ws.getRow(7 + idx);
    const amount = Number(o.total_amount || 0);
    const paid = Number(o.paid_amount || 0);
    const remainder = Number(o.remainder || 0);

    totalAmount += amount;
    totalPaid += paid;
    totalRemainder += remainder;

    const statusLabel = o.status === 'completed'
      ? 'مكتملة'
      : o.status === 'partially_returned'
      ? 'مرتجع جزئياً'
      : o.status === 'returned'
      ? 'مرتجع بالكامل'
      : o.status === 'cancelled'
      ? 'ملغاة'
      : (o.status || '-');

    row.values = [
      sanitizeFormulaValue(String(o.invoice_number || o.id || '-')),
      o.created_at_formatted || o.order_date || '-',
      sanitizeFormulaValue(o.customer_name || 'عميل نقدي'),
      sanitizeFormulaValue(o.customer_phone || '-'),
      sanitizeFormulaValue(o.cashier_name || '-'),
      sanitizeFormulaValue(o.branch_name || '-'),
      formatPaymentMethodLabel(o),
      sanitizeFormulaValue(o.product_names || (o.items_count ? `${o.items_count} صنف` : '-')),
      amount,
      paid,
      remainder,
      statusLabel,
    ];
    styleDataRow(row, idx % 2 === 1);
    row.getCell(9).numFmt = '#,##0.00';
    row.getCell(10).numFmt = '#,##0.00';
    row.getCell(11).numFmt = '#,##0.00';
  });

  const totalRow = ws.getRow(7 + orders.length);
  totalRow.values = [
    'الإجمالي',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    totalAmount,
    totalPaid,
    totalRemainder,
    '',
  ];
  styleTotalRow(totalRow);
  totalRow.getCell(9).numFmt = '#,##0.00';
  totalRow.getCell(10).numFmt = '#,##0.00';
  totalRow.getCell(11).numFmt = '#,##0.00';

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

/**
 * 7. Rentals Report (.xlsx)
 */
async function generateRentalsReportExcel(rentalsData, options = {}) {
  const wb = createBaseWorkbook('تقرير عقود التأجير');
  const ws = wb.addWorksheet('عقود التأجير');
  applyWorksheetStyles(ws, 'سجل عقود وتأجيرات الفروع', options);

  const rentals = Array.isArray(rentalsData.rentals) ? rentalsData.rentals : [];
  const summary = rentalsData.summary || {};

  ws.mergeCells('A4:C4');
  ws.getCell('A4').value = `إجمالي العقود: ${Number(summary.total_rentals || rentals.length).toLocaleString('en-US')}`;
  ws.getCell('A4').font = { name: 'Arial', size: 10, bold: true };

  ws.mergeCells('D4:F4');
  ws.getCell('D4').value = formatMoneyLabel('إجمالي القيمة', summary.total_price);
  ws.getCell('D4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF4338CA' } };

  ws.mergeCells('G4:I4');
  ws.getCell('G4').value = formatMoneyLabel('العربونات المسددة', summary.total_deposit);
  ws.getCell('G4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF15803D' } };

  ws.mergeCells('J4:L4');
  ws.getCell('J4').value = formatMoneyLabel('المتبقي للتحصيل', summary.total_remaining);
  ws.getCell('J4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFE11D48' } };

  ws.getRow(4).height = 24;
  ws.getRow(5).height = 10;

  const headerRow = ws.getRow(6);
  headerRow.values = [
    'رقم العقد',
    'المنتج / الفستان',
    'العميل',
    'رقم الهاتف',
    'الفرع',
    'تاريخ الحجز',
    'تاريخ الاستلام',
    'تاريخ الإرجاع',
    'الإجمالي (ج.م)',
    'العربون (ج.م)',
    'المتبقي (ج.م)',
    'الغرامة (ج.م)',
    'طريقة الدفع',
    'الحالة',
  ];
  styleHeaderRow(headerRow);

  let totalPrice = 0;
  let totalDeposit = 0;
  let totalRemaining = 0;
  let totalFines = 0;

  rentals.forEach((r, idx) => {
    const row = ws.getRow(7 + idx);
    const price = Number(r.total_price || 0);
    const deposit = Number(r.deposit || 0);
    const remaining = Number(r.remaining || 0);
    const fine = Number(r.fine_amount || 0);

    totalPrice += price;
    totalDeposit += deposit;
    totalRemaining += remaining;
    totalFines += fine;

    const statusLabel = r.status === 'returned'
      ? (remaining > 0 ? 'مرتجع (غير خالص / عليه متبقي)' : 'تم الإرجاع (خالص)')
      : (r.status === 'active' ? 'تم الاستلام' : (r.status === 'booked' ? 'محجوزة' : (r.status === 'sold' ? 'محولة لبيع' : (r.status === 'cancelled' ? 'ملغي' : (r.status || '-')))));

    row.values = [
      sanitizeFormulaValue(String(r.id || '-')),
      sanitizeFormulaValue(r.item_name || '-'),
      sanitizeFormulaValue(r.customer_name || '-'),
      sanitizeFormulaValue(r.customer_phone || '-'),
      sanitizeFormulaValue(r.branch_name || '-'),
      r.booking_date || '-',
      r.pickup_date || r.delivery_date || '-',
      r.return_date || '-',
      price,
      deposit,
      remaining,
      fine,
      r.payment_method === 'cash' ? 'نقدي' : (r.payment_method || '-'),
      statusLabel,
    ];
    styleDataRow(row, idx % 2 === 1);
    row.getCell(9).numFmt = '#,##0.00';
    row.getCell(10).numFmt = '#,##0.00';
    row.getCell(11).numFmt = '#,##0.00';
    row.getCell(12).numFmt = '#,##0.00';
  });

  const totalRow = ws.getRow(7 + rentals.length);
  totalRow.values = [
    'الإجمالي',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    totalPrice,
    totalDeposit,
    totalRemaining,
    totalFines,
    '',
    '',
  ];
  styleTotalRow(totalRow);
  totalRow.getCell(9).numFmt = '#,##0.00';
  totalRow.getCell(10).numFmt = '#,##0.00';
  totalRow.getCell(11).numFmt = '#,##0.00';
  totalRow.getCell(12).numFmt = '#,##0.00';

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

/**
 * 8. Expenses Report (.xlsx)
 */
async function generateExpensesReportExcel(expensesData, options = {}) {
  const wb = createBaseWorkbook('تقرير المصروفات والنثريات');
  const ws = wb.addWorksheet('سجل المصروفات');
  applyWorksheetStyles(ws, 'سجل المصروفات والنثريات التشغيلية', options);

  const expenses = Array.isArray(expensesData.expenses) ? expensesData.expenses : [];
  const summary = expensesData.summary || {};
  const categories = Array.isArray(expensesData.categories) ? expensesData.categories : [];

  ws.mergeCells('A4:C4');
  ws.getCell('A4').value = `إجمالي عدد السندات: ${Number(summary.total_count || expenses.length).toLocaleString('en-US')}`;
  ws.getCell('A4').font = { name: 'Arial', size: 10, bold: true };

  ws.mergeCells('D4:F4');
  ws.getCell('D4').value = formatMoneyLabel('إجمالي المصروفات', summary.total_amount);
  ws.getCell('D4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFE11D48' } };

  ws.getRow(4).height = 24;
  ws.getRow(5).height = 10;

  const headerRow = ws.getRow(6);
  headerRow.values = [
    'رقم السند',
    'التاريخ',
    'التصنيف',
    'البيان / الملاحظات',
    'الفرع',
    'المبلغ (ج.م)',
  ];
  styleHeaderRow(headerRow);

  let totalAmount = 0;
  expenses.forEach((e, idx) => {
    const row = ws.getRow(7 + idx);
    const amount = Number(e.amount || 0);
    totalAmount += amount;

    row.values = [
      sanitizeFormulaValue(String(e.id || '-')),
      e.expense_date || '-',
      sanitizeFormulaValue(e.category || 'عام'),
      sanitizeFormulaValue(e.notes || '-'),
      sanitizeFormulaValue(e.branch_name || '-'),
      amount,
    ];
    styleDataRow(row, idx % 2 === 1);
    row.getCell(6).numFmt = '#,##0.00';
  });

  const totalRow = ws.getRow(7 + expenses.length);
  totalRow.values = ['الإجمالي', '', '', '', '', totalAmount];
  styleTotalRow(totalRow);
  totalRow.getCell(6).numFmt = '#,##0.00';

  autoFitColumns(ws);

  if (categories.length > 0) {
    const wsCat = wb.addWorksheet('توزيع التصنيفات');
    applyWorksheetStyles(wsCat, 'تحليل المصروفات حسب التصنيف', options);

    const catHeader = wsCat.getRow(4);
    catHeader.values = ['التصنيف', 'عدد الحركات', 'إجمالي المبلغ (ج.م)', 'النسبة من الإجمالي %'];
    styleHeaderRow(catHeader);

    const grandTotal = Number(summary.total_amount || totalAmount || 1);
    categories.forEach((c, idx) => {
      const row = wsCat.getRow(5 + idx);
      const catAmt = Number(c.total_amount || 0);
      const pct = (catAmt / grandTotal) * 100;

      row.values = [
        sanitizeFormulaValue(c.category || 'غير محدد'),
        Number(c.count || 0),
        catAmt,
        `${pct.toFixed(1)}%`,
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(3).numFmt = '#,##0.00';
    });

    const catTotalRow = wsCat.getRow(5 + categories.length);
    catTotalRow.values = ['الإجمالي', Number(summary.total_count || expenses.length), grandTotal, '100%'];
    styleTotalRow(catTotalRow);
    catTotalRow.getCell(3).numFmt = '#,##0.00';

    autoFitColumns(wsCat);
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 9. Financial Summary Report (.xlsx)
 */
async function generateSummaryReportExcel(summaryData, options = {}) {
  const wb = createBaseWorkbook('تقرير الملخص المالي التنفيذي');
  const ws = wb.addWorksheet('الملخص المالي');
  applyWorksheetStyles(ws, 'الملخص المالي وحركة الأعمال', options);

  const headerRow = ws.getRow(4);
  headerRow.values = ['البند المالي', 'القيمة (ج.م)', 'ملاحظات وتفاصيل'];
  styleHeaderRow(headerRow);

  const rows = [
    ['إجمالي الإيرادات (المبيعات والتأجير والتفصيل)', Number(summaryData.revenue || summaryData.total_revenue || 0), 'إجمالي التدفقات المالية المحققة'],
    ['مبيعات الكاشير', Number(summaryData.sales || summaryData.total_sales || 0), 'صافي المبيعات بعد المرتجعات'],
    ['متحصلات التأجير والغرامات', Number(summaryData.rentals || summaryData.total_rentals || 0), 'عقود التأجير والغرامات المحصلة'],
    ['متحصلات التفصيل والتعديلات', Number(summaryData.tailoring || summaryData.total_tailoring || 0), 'مدفوعات التفصيل المحصلة'],
    ['تكلفة البضاعة المباعة (COGS)', Number(summaryData.cogs || 0), 'تكلفة البضاعة المباعة المباشرة'],
    ['مجمل الربح', Number(summaryData.gross_profit || 0), 'الإيرادات - تكلفة البضاعة المباعة'],
    ['المصروفات التشغيلية', Number(summaryData.expenses || 0), 'المصاريف والنثريات التشغيلية'],
    ['الرواتب والأجور المسددة', Number(summaryData.salaries || summaryData.total_salaries_paid || 0), 'صافي حركات رواتب الموظفين'],
    ['صافي الربح النهائي', Number(summaryData.net_profit || 0), 'مجمل الربح - المصروفات - الرواتب'],
    ['هامش الربح الصافي %', `${Number(summaryData.profit_margin || 0).toFixed(1)}%`, 'نسبة صافي الربح من الإيرادات'],
    ['صافي الكاش المحصل بالدرج', Number(summaryData.cash_drawer || 0), 'النقدية الفعلية المحصلة بالخزينة'],
  ];

  rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    row.values = r;
    styleDataRow(row, idx % 2 === 1);
    if (typeof r[1] === 'number') {
      row.getCell(2).numFmt = '#,##0.00';
    }
  });

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

/**
 * 10. Inventory Valuation & Stock Report (.xlsx)
 */
async function generateInventoryReportExcel(inventoryData, options = {}) {
  const wb = createBaseWorkbook('تقرير جرد وتقييم المخزون');
  const ws = wb.addWorksheet('المخزون والتقييم');
  applyWorksheetStyles(ws, 'تقرير جرد المخزون وتقييم البضاعة', options);

  const items = Array.isArray(inventoryData.items) ? inventoryData.items : [];
  const summary = inventoryData.summary || {};

  ws.mergeCells('A4:C4');
  ws.getCell('A4').value = `إجمالي الأصناف: ${Number(summary.total_items || items.length).toLocaleString('en-US')}`;
  ws.getCell('A4').font = { name: 'Arial', size: 10, bold: true };

  ws.mergeCells('D4:F4');
  ws.getCell('D4').value = `إجمالي كميات القطع: ${Number(summary.total_quantity || 0).toLocaleString('en-US')} قطعة`;
  ws.getCell('D4').font = { name: 'Arial', size: 10, bold: true };

  ws.mergeCells('G4:I4');
  ws.getCell('G4').value = formatMoneyLabel('القيمة بسعر البيع', summary.total_retail_value);
  ws.getCell('G4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF15803D' } };

  if (summary.total_cost_value !== null && summary.total_cost_value !== undefined) {
    ws.mergeCells('J4:L4');
    ws.getCell('J4').value = formatMoneyLabel('القيمة بسعر التكلفة', summary.total_cost_value);
    ws.getCell('J4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF4338CA' } };
  }

  ws.getRow(4).height = 24;
  ws.getRow(5).height = 10;

  const headerRow = ws.getRow(6);
  headerRow.values = [
    'كود الصنف',
    'اسم المنتج',
    'الباركود',
    'القسم / التصنيف',
    'اللون',
    'المقاس',
    'الرصيد الحالي',
    'حد الطلب',
    'سعر البيع (ج.م)',
    'سعر التكلفة (ج.م)',
    'إجمالي قيمة البيع (ج.م)',
    'إجمالي قيمة التكلفة (ج.م)',
    'حالة المخزون',
  ];
  styleHeaderRow(headerRow);

  let totalQty = 0;
  let totalRetail = 0;
  let totalCost = 0;

  items.forEach((item, idx) => {
    const row = ws.getRow(7 + idx);
    const qty = Number(item.stock_level || 0);
    const price = Number(item.price || 0);
    const cost = item.cost_price !== null && item.cost_price !== undefined ? Number(item.cost_price || 0) : null;
    const retailVal = qty * price;
    const costVal = cost !== null ? qty * cost : null;

    totalQty += qty;
    totalRetail += retailVal;
    if (costVal !== null) totalCost += costVal;

    row.values = [
      sanitizeFormulaValue(String(item.id || '-')),
      sanitizeFormulaValue(item.name || '-'),
      sanitizeFormulaValue(item.barcode || '-'),
      sanitizeFormulaValue(item.category || 'عام'),
      sanitizeFormulaValue(item.color || '-'),
      sanitizeFormulaValue(item.size_cut || '-'),
      qty,
      Number(item.min_stock_level || 5),
      price,
      cost !== null ? cost : '-',
      retailVal,
      costVal !== null ? costVal : '-',
      item.is_low_stock ? 'منخفض' : 'متوفر',
    ];
    styleDataRow(row, idx % 2 === 1);
    row.getCell(7).numFmt = '#,##0';
    row.getCell(8).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0.00';
    if (cost !== null) row.getCell(10).numFmt = '#,##0.00';
    row.getCell(11).numFmt = '#,##0.00';
    if (costVal !== null) row.getCell(12).numFmt = '#,##0.00';
  });

  const totalRow = ws.getRow(7 + items.length);
  totalRow.values = [
    'الإجمالي',
    '',
    '',
    '',
    '',
    '',
    totalQty,
    '',
    '',
    '',
    totalRetail,
    totalCost > 0 ? totalCost : '-',
    '',
  ];
  styleTotalRow(totalRow);
  totalRow.getCell(7).numFmt = '#,##0';
  totalRow.getCell(11).numFmt = '#,##0.00';
  if (totalCost > 0) totalRow.getCell(12).numFmt = '#,##0.00';

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

module.exports = {
  createBaseWorkbook,
  generateDailyHistoryExcel,
  generateMonthlyHistoryExcel,
  generateProfitReportExcel,
  generateTopProductsExcel,
  generateDailyReportExcel,
  generateSalesReportExcel,
  generateRentalsReportExcel,
  generateExpensesReportExcel,
  generateSummaryReportExcel,
  generateInventoryReportExcel,
};
