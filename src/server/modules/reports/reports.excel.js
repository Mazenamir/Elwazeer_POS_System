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

  const normMethod = String(item.payment_method || '').toLowerCase().trim();
  const isSplit = ['split', 'مجزأ', 'mixed', 'دفع مجزأ'].includes(normMethod);
  if (isSplit || (splits && splits.length > 1) || (Number(item.cash_amount) > 0 && (Number(item.card_amount) > 0 || Number(item.bank_transfer_amount) > 0 || Number(item.wallet_amount) > 0))) {
    if (splits && splits.length > 0) {
      const parts = splits.map(s => {
        const m = String(s.method || s.payment_method || s.id || '').toLowerCase().trim();
        let mName = 'نقدي';
        if (['visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة'].includes(m)) mName = 'فيزا';
        else if (['bank_transfer', 'instapay', 'bank', 'انستاباي', 'تحويل بنكي', 'transfer', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(m)) mName = 'انستاباي';
        else if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(m)) mName = 'فودافون كاش';
        else if (['debt', 'آجل', 'credit_customer'].includes(m)) mName = 'آجل';
        return `${mName}: ${Number(s.amount || 0)}`;
      });
      return `مجزأ (${parts.join(' + ')})`;
    }
    const parts = [];
    if (Number(item.cash_amount) > 0) parts.push(`نقدي: ${item.cash_amount}`);
    if (Number(item.bank_transfer_amount) > 0) parts.push(`انستاباي: ${item.bank_transfer_amount}`);
    if (Number(item.card_amount) > 0) parts.push(`فيزا: ${item.card_amount}`);
    if (Number(item.wallet_amount) > 0) parts.push(`فودافون كاش: ${item.wallet_amount}`);
    return parts.length > 0 ? `مجزأ (${parts.join(' + ')})` : 'مجزأ';
  }

  const m = String(item.payment_method || '').toLowerCase().trim();
  if (['cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)'].includes(m)) return 'نقدي';
  if (['visa', 'card', 'credit', 'فيزا', 'بطاقة', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات'].includes(m)) return 'فيزا';
  if (['bank_transfer', 'bank', 'transfer', 'instapay', 'انستاباي', 'تحويل بنكي', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(m)) return 'تحويل بنكي / انستاباي';
  if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(m)) return 'فودافون كاش';
  if (['debt', 'آجل', 'credit_customer', 'آجل / مديونية'].includes(m)) return 'آجل';
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
        formatPaymentMethodLabel(r),
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

  // Sheet 4: Tailoring Payments
  const tailoringList = Array.isArray(dailyData.tailoring?.items)
    ? dailyData.tailoring.items
    : (Array.isArray(dailyData.tailoring_invoices) ? dailyData.tailoring_invoices : []);
  if (tailoringList.length > 0) {
    const wsTailoring = wb.addWorksheet('عقود ومتحصلات التفصيل');
    applyWorksheetStyles(wsTailoring, 'سجل عقود ومتحصلات التفصيل لليوم', options);

    const tHeader = wsTailoring.getRow(4);
    tHeader.values = [
      'رقم الفاتورة',
      'الوقت / التاريخ',
      'العميل',
      'وصف القطعة والمقاسات',
      'الفرع',
      'طريقة الدفع',
      'المبلغ المحصل (ج.م)',
      'إجمالي الطلب (ج.م)',
      'المتبقي (ج.م)',
      'نوع الدفعة',
    ];
    styleHeaderRow(tHeader);

    tailoringList.forEach((t, idx) => {
      const row = wsTailoring.getRow(5 + idx);
      const isRemainder = t.is_remainder;
      const typeLabel = isRemainder ? 'سداد متبقي' : 'عربون / دفعة أولى';

      row.values = [
        sanitizeFormulaValue(String(t.invoice_number || '-')),
        t.created_date || '-',
        sanitizeFormulaValue(t.customer_name || '-'),
        sanitizeFormulaValue(t.product_description || '-'),
        sanitizeFormulaValue(t.branch_name || '-'),
        formatPaymentMethodLabel(t),
        Number(t.amount || 0),
        Number(t.total_amount || 0),
        Number(t.remaining_amount || 0),
        typeLabel,
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).numFmt = '#,##0.00';
    });

    const totRow = wsTailoring.getRow(5 + tailoringList.length);
    totRow.values = [
      'الإجمالي',
      '',
      '',
      '',
      '',
      '',
      tailoringList.reduce((s, t) => s + Number(t.amount || 0), 0),
      tailoringList.reduce((s, t) => s + Number(t.total_amount || 0), 0),
      tailoringList.reduce((s, t) => s + Number(t.remaining_amount || 0), 0),
      '',
    ];
    styleTotalRow(totRow);
    totRow.getCell(7).numFmt = '#,##0.00';
    totRow.getCell(8).numFmt = '#,##0.00';
    totRow.getCell(9).numFmt = '#,##0.00';

    autoFitColumns(wsTailoring);
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

  ws.getCell('L4').value = formatMoneyLabel('المحصل فودافون كاش', summary.wallet_paid);
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
      formatPaymentMethodLabel(r),
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

/**
 * Generates the full consolidated monthly workbook matching 'مجمع الرمل اكتوبر 2026.xlsm'
 * Containing: 31 daily sheets (1-M-YYYY to 31-M-YYYY), MASTER STAFF LIST, MASTER SHEET, OHDA, SALARY, and KPI.
 */
async function generateConsolidatedBranchExcel(query = {}, user = null) {
  const reportsService = require('./reports.service');
  const db = require('../../database/connection');
  const { getDatabaseCairoNow, addDays } = require('../../../shared/utils/date');

  let month = query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    month = (await getDatabaseCairoNow(db)).month;
  }

  const branchId = query.branch_id && query.branch_id !== 'all' ? String(query.branch_id) : (user?.branch_id ? String(user.branch_id) : '2');
  const branchName = query.branch_name || (query.branch_id && query.branch_id !== 'all' ? `فرع #${query.branch_id}` : 'فرع الرمل');

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.lastModifiedBy = 'Elwazeer POS System';
  wb.created = new Date();

  // 1. Fetch days data
  const daysData = [];
  const dailySheetNames = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const sheetName = `${d}-${monthNum}-${year}`;
    dailySheetNames.push(sheetName);
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const dayData = await reportsService.getExtendedDailyReport({ date: dateStr, branch_id: branchId }, user);
    daysData.push({ day: d, date: dateStr, sheetName, data: dayData });
  }

  // 2. Fetch Ohda, Salary, KPI
  const [ohdaData, salaryData, kpiData] = await Promise.all([
    reportsService.getMonthlyOhdaReport({ month, branch_id: branchId }, user),
    reportsService.getMonthlySalarySheet({ month, branch_id: branchId }, user),
    reportsService.getSalesKpiReport({ month, branch_id: branchId }, user),
  ]);

  const purpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD689EB' } };
  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  // Build 31 Daily sheets
  for (const dayItem of daysData) {
    const ws = wb.addWorksheet(dayItem.sheetName, { views: [{ rightToLeft: true }] });
    
    // Row 1 Title
    ws.mergeCells('A1:Q1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `التقرير اليومي لبيبيون ${branchName}`;
    titleCell.font = { name: 'Calibri', size: 24, bold: true, color: { argb: 'FF1E293B' } };
    titleCell.fill = lightPurpleBg;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 38;

    // Row 2 Headers
    const hRow = ws.getRow(2);
    hRow.height = 28;
    hRow.values = [
      'التاريخ', 'رقم الفاتورة', 'البيان ', 'الأجمالي', 'المدفوع ', 'الباقي',
      'أسم البائع', 'تاريخ الأستلام', 'الموظف', 'السلف', 'مصروفات آخرى', 'المبلغ',
      'أسماء الموظفين ', 'وقت الحضور ', 'وقت الانصراف', 'عداد الساعات', 'ملاحظات'
    ];
    hRow.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = purpleBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });

    const d = dayItem.data;
    const staffList = d.attendance || [];
    const advanceByEmp = new Map();
    (d.advances || []).forEach(adv => {
      advanceByEmp.set(adv.employee_name, adv);
      if (adv.employee_id) advanceByEmp.set(String(adv.employee_id), adv);
    });

    const maxRows = Math.max(
      d.sales_invoices.length,
      d.expenses.length,
      staffList.length,
      1
    );

    for (let i = 0; i < maxRows; i++) {
      const rowIdx = 3 + i;
      const r = ws.getRow(rowIdx);
      r.height = 24;

      const inv = d.sales_invoices[i];
      if (inv) {
        r.getCell(1).value = inv.invoice_date || dayItem.date;
        r.getCell(2).value = Number(inv.invoice_number) || inv.invoice_number;
        const invMethod = formatPaymentMethodLabel(inv);
        const desc = inv.payment_method && inv.payment_method !== 'cash'
          ? `${inv.description} (${invMethod})`
          : inv.description;
        r.getCell(3).value = desc;
        r.getCell(4).value = inv.total_amount;
        r.getCell(5).value = inv.paid_amount;
        r.getCell(6).value = { formula: `D${rowIdx}-E${rowIdx}`, result: inv.remaining_amount };
        r.getCell(7).value = inv.seller_name;
        r.getCell(8).value = inv.delivery_date || inv.invoice_date;
      }

      if (i < staffList.length) {
        const staff = staffList[i];
        const adv = advanceByEmp.get(staff.employee_name) || (staff.employee_id ? advanceByEmp.get(String(staff.employee_id)) : null);

        r.getCell(9).value = { formula: `M${rowIdx}`, result: staff.employee_name };
        if (adv && adv.amount > 0) {
          r.getCell(10).value = adv.amount;
        }

        r.getCell(13).value = staff.employee_name;
        r.getCell(14).value = staff.check_in_24 || (staff.check_in ? staff.check_in.replace(/\s*[AP]M/i, '').trim() : '');
        r.getCell(15).value = staff.check_out_24 || (staff.check_out ? staff.check_out.replace(/\s*[AP]M/i, '').trim() : '');
        if (staff.total_hours > 0) {
          r.getCell(16).value = {
            formula: `IF(OR(N${rowIdx}="",O${rowIdx}=""),"",MOD(O${rowIdx}-N${rowIdx},1))`,
            result: staff.total_hours / 24,
          };
          r.getCell(16).numFmt = 'h:mm';
        } else {
          r.getCell(16).value = '';
        }
        r.getCell(17).value = staff.notes || (staff.status === 'absent' ? 'غياب' : '');
      }

      const exp = d.expenses[i];
      if (exp) {
        const expMethod = formatPaymentMethodLabel(exp);
        const desc = exp.payment_method && exp.payment_method !== 'cash'
          ? `${exp.description} (${expMethod})`
          : exp.description;
        r.getCell(11).value = desc;
        r.getCell(12).value = exp.amount;
      }

      for (let c = 1; c <= 17; c++) {
        const cell = r.getCell(c);
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      }
    }

    // Row 76 Summary
    const r76 = ws.getRow(76);
    r76.height = 26;
    r76.getCell(2).value = 'اجمالى اليوم ';
    r76.getCell(3).value = 'اجمالى اليوم ';
    r76.getCell(4).value = { formula: 'SUM(D3:D75)', result: d.summary.total_sales };
    r76.getCell(5).value = { formula: 'SUM(E3:E75)', result: d.summary.total_paid };
    r76.getCell(10).value = { formula: 'SUM(J3:J75)', result: d.summary.total_advances };
    r76.getCell(12).value = { formula: 'SUM(L3:L75)', result: d.summary.total_expenses };

    [2, 3, 4, 5, 10, 12].forEach(c => {
      const cell = r76.getCell(c);
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // Row 77 Cash Closing
    const r77 = ws.getRow(77);
    r77.height = 28;
    r77.getCell(2).value = 'اجمالى اليوم ';
    r77.getCell(3).value = 'اجمالى اليوم ';
    r77.getCell(4).value = { formula: 'E76-K77', result: d.summary.cash_in_drawer };
    r77.getCell(5).value = { formula: 'E76-K77', result: d.summary.cash_in_drawer };
    r77.getCell(6).value = { formula: 'E76-K77', result: d.summary.cash_in_drawer };
    r77.getCell(11).value = { formula: 'J76+L76', result: d.summary.total_deductions };

    [2, 3, 4, 5, 6, 11].forEach(c => {
      const cell = r77.getCell(c);
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = purpleBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    ws.columns = [
      { width: 12 }, { width: 14 }, { width: 45 }, { width: 12 }, { width: 12 }, { width: 10 },
      { width: 16 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 28 }, { width: 12 },
      { width: 18 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 20 }
    ];
  }

  // 3. MASTER STAFF LIST
  const staffSheet = wb.addWorksheet('MASTER STAFF LIST', { views: [{ rightToLeft: true }] });
  staffSheet.getCell('I3').value = 'الاسم';
  staffSheet.getCell('I3').font = { name: 'Calibri', size: 14, bold: true };
  ohdaData.employees.forEach((emp, idx) => {
    staffSheet.getCell(`I${4 + idx}`).value = emp.employee_name;
  });

  // 4. MASTER SHEET
  const masterWs = wb.addWorksheet('MASTER SHEET', { views: [{ rightToLeft: true }] });
  masterWs.columns = [
    { width: 14 }, // التاريخ
    { width: 15 }, // رقم الفاتورة
    { width: 50 }, // البيان
    { width: 16 }, // الأجمالي
    { width: 16 }, // المدفوع
    { width: 14 }, // الباقي
    { width: 20 }, // أسم البائع
    { width: 16 }, // تاريخ الأستلام
    { width: 22 }, // الموظف
    { width: 16 }, // السلف
    { width: 32 }, // مصروفات آخرى
    { width: 14 }, // المبلغ
    { width: 22 }, // أسماء الموظفين
    { width: 16 }, // وقت الحضور
    { width: 16 }, // وقت الانصراف
    { width: 16 }, // عداد الساعات
    { width: 22 }  // ملاحظات
  ];
  masterWs.mergeCells('A1:Q1');
  masterWs.getRow(1).height = 38;
  const mTitle = masterWs.getCell('A1');
  mTitle.value = `التقرير المجمع لبيبيون ${branchName}`;
  mTitle.font = { name: 'Calibri', size: 24, bold: true };
  mTitle.fill = lightPurpleBg;
  mTitle.alignment = { horizontal: 'center', vertical: 'middle' };

  const mHeader = masterWs.getRow(2);
  mHeader.height = 30;
  mHeader.values = [
    'التاريخ', 'رقم الفاتورة', 'البيان ', 'الأجمالي', 'المدفوع ', 'الباقي',
    'أسم البائع', 'تاريخ الأستلام', 'الموظف', 'السلف', 'مصروفات آخرى', 'المبلغ',
    'أسماء الموظفين ', 'وقت الحضور ', 'وقت الانصراف', 'عداد الساعات', 'ملاحظات'
  ];
  mHeader.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = darkBlueBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  let masterRowIdx = 3;
  for (const dayItem of daysData) {
    const d = dayItem.data;
    const staffList = d.attendance || [];
    const advanceByEmp = new Map();
    (d.advances || []).forEach(adv => {
      advanceByEmp.set(adv.employee_name, adv);
      if (adv.employee_id) advanceByEmp.set(String(adv.employee_id), adv);
    });

    const maxRows = Math.max(d.sales_invoices.length, d.expenses.length, staffList.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const r = masterWs.getRow(masterRowIdx++);
      r.height = 24;

      const inv = d.sales_invoices[i];
      if (inv) {
        r.getCell(1).value = inv.invoice_date || dayItem.date;
        r.getCell(2).value = Number(inv.invoice_number) || inv.invoice_number;
        const invMethod = formatPaymentMethodLabel(inv);
        const desc = inv.payment_method && inv.payment_method !== 'cash'
          ? `${inv.description} (${invMethod})`
          : inv.description;
        r.getCell(3).value = desc;
        r.getCell(4).value = inv.total_amount;
        r.getCell(5).value = inv.paid_amount;
        r.getCell(6).value = inv.remaining_amount;
        r.getCell(7).value = inv.seller_name;
        r.getCell(8).value = inv.delivery_date;
      }

      if (i < staffList.length) {
        const staff = staffList[i];
        const adv = advanceByEmp.get(staff.employee_name) || (staff.employee_id ? advanceByEmp.get(String(staff.employee_id)) : null);

        r.getCell(9).value = staff.employee_name;
        if (adv && adv.amount > 0) {
          r.getCell(10).value = adv.amount;
        }

        r.getCell(13).value = staff.employee_name;
        r.getCell(14).value = staff.check_in_24 || (staff.check_in ? staff.check_in.replace(/\s*[AP]M/i, '').trim() : '');
        r.getCell(15).value = staff.check_out_24 || (staff.check_out ? staff.check_out.replace(/\s*[AP]M/i, '').trim() : '');
        if (staff.total_hours > 0) {
          r.getCell(16).value = staff.total_hours / 24;
          r.getCell(16).numFmt = 'h:mm';
        } else {
          r.getCell(16).value = '';
        }
        r.getCell(17).value = staff.notes || (staff.status === 'absent' ? 'غياب' : '');
      }

      const exp = d.expenses[i];
      if (exp) {
        r.getCell(11).value = exp.description;
        r.getCell(12).value = exp.amount;
      }
    }
  }

  // 5. OHDA Sheet
  const ohdaWs = wb.addWorksheet('OHDA', { views: [{ rightToLeft: true }] });
  buildOhdaWorksheet(ohdaWs, ohdaData, branchName, month);

  // 6. SALARY Sheet
  const salWs = wb.addWorksheet('SALARY', { views: [{ rightToLeft: true }] });
  salWs.columns = [
    { width: 5 },   // A: spacer
    { width: 28 },  // B: الاسم
    { width: 16 },  // C: الساعات المحققه
    { width: 16 },  // D: الساعات المطلوبه
    { width: 14 },  // E: تاخيرات
    { width: 14 },  // F: بدلات
    { width: 14 },  // G: اوفر تايم
    { width: 16 },  // H: مبلغ الاوفر تايم
    { width: 16 },  // I: الراتب
    { width: 14 },  // J: اليوميه
    { width: 16 },  // K: الاساسي
    { width: 14 },  // L: ايام العمل
    { width: 16 },  // M: بدل مواصلات
    { width: 24 },  // N: البيان
    { width: 14 },  // O: المبلغ
    { width: 16 },  // P: السلف
    { width: 12 },  // Q: غياب
    { width: 16 },  // R: المبلغ
    { width: 12 },  // S: اجازات
    { width: 16 },  // T: المبلغ
    { width: 12 },  // U: نص يوم
    { width: 16 },  // V: المبلغ
    { width: 14 },  // W: خصومات
    { width: 16 },  // X: خصومات تاخير
    { width: 20 },  // Y: القبض
    { width: 5 },   // Z: spacer
    { width: 16 },  // AA: ديون قديمه
    { width: 16 },  // AB: ديون خارجيه
  ];
  salWs.mergeCells('B2:AB2');
  salWs.getCell('B2').value = `مرتبات ${branchName}`;
  salWs.getCell('B2').font = { name: 'Calibri', size: 22, bold: true };
  salWs.getCell('B2').fill = lightPurpleBg;
  salWs.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };
  salWs.getRow(2).height = 40;

  const sRow4 = salWs.getRow(4);
  sRow4.height = 32;
  const salHeaders = [
    null, 'الاسم', 'الساعات المحققه', 'الساعات المطلوبه', 'تاخيرات', 'بدلات', 'اوفر تايم', 'مبلغ الاوفر تايم',
    'الراتب', 'اليوميه', 'الاساسي', 'ايام العمل', 'بدل مواصلات', 'البيان', 'المبلغ', 'السلف',
    'غياب', 'المبلغ', 'اجازات', 'المبلغ', 'نص يوم', 'المبلغ', 'خصومات', 'خصومات تاخير', 'القبض',
    null, 'ديون قديمه', 'ديون خارجيه'
  ];
  salHeaders.forEach((h, cIdx) => {
    if (h) {
      const cell = sRow4.getCell(cIdx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = darkBlueBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
  });

  salaryData.employees.forEach((emp, idx) => {
    const rIdx = 5 + idx;
    const r = salWs.getRow(rIdx);
    r.height = 26;

    r.getCell(2).value = emp.employee_name;
    r.getCell(3).value = { formula: `SUMIF('MASTER SHEET'!M:M, B${rIdx}, 'MASTER SHEET'!P:P)`, result: emp.actual_hours / 24 };
    r.getCell(3).numFmt = '[h]:mm';
    r.getCell(4).value = emp.required_hours;
    r.getCell(5).value = { formula: `IF(C${rIdx}*24<D${rIdx},C${rIdx}*24-D${rIdx},0)`, result: emp.delay_hours > 0 ? -emp.delay_hours : 0 };
    r.getCell(6).value = emp.allowances || '';
    r.getCell(7).value = { formula: `IF(C${rIdx}>D${rIdx}/24,C${rIdx}-D${rIdx}/24,0)`, result: emp.overtime_hours / 24 };
    r.getCell(7).numFmt = '[h]:mm';
    r.getCell(8).value = { formula: `((J${rIdx}/10)*1.35)*(G${rIdx}*24)`, result: emp.overtime_amount };
    r.getCell(8).numFmt = '#,##0.00';
    r.getCell(9).value = emp.basic_salary;
    r.getCell(10).value = { formula: `I${rIdx}/30`, result: emp.daily_rate };
    r.getCell(10).numFmt = '#,##0.00';
    r.getCell(11).value = { formula: `J${rIdx}*L${rIdx}+F${rIdx}+H${rIdx}+M${rIdx}`, result: emp.gross_salary };
    r.getCell(11).numFmt = '#,##0.00';
    r.getCell(12).value = emp.work_days;
    r.getCell(13).value = emp.transportation_allowance || '';
    r.getCell(14).value = '';
    r.getCell(15).value = '';
    r.getCell(16).value = { formula: `SUMIF('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!J:J)`, result: emp.advances };
    r.getCell(16).numFmt = '#,##0.00';
    r.getCell(17).value = { formula: `COUNTIFS('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!Q:Q, "*غياب*")`, result: emp.absent_days };
    r.getCell(18).value = { formula: `Q${rIdx} * J${rIdx} * 2`, result: emp.absent_deduction };
    r.getCell(18).numFmt = '#,##0.00';
    r.getCell(19).value = { formula: `SUMPRODUCT(('MASTER SHEET'!I$2:I$1000=B${rIdx})*(ISNUMBER(SEARCH("جاز",'MASTER SHEET'!Q$2:Q$1000))))`, result: emp.leave_days };
    r.getCell(20).value = { formula: `IF(S${rIdx} > 4, (S${rIdx} - 4) * J${rIdx}, 0)`, result: emp.leave_deduction };
    r.getCell(20).numFmt = '#,##0.00';
    r.getCell(21).value = { formula: `COUNTIFS('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!Q:Q, "*نص يوم*")`, result: emp.half_days };
    r.getCell(22).value = { formula: `U${rIdx} * (J${rIdx} / 2)`, result: emp.half_day_deduction };
    r.getCell(22).numFmt = '#,##0.00';
    r.getCell(23).value = emp.other_deductions || '';
    r.getCell(24).value = { formula: `IF(E${rIdx}=0,0,ABS(E${rIdx})*(J${rIdx}/10))`, result: emp.delay_deduction };
    r.getCell(24).numFmt = '#,##0.00;-#,##0.00;""';
    r.getCell(25).value = { formula: `K${rIdx}-O${rIdx}-P${rIdx}-R${rIdx}-T${rIdx}-V${rIdx}-W${rIdx}-X${rIdx}-AA${rIdx}`, result: emp.net_salary };
    r.getCell(25).numFmt = '#,##0.00';
    r.getCell(27).value = emp.old_debts || '';
    r.getCell(28).value = emp.external_debts || '';

    r.eachCell(c => {
      c.font = { name: 'Calibri', size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = thinBorder;
    });
  });

  if (salaryData.employees?.length > 0) {
    const totRowIdx = 5 + salaryData.employees.length;
    const totRow = salWs.getRow(totRowIdx);
    totRow.height = 30;
    totRow.getCell(2).value = 'الإجمالي';
    totRow.getCell(2).font = { name: 'Calibri', size: 12, bold: true };
    totRow.getCell(2).fill = lightPurpleBg;
    totRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    totRow.getCell(2).border = thinBorder;

    const sumCols = [8, 9, 11, 16, 18, 20, 22, 24, 25];
    sumCols.forEach(c => {
      const colLetter = salWs.getColumn(c).letter;
      const cell = totRow.getCell(c);
      cell.value = { formula: `SUM(${colLetter}5:${colLetter}${totRowIdx - 1})` };
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = lightPurpleBg;
      cell.border = thinBorder;
      cell.numFmt = '#,##0.00';
    });
  }

  // 7. KPI Sheet
  const kpiWs = wb.addWorksheet('KPI', { views: [{ rightToLeft: true }] });
  kpiWs.columns = [
    { width: 5 },   // A
    { width: 5 },   // B
    { width: 5 },   // C
    { width: 28 },  // D: أسم البائع
    { width: 22 },  // E: المبيعات المحققة
    { width: 22 },  // F: التارجت
    { width: 18 },  // G: نسبة التحقيق
  ];
  kpiWs.mergeCells('D2:G2');
  kpiWs.getCell('D2').value = `تقييم وأداء البائعين - ${branchName}`;
  kpiWs.getCell('D2').font = { name: 'Calibri', size: 20, bold: true };
  kpiWs.getCell('D2').fill = lightPurpleBg;
  kpiWs.getCell('D2').alignment = { horizontal: 'center', vertical: 'middle' };
  kpiWs.getRow(2).height = 38;

  const kRow3 = kpiWs.getRow(3);
  kRow3.height = 30;
  kRow3.getCell(4).value = 'أسم البائع';
  kRow3.getCell(5).value = 'المبيعات المحققة';
  kRow3.getCell(6).value = 'التارجت';
  kRow3.getCell(7).value = 'نسبة التحقيق';

  [4, 5, 6, 7].forEach(c => {
    const cell = kRow3.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = darkBlueBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  kpiData.sellers.forEach((seller, idx) => {
    const rIdx = 4 + idx;
    const r = kpiWs.getRow(rIdx);
    r.height = 26;

    const sumifFormula = `SUM(${dailySheetNames.map(s => `SUMIF('${s}'!G:G, D${rIdx}, '${s}'!D:D)`).join(',')})`;

    r.getCell(4).value = seller.seller_name;
    r.getCell(5).value = { formula: sumifFormula, result: seller.total_sales };
    r.getCell(5).numFmt = '#,##0.00';
    r.getCell(6).value = seller.target;
    r.getCell(6).numFmt = '#,##0.00';
    r.getCell(7).value = { formula: `IF(F${rIdx}>0, E${rIdx}/F${rIdx}, 0)`, result: (seller.achievement_percentage / 100) };
    r.getCell(7).numFmt = '0.0%';

    [4, 5, 6, 7].forEach(c => {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  });

  if (kpiData.sellers.length > 0) {
    const totalRowIdx = 4 + kpiData.sellers.length;
    const totRow = kpiWs.getRow(totalRowIdx);
    totRow.height = 28;
    totRow.getCell(4).value = 'الإجمالي';
    totRow.getCell(5).value = { formula: `SUM(E4:E${totalRowIdx - 1})`, result: kpiData.summary.total_sales };
    totRow.getCell(5).numFmt = '#,##0.00';
    totRow.getCell(6).value = { formula: `SUM(F4:F${totalRowIdx - 1})`, result: kpiData.sellers.reduce((sum, s) => sum + s.target, 0) };
    totRow.getCell(6).numFmt = '#,##0.00';
    totRow.getCell(7).value = { formula: `IF(F${totalRowIdx}>0, E${totalRowIdx}/F${totalRowIdx}, 0)`, result: (kpiData.summary.average_achievement / 100) };
    totRow.getCell(7).numFmt = '0.0%';

    [4, 5, 6, 7].forEach(c => {
      const cell = totRow.getCell(c);
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.fill = lightPurpleBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  }

  return wb.xlsx.writeBuffer();
}

/**
 * Shared helper to build OHDA worksheet layout matching the reference workbook exactly
 */
function buildOhdaWorksheet(ohdaWs, ohdaData, branchName, month) {
  const [yearStr, monthStr] = (month || new Date().toISOString().slice(0, 7)).split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const mediumPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC98FE9' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  const baseCol = 2 + daysInMonth * 2;

  // 1. Column Widths
  ohdaWs.getColumn(1).width = 24;
  for (let d = 1; d <= daysInMonth; d++) {
    const attCol = 2 + (d - 1) * 2;
    const advCol = attCol + 1;
    ohdaWs.getColumn(attCol).width = 7.5;
    ohdaWs.getColumn(advCol).width = 7.5;
  }
  for (let c = baseCol; c <= baseCol + 6; c++) {
    ohdaWs.getColumn(c).width = 16;
  }

  // 2. Row Heights
  ohdaWs.getRow(1).height = 42;
  ohdaWs.getRow(2).height = 36;
  ohdaWs.getRow(3).height = 26;
  ohdaWs.getRow(4).height = 30;

  // 3. Row 1: Titles
  ohdaWs.mergeCells(1, 10, 1, 17);
  for (let c = 10; c <= 17; c++) {
    const cell = ohdaWs.getCell(1, c);
    cell.fill = lightPurpleBg;
    cell.border = thinBorder;
  }
  const titleCell = ohdaWs.getCell(1, 10);
  titleCell.value = `عهدة ${branchName} (حضور وسلف)`;
  titleCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ohdaWs.mergeCells(1, baseCol, 1, baseCol + 2);
  for (let c = baseCol; c <= baseCol + 2; c++) {
    const cell = ohdaWs.getCell(1, c);
    cell.fill = lightPurpleBg;
    cell.border = thinBorder;
  }
  const advTitleCell = ohdaWs.getCell(1, baseCol);
  advTitleCell.value = 'سلف';
  advTitleCell.font = { name: 'Calibri', size: 26, bold: true, color: { argb: 'FF1E293B' } };
  advTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 4. Header Merge A2:A4 (الاسم)
  ohdaWs.mergeCells(2, 1, 4, 1);
  for (let r = 2; r <= 4; r++) {
    const cell = ohdaWs.getCell(r, 1);
    cell.fill = mediumPurpleBg;
    cell.border = thinBorder;
  }
  const nameHeader = ohdaWs.getCell(2, 1);
  nameHeader.value = 'الاسم';
  nameHeader.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E293B' } };
  nameHeader.alignment = { horizontal: 'center', vertical: 'middle' };

  // 5. Day Headers (Cols 2 to baseCol - 1)
  for (let d = 1; d <= daysInMonth; d++) {
    const attCol = 2 + (d - 1) * 2;
    const advCol = attCol + 1;
    const dayMeta = ohdaData.daysMeta?.[d - 1];

    const cellAtt = ohdaWs.getCell(2, attCol);
    cellAtt.value = 'حضور';
    cellAtt.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E293B' } };
    cellAtt.fill = mediumPurpleBg;
    cellAtt.alignment = { horizontal: 'center', vertical: 'middle' };
    cellAtt.border = thinBorder;

    const cellAdv = ohdaWs.getCell(2, advCol);
    cellAdv.value = 'سلفة';
    cellAdv.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E293B' } };
    cellAdv.fill = mediumPurpleBg;
    cellAdv.alignment = { horizontal: 'center', vertical: 'middle' };
    cellAdv.border = thinBorder;

    ohdaWs.mergeCells(3, attCol, 3, advCol);
    [attCol, advCol].forEach(c => {
      const cell = ohdaWs.getCell(3, c);
      cell.fill = mediumPurpleBg;
      cell.border = thinBorder;
    });
    const cellDay = ohdaWs.getCell(3, attCol);
    cellDay.value = dayMeta?.dayName || '';
    cellDay.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E293B' } };
    cellDay.alignment = { horizontal: 'center', vertical: 'middle' };

    ohdaWs.mergeCells(4, attCol, 4, advCol);
    [attCol, advCol].forEach(c => {
      const cell = ohdaWs.getCell(4, c);
      cell.fill = lightPurpleBg;
      cell.border = thinBorder;
    });
    const cellDate = ohdaWs.getCell(4, attCol);
    cellDate.value = dayMeta?.date || `${month}-${String(d).padStart(2, '0')}`;
    cellDate.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E293B' } };
    cellDate.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // 6. Summary Column Headers (Rows 2 to 4 merged vertically)
  const sumHeaders = [
    { title: 'من 1 الى 10', offset: 0 },
    { title: 'من 11 الى 20', offset: 1 },
    { title: daysInMonth === 31 ? 'من 21 الى 31' : `من 21 الى ${daysInMonth}`, offset: 2 },
    { title: 'مجمع السلف', offset: 3 },
    { title: 'مجمع الحضور', offset: 4 },
    { title: 'توتال الشهر', offset: 5 },
    { title: 'تقريبا فى اليوم', offset: 6 }
  ];

  sumHeaders.forEach(({ title, offset }) => {
    const colIdx = baseCol + offset;
    ohdaWs.mergeCells(2, colIdx, 4, colIdx);
    for (let r = 2; r <= 4; r++) {
      const cell = ohdaWs.getCell(r, colIdx);
      cell.fill = mediumPurpleBg;
      cell.border = thinBorder;
    }
    const hCell = ohdaWs.getCell(2, colIdx);
    hCell.value = title;
    hCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1E293B' } };
    hCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // 7. Column letters for formulas
  const advCols1to10 = [];
  const advCols11to20 = [];
  const advCols21toEnd = [];
  const attColsAll = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const attCol = 2 + (d - 1) * 2;
    const advCol = attCol + 1;
    attColsAll.push(ohdaWs.getColumn(attCol).letter);
    if (d <= 10) advCols1to10.push(ohdaWs.getColumn(advCol).letter);
    else if (d <= 20) advCols11to20.push(ohdaWs.getColumn(advCol).letter);
    else advCols21toEnd.push(ohdaWs.getColumn(advCol).letter);
  }

  const blColLetter = ohdaWs.getColumn(baseCol).letter;
  const bmColLetter = ohdaWs.getColumn(baseCol + 1).letter;
  const bnColLetter = ohdaWs.getColumn(baseCol + 2).letter;
  const boColLetter = ohdaWs.getColumn(baseCol + 3).letter;
  const bpColLetter = ohdaWs.getColumn(baseCol + 4).letter;
  const bqColLetter = ohdaWs.getColumn(baseCol + 5).letter;
  const brColLetter = ohdaWs.getColumn(baseCol + 6).letter;

  // 8. Data Rows (Employees)
  const employees = ohdaData.employees || [];
  employees.forEach((emp, idx) => {
    const rIdx = 5 + idx;
    const r = ohdaWs.getRow(rIdx);
    r.height = 28;

    const nameCell = r.getCell(1);
    nameCell.value = emp.employee_name;
    nameCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1E293B' } };
    nameCell.fill = mediumPurpleBg;
    nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    nameCell.border = thinBorder;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayRec = emp.days?.[d - 1];
      const attCol = 2 + (d - 1) * 2;
      const advCol = attCol + 1;

      const attCell = r.getCell(attCol);
      attCell.value = dayRec?.attendance ? 1 : '';
      attCell.font = { name: 'Calibri', size: 13, bold: true };
      attCell.alignment = { horizontal: 'center', vertical: 'middle' };
      attCell.border = thinBorder;

      const advCell = r.getCell(advCol);
      if (dayRec?.advance > 0) {
        advCell.value = Number(dayRec.advance);
        advCell.numFmt = '#,##0';
      } else {
        advCell.value = '';
      }
      advCell.font = { name: 'Calibri', size: 12 };
      advCell.alignment = { horizontal: 'center', vertical: 'middle' };
      advCell.border = thinBorder;
    }

    const f1to10 = advCols1to10.map(l => `${l}${rIdx}`).join('+');
    const f11to20 = advCols11to20.map(l => `${l}${rIdx}`).join('+');
    const f21toEnd = advCols21toEnd.map(l => `${l}${rIdx}`).join('+');
    const fTotalAtt = attColsAll.map(l => `${l}${rIdx}`).join('+');

    const c1to10 = r.getCell(baseCol);
    c1to10.value = { formula: f1to10, result: Number(emp.advances_1_to_10 || 0) };
    c1to10.numFmt = '#,##0';

    const c11to20 = r.getCell(baseCol + 1);
    c11to20.value = { formula: f11to20, result: Number(emp.advances_11_to_20 || 0) };
    c11to20.numFmt = '#,##0';

    const c21toEnd = r.getCell(baseCol + 2);
    c21toEnd.value = { formula: f21toEnd, result: Number(emp.advances_21_to_31 || 0) };
    c21toEnd.numFmt = '#,##0';

    const cTotalAdv = r.getCell(baseCol + 3);
    cTotalAdv.value = { formula: `${blColLetter}${rIdx}+${bmColLetter}${rIdx}+${bnColLetter}${rIdx}`, result: Number(emp.total_advances || 0) };
    cTotalAdv.numFmt = '#,##0';

    const cTotalAtt = r.getCell(baseCol + 4);
    cTotalAtt.value = { formula: fTotalAtt, result: Number(emp.total_attendance || 0) };
    cTotalAtt.numFmt = '#,##0';

    const cSalary = r.getCell(baseCol + 5);
    cSalary.value = Number(emp.basic_salary || 0);
    cSalary.numFmt = '#,##0.00';

    const cDaily = r.getCell(baseCol + 6);
    cDaily.value = { formula: `${bqColLetter}${rIdx}/30`, result: Number(emp.daily_rate || 0) };
    cDaily.numFmt = '#,##0.00';

    for (let c = baseCol; c <= baseCol + 6; c++) {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E293B' } };
      cell.fill = lightPurpleBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
  });

  // 9. Totals Row at the bottom
  if (employees.length > 0) {
    const totRowIdx = 5 + employees.length;
    const totRow = ohdaWs.getRow(totRowIdx);
    totRow.height = 30;

    const totName = totRow.getCell(1);
    totName.value = 'الإجمالي';
    totName.font = { name: 'Calibri', size: 14, bold: true };
    totName.fill = mediumPurpleBg;
    totName.alignment = { horizontal: 'center', vertical: 'middle' };
    totName.border = thinBorder;

    for (let d = 1; d <= daysInMonth; d++) {
      const attCol = 2 + (d - 1) * 2;
      const advCol = attCol + 1;
      const attLetter = ohdaWs.getColumn(attCol).letter;
      const advLetter = ohdaWs.getColumn(advCol).letter;

      const tAttCell = totRow.getCell(attCol);
      tAttCell.value = { formula: `SUM(${attLetter}5:${attLetter}${totRowIdx - 1})` };
      tAttCell.font = { name: 'Calibri', size: 12, bold: true };
      tAttCell.alignment = { horizontal: 'center', vertical: 'middle' };
      tAttCell.border = thinBorder;

      const tAdvCell = totRow.getCell(advCol);
      tAdvCell.value = { formula: `SUM(${advLetter}5:${advLetter}${totRowIdx - 1})` };
      tAdvCell.font = { name: 'Calibri', size: 12, bold: true };
      tAdvCell.numFmt = '#,##0';
      tAdvCell.alignment = { horizontal: 'center', vertical: 'middle' };
      tAdvCell.border = thinBorder;
    }

    for (let c = baseCol; c <= baseCol + 6; c++) {
      const letter = ohdaWs.getColumn(c).letter;
      const cell = totRow.getCell(c);
      cell.value = { formula: `SUM(${letter}5:${letter}${totRowIdx - 1})` };
      cell.font = { name: 'Calibri', size: 13, bold: true };
      cell.fill = lightPurpleBg;
      cell.numFmt = (c === baseCol + 5 || c === baseCol + 6) ? '#,##0.00' : '#,##0';
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }
  }
}

/**
 * 13. OHDA Report Standalone (.xlsx)
 */
async function generateOhdaReportExcel(ohdaData, options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.created = new Date();

  const branchName = options.branchName || (ohdaData.branch_name || 'فرع الرمل');
  const month = options.period || (ohdaData.month || new Date().toISOString().slice(0, 7));

  const ohdaWs = wb.addWorksheet('OHDA', { views: [{ rightToLeft: true }] });
  buildOhdaWorksheet(ohdaWs, ohdaData, branchName, month);

  return wb.xlsx.writeBuffer();
}

/**
 * 14. SALARY Report Standalone (.xlsx)
 */
async function generateSalaryReportExcel(salaryData, options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.created = new Date();

  const branchName = options.branchName || (salaryData.branch_name || 'فرع الرمل');
  const month = options.period || (salaryData.month || new Date().toISOString().slice(0, 7));

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  const salWs = wb.addWorksheet('SALARY', { views: [{ rightToLeft: true }] });
  salWs.columns = [
    { width: 5 },   // A: spacer
    { width: 28 },  // B: الاسم
    { width: 16 },  // C: الساعات المحققه
    { width: 16 },  // D: الساعات المطلوبه
    { width: 14 },  // E: تاخيرات
    { width: 14 },  // F: بدلات
    { width: 14 },  // G: اوفر تايم
    { width: 16 },  // H: مبلغ الاوفر تايم
    { width: 16 },  // I: الراتب
    { width: 14 },  // J: اليوميه
    { width: 16 },  // K: الاساسي
    { width: 14 },  // L: ايام العمل
    { width: 16 },  // M: بدل مواصلات
    { width: 24 },  // N: البيان
    { width: 14 },  // O: المبلغ
    { width: 16 },  // P: السلف
    { width: 12 },  // Q: غياب
    { width: 16 },  // R: المبلغ
    { width: 12 },  // S: اجازات
    { width: 16 },  // T: المبلغ
    { width: 12 },  // U: نص يوم
    { width: 16 },  // V: المبلغ
    { width: 14 },  // W: خصومات
    { width: 16 },  // X: خصومات تاخير
    { width: 20 },  // Y: القبض
    { width: 5 },   // Z: spacer
    { width: 16 },  // AA: ديون قديمه
    { width: 16 },  // AB: ديون خارجيه
  ];

  salWs.mergeCells('B2:AB2');
  salWs.getCell('B2').value = `مرتبات ${branchName} - ${month}`;
  salWs.getCell('B2').font = { name: 'Calibri', size: 22, bold: true };
  salWs.getCell('B2').fill = lightPurpleBg;
  salWs.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };
  salWs.getRow(2).height = 40;

  const sRow4 = salWs.getRow(4);
  sRow4.height = 32;
  const salHeaders = [
    null, 'الاسم', 'الساعات المحققه', 'الساعات المطلوبه', 'تاخيرات', 'بدلات', 'اوفر تايم', 'مبلغ الاوفر تايم',
    'الراتب', 'اليوميه', 'الاساسي', 'ايام العمل', 'بدل مواصلات', 'البيان', 'المبلغ', 'السلف',
    'غياب', 'المبلغ', 'اجازات', 'المبلغ', 'نص يوم', 'المبلغ', 'خصومات', 'خصومات تاخير', 'القبض',
    null, 'ديون قديمه', 'ديون خارجيه'
  ];
  salHeaders.forEach((h, cIdx) => {
    if (h) {
      const cell = sRow4.getCell(cIdx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = darkBlueBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    }
  });

  (salaryData.employees || []).forEach((emp, idx) => {
    const rIdx = 5 + idx;
    const r = salWs.getRow(rIdx);
    r.height = 26;

    r.getCell(2).value = emp.employee_name;
    r.getCell(3).value = Number(emp.actual_hours || 0);
    r.getCell(3).numFmt = '#,##0.00';
    r.getCell(4).value = Number(emp.required_hours || 268);
    r.getCell(5).value = emp.delay_hours > 0 ? -emp.delay_hours : 0;
    r.getCell(6).value = emp.allowances || '';
    r.getCell(7).value = Number(emp.overtime_hours || 0);
    r.getCell(8).value = { formula: `((J${rIdx}/10)*1.35)*(G${rIdx})`, result: Number(emp.overtime_amount || 0) };
    r.getCell(8).numFmt = '#,##0.00';
    r.getCell(9).value = Number(emp.basic_salary || 0);
    r.getCell(10).value = { formula: `I${rIdx}/30`, result: Number(emp.daily_rate || 0) };
    r.getCell(10).numFmt = '#,##0.00';
    r.getCell(11).value = { formula: `J${rIdx}*L${rIdx}+F${rIdx}+H${rIdx}+M${rIdx}`, result: Number(emp.gross_salary || 0) };
    r.getCell(11).numFmt = '#,##0.00';
    r.getCell(12).value = Number(emp.work_days || 30);
    r.getCell(13).value = emp.transportation_allowance || '';
    r.getCell(14).value = '';
    r.getCell(15).value = '';
    r.getCell(16).value = Number(emp.advances || 0);
    r.getCell(16).numFmt = '#,##0.00';
    r.getCell(17).value = Number(emp.absent_days || 0);
    r.getCell(18).value = { formula: `Q${rIdx} * J${rIdx} * 2`, result: Number(emp.absent_deduction || 0) };
    r.getCell(18).numFmt = '#,##0.00';
    r.getCell(19).value = Number(emp.leave_days || 0);
    r.getCell(20).value = { formula: `IF(S${rIdx} > 4, (S${rIdx} - 4) * J${rIdx}, 0)`, result: Number(emp.leave_deduction || 0) };
    r.getCell(20).numFmt = '#,##0.00';
    r.getCell(21).value = Number(emp.half_days || 0);
    r.getCell(22).value = { formula: `U${rIdx} * (J${rIdx} / 2)`, result: Number(emp.half_day_deduction || 0) };
    r.getCell(22).numFmt = '#,##0.00';
    r.getCell(23).value = emp.other_deductions || '';
    r.getCell(24).value = { formula: `IF(E${rIdx}=0,0,ABS(E${rIdx})*(J${rIdx}/10))`, result: Number(emp.delay_deduction || 0) };
    r.getCell(24).numFmt = '#,##0.00;-#,##0.00;""';
    r.getCell(25).value = { formula: `K${rIdx}-O${rIdx}-P${rIdx}-R${rIdx}-T${rIdx}-V${rIdx}-W${rIdx}-X${rIdx}-AA${rIdx}`, result: Number(emp.net_salary || 0) };
    r.getCell(25).numFmt = '#,##0.00';
    r.getCell(27).value = emp.old_debts || '';
    r.getCell(28).value = emp.external_debts || '';

    r.eachCell(c => {
      c.font = { name: 'Calibri', size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = thinBorder;
    });
  });

  if (salaryData.employees?.length > 0) {
    const totRowIdx = 5 + salaryData.employees.length;
    const totRow = salWs.getRow(totRowIdx);
    totRow.height = 30;
    totRow.getCell(2).value = 'الإجمالي';
    totRow.getCell(2).font = { name: 'Calibri', size: 12, bold: true };
    totRow.getCell(2).fill = lightPurpleBg;
    totRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    totRow.getCell(2).border = thinBorder;

    const sumCols = [8, 9, 11, 16, 18, 20, 22, 24, 25];
    sumCols.forEach(c => {
      const colLetter = salWs.getColumn(c).letter;
      const cell = totRow.getCell(c);
      cell.value = { formula: `SUM(${colLetter}5:${colLetter}${totRowIdx - 1})` };
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = lightPurpleBg;
      cell.border = thinBorder;
      cell.numFmt = '#,##0.00';
    });
  }

  return wb.xlsx.writeBuffer();
}

/**
 * 15. KPI Report Standalone (.xlsx)
 */
async function generateKpiReportExcel(kpiData, options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.created = new Date();

  const branchName = options.branchName || (kpiData.branch_name || 'فرع الرمل');
  const month = options.period || (kpiData.month || new Date().toISOString().slice(0, 7));

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  const kpiWs = wb.addWorksheet('KPI', { views: [{ rightToLeft: true }] });
  kpiWs.columns = [
    { width: 5 },   // A
    { width: 28 },  // B: أسم البائع
    { width: 22 },  // C: المبيعات المحققة
    { width: 22 },  // D: التارجت
    { width: 18 },  // E: نسبة التحقيق
  ];

  kpiWs.mergeCells('B2:E2');
  kpiWs.getCell('B2').value = `تقييم وأداء البائعين - ${branchName} - ${month}`;
  kpiWs.getCell('B2').font = { name: 'Calibri', size: 20, bold: true };
  kpiWs.getCell('B2').fill = lightPurpleBg;
  kpiWs.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };
  kpiWs.getRow(2).height = 38;

  const kRow3 = kpiWs.getRow(3);
  kRow3.height = 30;
  kRow3.getCell(2).value = 'أسم البائع';
  kRow3.getCell(3).value = 'المبيعات المحققة';
  kRow3.getCell(4).value = 'التارجت';
  kRow3.getCell(5).value = 'نسبة التحقيق';

  [2, 3, 4, 5].forEach(c => {
    const cell = kRow3.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = darkBlueBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  (kpiData.sellers || []).forEach((seller, idx) => {
    const rIdx = 4 + idx;
    const r = kpiWs.getRow(rIdx);
    r.height = 26;

    r.getCell(2).value = seller.seller_name;
    r.getCell(3).value = Number(seller.total_sales || 0);
    r.getCell(3).numFmt = '#,##0.00';
    r.getCell(4).value = Number(seller.target || 0);
    r.getCell(4).numFmt = '#,##0.00';
    r.getCell(5).value = (Number(seller.achievement_percentage || 0) / 100);
    r.getCell(5).numFmt = '0.0%';

    [2, 3, 4, 5].forEach(c => {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  });

  const totalRowIdx = 4 + (kpiData.sellers?.length || 0);
  const totRow = kpiWs.getRow(totalRowIdx);
  totRow.height = 28;
  totRow.getCell(2).value = 'الإجمالي';
  totRow.getCell(3).value = Number(kpiData.summary?.total_sales || 0);
  totRow.getCell(3).numFmt = '#,##0.00';
  totRow.getCell(4).value = (kpiData.sellers || []).reduce((sum, s) => sum + Number(s.target || 0), 0);
  totRow.getCell(4).numFmt = '#,##0.00';
  totRow.getCell(5).value = (Number(kpiData.summary?.average_achievement || 0) / 100);
  totRow.getCell(5).numFmt = '0.0%';

  [2, 3, 4, 5].forEach(c => {
    const cell = totRow.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.fill = lightPurpleBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  return wb.xlsx.writeBuffer();
}
module.exports = {
  createBaseWorkbook,
  formatPaymentMethodLabel,
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
  generateConsolidatedBranchExcel,
  generateOhdaReportExcel,
  generateSalaryReportExcel,
  generateKpiReportExcel,
};
