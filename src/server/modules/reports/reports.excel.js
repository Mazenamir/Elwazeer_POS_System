const ExcelJS = require('exceljs');
const {
  sanitizeFormulaValue,
  formatCairoDateTime,
  getBranchBranding,
  getBranchLogoAsset,
  getBranchCleanName,
  getReportBranchTitle,
} = require('./reports.helpers');

// Global styling palette matching reference workbook exactly
const bannerBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EDEF' } };
const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
const whiteBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};
const headerBorder = {
  top: { style: 'medium', color: { argb: 'FF94A3B8' } },
  bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

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
  const isAll = !options.branchName || options.branchName === 'all' || options.branchName === 'كافة الفروع' || options.branchName === 'كل الفروع' || options.branchName === 'كافة الفروع (مجمّع)';
  const clean = isAll ? 'كل الفروع' : getBranchCleanName(options.branchName);
  const branchName = isAll ? 'كل الفروع' : (clean.startsWith('فرع') ? clean : `فرع ${clean}`);
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
 * Builds the approved 4-track Daily Operations & Cash Drawer settlement worksheet
 * Track 1: Sales / Invoices (A..H)
 * Track 2: Staff Attendance & Advances (I..J, M..Q)
 * Track 4: Cash Expenses & Supplier Cash Payments from drawer (K..L)
 * Track 3: Separate Electronic Payments (InstaPay, Visa, Vodafone Cash) (R..U)
 * Row 76: Daily Totals
 * Row 77: Net Cash Drawer Settlement (E76-K77)
 * Row 78: Electronic Breakdown Note
 */
function buildDailyOperationsSheet(ws, d, titleOrOptions, maybeOptions = {}) {
  ws.views = [{ rightToLeft: true }];
  let title = typeof titleOrOptions === 'string' ? titleOrOptions : null;
  const options = typeof titleOrOptions === 'object' && titleOrOptions !== null ? titleOrOptions : maybeOptions;

  const isAll = Boolean(options.isAll || options.cleanName === 'كل الفروع' || options.branchName === 'كل الفروع' || options.branchId === 'all');
  const rawBranchName = options.cleanName || options.branchName || (isAll ? 'كل الفروع' : 'الفرع');
  const cleanName = isAll ? 'كل الفروع' : getBranchCleanName(rawBranchName);
  const branchDisplayName = isAll ? 'كل الفروع' : (cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`);

  let displayTitle = '';
  if (isAll) {
    displayTitle = 'كل الفروع';
  } else if (title && typeof title === 'string') {
    let cleanedTitle = title
      .replace(/^التقرير\s+الشهري\s+المجمع\s+لبيبيون\s+/gi, '')
      .replace(/^التقرير\s+المجمع\s+لبيبيون\s+/gi, '')
      .replace(/^التقرير\s+اليومي\s+لبيبيون(\s*[-–]\s*)?/gi, '')
      .replace(/^التقرير\s+اليومي(\s*[-–]\s*)?/gi, '')
      .replace(/^بيبيون\s+للبدل\s+الرجالي(\s*[-–]\s*)?/gi, '')
      .replace(/^بيبيون\s+فرع\s+/gi, 'فرع ')
      .replace(/^بيبيون\s+/gi, '')
      .trim();
    if (!cleanedTitle || cleanedTitle === 'كل الفروع' || cleanedTitle === 'كافة الفروع') {
      displayTitle = isAll ? 'كل الفروع' : branchDisplayName;
    } else {
      displayTitle = cleanedTitle.startsWith('فرع') ? cleanedTitle : `فرع ${cleanedTitle}`;
    }
  } else {
    displayTitle = branchDisplayName;
  }

  // 1. Column Widths Matching Reference Workbook Exactly
  ws.columns = [
    { width: 14.14 }, // A: التاريخ
    { width: 15.29 }, // B: رقم الفاتورة
    { width: 64.43 }, // C: البيان 
    { width: 17.00 }, // D: الأجمالي
    { width: 16.00 }, // E: المدفوع 
    { width: 14.86 }, // F: الباقي
    { width: 18.57 }, // G: أسم البائع
    { width: 16.71 }, // H: تاريخ الأستلام
    { width: 23.29 }, // I: الموظف
    { width: 18.00 }, // J: السلف
    { width: 23.86 }, // K: مصروفات آخرى
    { width: 14.14 }, // L: المبلغ
    { width: 24.00 }, // M: نوع الدفع الإلكتروني
    { width: 24.57 }, // N: رقم المرجع / الفاتورة
    { width: 19.71 }, // O: المبلغ الإلكتروني
    { width: 20.43 }, // P: أسماء الموظفين 
    { width: 15.86 }, // Q: وقت الحضور 
    { width: 18.86 }, // R: وقت الانصراف
    { width: 16.14 }, // S: عداد الساعات
    { width: 21.57 }  // T: ملاحظات
  ];

  // 2. Row 1: Title & Logo (Anchored strictly inside Row 1: A1:B1 logo, C1:T1 title)
  ws.mergeCells('A1:B1');
  ws.mergeCells('C1:T1');

  // Format A1:B1 (Logo container matching reference banner styling)
  const logoCellA = ws.getCell('A1');
  const logoCellB = ws.getCell('B1');
  [logoCellA, logoCellB].forEach(cell => {
    cell.fill = bannerBg;
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      left: { style: 'medium', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Format C1:T1 (Title banner)
  const titleCell = ws.getCell('C1');
  titleCell.value = displayTitle;
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.fill = bannerBg;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let c = 3; c <= 20; c++) {
    const cell = ws.getRow(1).getCell(c);
    cell.fill = bannerBg;
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: c === 20 ? 'medium' : 'thin', color: { argb: c === 20 ? 'FF94A3B8' : 'FFCBD5E1' } },
    };
  }
  ws.getRow(1).height = 69;

  const logoAsset = options.logoAsset || options.branding?.logo || d?.branding?.logo || getBranchLogoAsset();
  if (logoAsset?.buffer && ws.workbook) {
    try {
      const imgId = ws.workbook.addImage({
        buffer: logoAsset.buffer,
        extension: logoAsset.extension || 'png',
      });
      // Anchored strictly inside Row 1 with clean margins to prevent any bleed into Row 2 headers
      ws.addImage(imgId, {
        tl: { col: 0.15, row: 0.08 },
        br: { col: 1.85, row: 0.90 },
        editAs: 'oneCell',
      });
    } catch {
      // safe fallback
    }
  }

  // 3. Row 2: 20 Headers Matching Reference Workbook Character-for-Character
  const hRow = ws.getRow(2);
  hRow.height = 38.25;
  hRow.values = [
    'التاريخ', 'رقم الفاتورة', 'البيان ', 'الأجمالي', 'المدفوع ', 'الباقي',
    'أسم البائع', 'تاريخ الأستلام', 'الموظف', 'السلف', 'مصروفات آخرى', 'المبلغ',
    'نوع الدفع الإلكتروني', 'رقم المرجع / الفاتورة', 'المبلغ الإلكتروني',
    'أسماء الموظفين ', 'وقت الحضور ', 'وقت الانصراف', 'عداد الساعات', 'ملاحظات'
  ];
  hRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = bannerBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      left: { style: colNumber === 1 ? 'medium' : 'thin', color: { argb: colNumber === 1 ? 'FF94A3B8' : 'FFCBD5E1' } },
      right: { style: colNumber === 20 ? 'medium' : 'thin', color: { argb: colNumber === 20 ? 'FF94A3B8' : 'FFCBD5E1' } },
    };
  });

  // Track 2: Staff
  const staffList = [...(d?.attendance || [])];
  const staffNames = new Set(staffList.map(s => s.employee_name));
  const staffIds = new Set(staffList.map(s => String(s.employee_id)));
  (d?.advances || []).forEach(adv => {
    if (!staffNames.has(adv.employee_name) && (!adv.employee_id || !staffIds.has(String(adv.employee_id)))) {
      staffList.push({
        employee_id: adv.employee_id,
        employee_name: adv.employee_name,
        total_hours: 0,
        status: 'absent',
        notes: 'سلفة',
      });
      staffNames.add(adv.employee_name);
      if (adv.employee_id) staffIds.add(String(adv.employee_id));
    }
  });

  const advanceByEmp = new Map();
  (d?.advances || []).forEach(adv => {
    const keyName = adv.employee_name;
    const keyId = adv.employee_id ? String(adv.employee_id) : null;
    const current = (advanceByEmp.get(keyName)?.amount || 0) + Number(adv.amount || 0);
    const combined = { employee_name: keyName, employee_id: adv.employee_id, amount: current };
    advanceByEmp.set(keyName, combined);
    if (keyId) advanceByEmp.set(keyId, combined);
  });

  // Track 4: Expenses & Drawer Deductions
  const deductionItems = [];
  (d?.expenses || []).forEach(exp => {
    const expMethod = formatPaymentMethodLabel(exp);
    const desc = exp.payment_method && exp.payment_method !== 'cash'
      ? `${exp.description} (${expMethod})`
      : exp.description;
    deductionItems.push({
      description: desc,
      amount: Number(exp.amount || 0),
    });
  });
  (d?.supplier_payments || []).forEach(sp => {
    deductionItems.push({
      description: `سداد مورد (كاش): ${sp.supplier_name}${sp.notes ? ` - ${sp.notes}` : ''}`,
      amount: Number(sp.amount || 0),
    });
  });

  // Track 3: Separate Electronic Payments
  const electronicPayments = [];
  (d?.sales_invoices || []).forEach(inv => {
    if (inv.payment_splits && Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0) {
      inv.payment_splits.forEach(s => {
        const m = (s.method || '').toLowerCase();
        const a = Number(s.amount || 0);
        if (a > 0 && m !== 'cash') {
          let label = 'إلكتروني';
          if (m === 'card' || m === 'visa') label = 'فيزا';
          else if (m === 'bank_transfer' || m === 'bank' || m === 'instapay') label = 'انستاباي';
          else if (m === 'wallet') label = 'فودافون كاش';
          electronicPayments.push({
            type: label,
            ref: inv.invoice_number || inv.id,
            amount: a,
            notes: inv.seller_name || '',
          });
        }
      });
    } else {
      const pm = (inv.payment_method || '').toLowerCase();
      const cardAmt = Number(inv.card_amount || 0);
      const bankAmt = Number(inv.bank_transfer_amount || 0);
      const walletAmt = Number(inv.wallet_amount || 0);
      if (cardAmt > 0) electronicPayments.push({ type: 'فيزا', ref: inv.invoice_number, amount: cardAmt });
      if (bankAmt > 0) electronicPayments.push({ type: 'انستاباي', ref: inv.invoice_number, amount: bankAmt });
      if (walletAmt > 0) electronicPayments.push({ type: 'فودافون كاش', ref: inv.invoice_number, amount: walletAmt });
      if (cardAmt === 0 && bankAmt === 0 && walletAmt === 0 && pm !== 'cash' && Number(inv.paid_amount || 0) > 0) {
        let label = 'إلكتروني';
        if (pm === 'visa' || pm === 'card') label = 'فيزا';
        else if (pm === 'bank_transfer' || pm === 'instapay') label = 'انستاباي';
        else if (pm === 'wallet') label = 'فودافون كاش';
        electronicPayments.push({ type: label, ref: inv.invoice_number || inv.id, amount: Number(inv.paid_amount || 0) });
      }
    }
  });

  const maxRows = Math.max(
    (d?.sales_invoices || []).length,
    deductionItems.length,
    staffList.length,
    electronicPayments.length,
    1
  );

  // Rows 3 to 75
  for (let i = 0; i < 73; i++) {
    const rowIdx = 3 + i;
    const r = ws.getRow(rowIdx);
    r.height = 24;

    // Track 1: Sales Invoices (Cols A..H)
    const inv = (d?.sales_invoices || [])[i];
    if (inv) {
      r.getCell(1).value = inv.invoice_date || options.date || '';
      r.getCell(2).value = Number(inv.invoice_number) || inv.invoice_number;
      const invMethod = formatPaymentMethodLabel(inv);
      const desc = inv.payment_method && inv.payment_method !== 'cash'
        ? `${inv.description} (${invMethod})`
        : inv.description;
      r.getCell(3).value = desc;
      r.getCell(4).value = Number(inv.total_amount || 0);
      r.getCell(5).value = Number(inv.paid_amount || 0);
      r.getCell(6).value = { formula: `D${rowIdx}-E${rowIdx}`, result: Number(inv.remaining_amount || 0) };
      r.getCell(7).value = inv.seller_name || '';
      r.getCell(8).value = inv.delivery_date || inv.invoice_date || '';
    } else if (i < maxRows) {
      r.getCell(6).value = { formula: `D${rowIdx}-E${rowIdx}`, result: 0 };
    }

    // Track 2: Staff Attendance (Cols P..T) and Employee Advance (Cols I..J)
    if (i < staffList.length) {
      const staff = staffList[i];
      const adv = advanceByEmp.get(staff.employee_name) || (staff.employee_id ? advanceByEmp.get(String(staff.employee_id)) : null);

      r.getCell(9).value = { formula: `P${rowIdx}`, result: staff.employee_name };
      if (adv && adv.amount > 0) {
        r.getCell(10).value = Number(adv.amount || 0);
      }

      r.getCell(16).value = staff.employee_name;
      r.getCell(17).value = staff.check_in_24 || (staff.check_in ? staff.check_in.replace(/\s*[AP]M/i, '').trim() : '');
      r.getCell(18).value = staff.check_out_24 || (staff.check_out ? staff.check_out.replace(/\s*[AP]M/i, '').trim() : '');
      if (staff.total_hours > 0) {
        r.getCell(19).value = {
          formula: `IF(OR(Q${rowIdx}="",R${rowIdx}=""),"",MOD(R${rowIdx}-Q${rowIdx},1))`,
          result: staff.total_hours / 24,
        };
        r.getCell(19).numFmt = 'h:mm';
      } else {
        r.getCell(19).value = '';
      }
      r.getCell(20).value = staff.notes || (staff.status === 'absent' ? 'غياب' : '');
    } else {
      r.getCell(9).value = { formula: `P${rowIdx}`, result: 0 };
    }

    // Track 4: Deductions (Cols K..L)
    const ded = deductionItems[i];
    if (ded) {
      r.getCell(11).value = ded.description;
      r.getCell(12).value = ded.amount;
    }

    // Track 3: Electronic Payments (Cols M..O)
    const ep = electronicPayments[i];
    if (ep) {
      r.getCell(13).value = ep.type;
      r.getCell(14).value = ep.ref;
      r.getCell(15).value = ep.amount;
    }

    for (let c = 1; c <= 20; c++) {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if ([4, 5, 6, 10, 12, 15].includes(c) && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
      }
    }
  }

  // Row 76 Summary (Merge B76:C77)
  ws.mergeCells('B76:C77');
  const r76 = ws.getRow(76);
  r76.height = 26;
  const labelCell = r76.getCell(2);
  labelCell.value = 'اجمالى اليوم ';
  labelCell.font = { name: 'Calibri', size: 12, bold: true };
  labelCell.fill = lightPurpleBg;
  labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  labelCell.border = thinBorder;

  r76.getCell(4).value = { formula: 'SUM(D3:D75)', result: d?.summary?.total_sales || 0 };
  r76.getCell(5).value = { formula: 'SUM(E3:E75)', result: d?.summary?.total_paid || 0 };
  r76.getCell(10).value = { formula: 'SUM(J3:J75)', result: d?.summary?.total_advances || 0 };
  const totalL76 = (d?.summary?.total_expenses || 0) + (d?.summary?.total_supplier_cash_payments || 0);
  r76.getCell(12).value = { formula: 'SUM(L3:L75)', result: totalL76 };
  const totalElectronic = Number(d?.summary?.electronic_collections || 0);
  r76.getCell(15).value = { formula: 'SUM(O3:O75)', result: totalElectronic };

  [4, 5, 10, 12, 15].forEach(c => {
    const cell = r76.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = lightPurpleBg;
    cell.border = thinBorder;
    cell.numFmt = '#,##0.00';
  });

  // Row 77 Cash Closing (Merge D77:F77)
  ws.mergeCells('D77:F77');
  const r77 = ws.getRow(77);
  r77.height = 28;
  const netCash = d?.summary?.cash_in_drawer ?? (d?.summary?.total_paid - d?.summary?.total_deductions);
  const closingCell = r77.getCell(4);
  closingCell.value = { formula: 'E76-K77', result: netCash };
  closingCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1E293B' } };
  closingCell.fill = lightPurpleBg;
  closingCell.alignment = { horizontal: 'center', vertical: 'middle' };
  closingCell.border = thinBorder;
  closingCell.numFmt = '#,##0.00';

  const sumDeductionsCell = r77.getCell(11);
  sumDeductionsCell.value = { formula: 'J76+L76+O76', result: (d?.summary?.total_deductions || 0) + totalElectronic };
  sumDeductionsCell.font = { name: 'Calibri', size: 11, bold: true };
  sumDeductionsCell.fill = lightPurpleBg;
  sumDeductionsCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sumDeductionsCell.border = thinBorder;
  sumDeductionsCell.numFmt = '#,##0.00';
}

/**
 * 5. Detailed Daily Invoices Report (Sales, Rentals, Tailoring, Cash)
 */
async function generateDailyReportExcel(dailyData, options = {}) {
  const wb = createBaseWorkbook('تفاصيل التقرير اليومي');
  
  // Sheet 1: Daily Operations & Cash Drawer Settlement (4 Parallel Tracks + Row 76/77)
  if (dailyData?.summary || Array.isArray(dailyData?.sales_invoices)) {
    const wsDailyOps = wb.addWorksheet('التقرير اليومي والدرج', { views: [{ rightToLeft: true }] });
    const isAll = options.cleanName === 'كل الفروع' || options.branchName === 'كل الفروع' || options.branchId === 'all';
    const clean = options.cleanName || (options.branchName ? getBranchCleanName(options.branchName) : 'الفرع');
    const bTitle = isAll ? 'كل الفروع' : (clean.startsWith('فرع') ? clean : `فرع ${clean}`);
    buildDailyOperationsSheet(wsDailyOps, dailyData, bTitle, options);
  }

  // Sheet 2: Summary by branch (if branch_sales exists)
  if (Array.isArray(dailyData?.branch_sales) && dailyData.branch_sales.length > 0) {
    const wsSummary = wb.addWorksheet('ملخص الفروع');
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

  }

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

  // Sheet 5: Expenses
  const expenseList = Array.isArray(dailyData.expenses_details?.items)
    ? dailyData.expenses_details.items
    : (Array.isArray(dailyData.expenses?.items) ? dailyData.expenses.items : (Array.isArray(dailyData.expenses) ? dailyData.expenses : []));
  if (expenseList.length > 0) {
    const wsExpenses = wb.addWorksheet('المصروفات اليومية');
    applyWorksheetStyles(wsExpenses, 'سجل المصروفات اليومية', options);

    const expHeader = wsExpenses.getRow(4);
    expHeader.values = ['رقم الإيصال', 'التاريخ', 'الفرع', 'البند / التصنيف', 'البيان والملاحظات', 'طريقة الدفع', 'المبلغ (ج.م)'];
    styleHeaderRow(expHeader);

    expenseList.forEach((e, idx) => {
      const row = wsExpenses.getRow(5 + idx);
      row.values = [
        sanitizeFormulaValue(String(e.id || '-')),
        e.expense_date || options.date || dailyData.date || '-',
        sanitizeFormulaValue(e.branch_name || '-'),
        sanitizeFormulaValue(e.category || 'غير محدد'),
        sanitizeFormulaValue(e.notes || e.description || '-'),
        formatPaymentMethodLabel(e),
        Number(e.amount || 0),
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(7).numFmt = '#,##0.00';
    });

    const totExpRow = wsExpenses.getRow(5 + expenseList.length);
    totExpRow.values = [
      'الإجمالي',
      '',
      '',
      '',
      '',
      '',
      expenseList.reduce((s, e) => s + Number(e.amount || 0), 0),
    ];
    styleTotalRow(totExpRow);
    totExpRow.getCell(7).numFmt = '#,##0.00';

    autoFitColumns(wsExpenses);
  }

  // Sheet 6: Staff Attendance & Advances
  const staffAttendance = Array.isArray(dailyData.attendance) ? dailyData.attendance : [];
  const salaryAdvances = Array.isArray(dailyData.salaries_details?.items)
    ? dailyData.salaries_details.items.filter(s => s.transaction_type === 'advance')
    : [];

  if (staffAttendance.length > 0 || salaryAdvances.length > 0) {
    const wsStaff = wb.addWorksheet('حضور وسلف الموظفين');
    applyWorksheetStyles(wsStaff, 'سجل حضور وانصراف وسلف الموظفين لليوم', options);

    const stHeader = wsStaff.getRow(4);
    stHeader.values = ['الموظف', 'الفرع', 'وقت الحضور', 'وقت الانصراف', 'ساعات العمل', 'السلفة اليومية (ج.م)', 'ملاحظات'];
    styleHeaderRow(stHeader);

    const advByEmp = new Map();
    salaryAdvances.forEach(adv => {
      advByEmp.set(adv.employee_name, (advByEmp.get(adv.employee_name) || 0) + Number(adv.amount || 0));
    });

    staffAttendance.forEach((st, idx) => {
      const row = wsStaff.getRow(5 + idx);
      const advAmt = advByEmp.get(st.employee_name) || 0;
      row.values = [
        sanitizeFormulaValue(st.employee_name || '-'),
        sanitizeFormulaValue(st.branch_name || '-'),
        st.check_in || '-',
        st.check_out || '-',
        Number(st.total_hours || 0),
        advAmt,
        sanitizeFormulaValue(st.notes || (st.status === 'absent' ? 'غياب' : '-')),
      ];
      styleDataRow(row, idx % 2 === 1);
      row.getCell(5).numFmt = '0.0';
      row.getCell(6).numFmt = '#,##0.00';
    });

    const totStRow = wsStaff.getRow(5 + staffAttendance.length);
    totStRow.values = [
      'الإجمالي',
      '',
      '',
      '',
      staffAttendance.reduce((s, st) => s + Number(st.total_hours || 0), 0),
      Array.from(advByEmp.values()).reduce((s, a) => s + a, 0),
      '',
    ];
    styleTotalRow(totStRow);
    totStRow.getCell(5).numFmt = '0.0';
    totStRow.getCell(6).numFmt = '#,##0.00';

    autoFitColumns(wsStaff);
  }

  // Sheet 7: Cash Drawer Settlement Summary
  const wsSettlement = wb.addWorksheet('تقفيل الدرج والخزينة');
  applyWorksheetStyles(wsSettlement, 'بيان تسوية النقدية وتقفيل الدرج اليومي', options);

  const setHeader = wsSettlement.getRow(4);
  setHeader.values = ['البند المحاسبي', 'القيمة (ج.م)', 'ملاحظات وتوجيه النقدية'];
  styleHeaderRow(setHeader);

  const summaryObj = dailyData.summary || {};
  const totalRev = Number(summaryObj.total_revenue ?? summaryObj.revenue ?? 0);
  const totalSalesVal = Number(summaryObj.total_sales ?? summaryObj.sales ?? 0);
  const totalRentalsVal = Number(summaryObj.total_rentals ?? summaryObj.rentals ?? 0);
  const totalTailoringVal = Number(summaryObj.total_tailoring ?? summaryObj.tailoring ?? 0);
  const totalExpensesVal = Number(summaryObj.total_expenses ?? summaryObj.expenses ?? 0);
  const totalAdvancesVal = Number(summaryObj.total_advances ?? summaryObj.advances ?? 0);
  const cashInDrawerVal = Number(summaryObj.cash_in_drawer ?? summaryObj.physical_cash_in_drawer ?? summaryObj.net_cash ?? 0);

  const settlementRows = [
    ['إجمالي إيراد المبيعات', totalSalesVal, 'شامل صافي مبيعات الكاشير بعد استبعاد المرتجعات'],
    ['إجمالي إيراد التأجير والغرامات', totalRentalsVal, 'شامل متحصلات عقود الإيجار وغرامات التأخير'],
    ['إجمالي إيراد التفصيل', totalTailoringVal, 'شامل العربون والدفعات المتبقية لطلبات التفصيل'],
    ['إجمالي الإيرادات الكلية', totalRev, 'المجموع الكلي لكافة بنود الإيراد لليوم'],
    ['إجمالي المصروفات التشغيلية', totalExpensesVal, 'يخصم من النقدية بالفرع'],
    ['إجمالي سلف الموظفين', totalAdvancesVal, 'يخصم من النقدية بالفرع كعهدة موظف'],
    ['صافي الكاش المتبقي بالدرج للتوريد', cashInDrawerVal, 'الكاش الفعلي الواجب توريده ومطابقته بالدرج بعد خصم المصروفات والسلف'],
  ];

  settlementRows.forEach((sr, idx) => {
    const row = wsSettlement.getRow(5 + idx);
    row.values = [sr[0], sr[1], sr[2]];
    styleDataRow(row, idx % 2 === 1);
    row.getCell(2).numFmt = '#,##0.00';
    if (idx === 6) {
      row.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF065F46' } };
      row.getCell(2).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF065F46' } };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    }
  });

  autoFitColumns(wsSettlement);

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
    ['صافي الكاش المحصل بالدرج', Number(summaryData.physical_cash_in_drawer || summaryData.cash_drawer || 0), 'النقدية الفعلية المحصلة بالخزينة'],
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
    'قسم البضاعة',
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
    const genderLabel = item.gender === 'women' || item.gender === 'حريمي'
      ? 'حريمي'
      : (item.gender === 'both' || item.gender === 'مشترك' || item.gender === 'كلاهما' ? 'مشترك' : 'رجالي');

    totalQty += qty;
    totalRetail += retailVal;
    if (costVal !== null) totalCost += costVal;

    row.values = [
      sanitizeFormulaValue(String(item.id || '-')),
      sanitizeFormulaValue(item.name || '-'),
      genderLabel,
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
    row.getCell(8).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0';
    row.getCell(10).numFmt = '#,##0.00';
    if (cost !== null) row.getCell(11).numFmt = '#,##0.00';
    row.getCell(12).numFmt = '#,##0.00';
    if (costVal !== null) row.getCell(13).numFmt = '#,##0.00';
  });

  const totalRow = ws.getRow(7 + items.length);
  totalRow.values = [
    'الإجمالي',
    `عدد الأصناف: ${items.length}`,
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
  totalRow.getCell(8).numFmt = '#,##0';
  totalRow.getCell(12).numFmt = '#,##0.00';
  if (totalCost > 0) totalRow.getCell(13).numFmt = '#,##0.00';

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

async function generateSuppliersReportExcel(suppliersData, options = {}) {
  const wb = createBaseWorkbook('سجل الموردين والشركات');
  const ws = wb.addWorksheet('الموردين والحسابات');
  applyWorksheetStyles(ws, 'سجل الموردين والحسابات والأرصدة المستحقة', options);

  const items = Array.isArray(suppliersData) ? suppliersData : (suppliersData?.data || []);
  const totalBalance = Number(suppliersData?.total_balance || items.reduce((acc, s) => acc + Number(s.balance || 0), 0));
  const menBalance = Number(suppliersData?.total_men_balance || items.filter(s => s.gender_category === 'رجالي' || s.gender_category === 'men').reduce((acc, s) => acc + Number(s.balance || 0), 0));
  const womenBalance = Number(suppliersData?.total_women_balance || items.filter(s => s.gender_category === 'حريمي' || s.gender_category === 'women').reduce((acc, s) => acc + Number(s.balance || 0), 0));
  const bothBalance = Number(suppliersData?.total_both_balance || items.filter(s => s.gender_category === 'كلاهما' || s.gender_category === 'مشترك' || s.gender_category === 'both').reduce((acc, s) => acc + Number(s.balance || 0), 0));

  ws.mergeCells('A4:B4');
  ws.getCell('A4').value = `إجمالي الموردين: ${items.length} مورد`;
  ws.getCell('A4').font = { name: 'Arial', size: 10, bold: true };

  ws.mergeCells('C4:D4');
  ws.getCell('C4').value = `رصيد رجالي: ${menBalance.toLocaleString('en-US')} ج.م`;
  ws.getCell('C4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E40AF' } };

  ws.mergeCells('E4:F4');
  ws.getCell('E4').value = `رصيد حريمي: ${womenBalance.toLocaleString('en-US')} ج.م`;
  ws.getCell('E4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFE11D48' } };

  ws.mergeCells('G4:H4');
  ws.getCell('G4').value = `رصيد مشترك: ${bothBalance.toLocaleString('en-US')} ج.م`;
  ws.getCell('G4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF6B21A8' } };

  ws.mergeCells('I4:J4');
  ws.getCell('I4').value = formatMoneyLabel('إجمالي الرصيد المستحق', totalBalance);
  ws.getCell('I4').font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFDC2626' } };

  ws.getRow(4).height = 24;
  ws.getRow(5).height = 10;

  const headerRow = ws.getRow(6);
  headerRow.values = [
    'كود المورد',
    'اسم المورد',
    'الشركة / المصنع',
    'قسم المورد',
    'رقم الهاتف',
    'الهاتف الإضافي',
    'العنوان',
    'إجمالي المشتريات (ج.م)',
    'الرصيد المستحق (ج.م)',
    'تاريخ الإضافة',
    'ملاحظات'
  ];
  styleHeaderRow(headerRow);

  let totalPurchases = 0;
  items.forEach((s, idx) => {
    const row = ws.getRow(7 + idx);
    const purchases = Number(s.total_purchases || 0);
    const bal = Number(s.balance || 0);
    totalPurchases += purchases;

    let catLabel = 'رجالي';
    if (s.gender_category === 'حريمي' || s.gender_category === 'women') catLabel = 'حريمي';
    else if (s.gender_category === 'كلاهما' || s.gender_category === 'مشترك' || s.gender_category === 'both') catLabel = 'كلاهما';

    row.values = [
      s.code || s.id,
      s.name,
      s.company_name || s.company || '-',
      catLabel,
      s.phone || '-',
      s.extra_phone || '-',
      s.address || '-',
      purchases,
      bal,
      s.created_at ? new Date(s.created_at).toISOString().slice(0, 10) : '-',
      s.notes || '-'
    ];
    styleDataRow(row, idx % 2 === 1);
    row.getCell(8).numFmt = '#,##0.00';
    row.getCell(9).numFmt = '#,##0.00';
  });

  const totalRowIndex = 7 + items.length;
  const totalRow = ws.getRow(totalRowIndex);
  totalRow.values = [
    'الإجمالي',
    `عدد الموردين: ${items.length}`,
    '',
    '',
    '',
    '',
    '',
    totalPurchases,
    totalBalance,
    '',
    ''
  ];
  styleTotalRow(totalRow);
  totalRow.getCell(8).numFmt = '#,##0.00';
  totalRow.getCell(9).numFmt = '#,##0.00';

  autoFitColumns(ws);
  return wb.xlsx.writeBuffer();
}

/**
 * Generates the interactive 2-level Suppliers Ledger Excel workbook (File 1)
 * Level 1: 'ملخص حسابات الموردين' (Summary sheet with clickable links to each supplier sheet)
 * Level 2: Detailed statement per supplier with 11 columns, running cumulative balance, and BACK link
 */
async function generateSuppliersLedgerExcel(ledgerData, options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.lastModifiedBy = 'Elwazeer POS System';
  wb.created = new Date();

  const branchName = options.branchName || 'كافة الفروع';
  const period = options.period || 'كافة الفترات (تراكمي)';

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const grayHeaderBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // LEVEL 1: Summary Worksheet
  const summarySheetName = 'ملخص حسابات الموردين';
  const wsSummary = wb.addWorksheet(summarySheetName, { views: [{ rightToLeft: true }] });

  // Title Banner
  wsSummary.mergeCells('A1:J1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = `سجل وكشوف حسابات الموردين التراكمية - ${branchName}`;
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = darkBlueBg;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(1).height = 36;

  // Metadata row
  wsSummary.mergeCells('A2:J2');
  const metaCell = wsSummary.getCell('A2');
  metaCell.value = `نطاق الفرع: ${branchName}   |   الفترة: ${period}   |   تاريخ الاستخراج: ${formatCairoDateTime()}`;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
  metaCell.fill = lightPurpleBg;
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(2).height = 22;

  // Summary KPI Cards in row 3
  const summary = ledgerData.summary || {};
  wsSummary.mergeCells('A3:B3');
  wsSummary.getCell('A3').value = `عدد الموردين: ${summary.total_suppliers || (ledgerData.suppliers || []).length}`;
  wsSummary.mergeCells('C3:D3');
  wsSummary.getCell('C3').value = `إجمالي المشتريات: ${Number(summary.grand_total_purchases || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
  wsSummary.mergeCells('E3:F3');
  wsSummary.getCell('E3').value = `إجمالي المرتجعات: ${Number(summary.grand_total_returns || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
  wsSummary.mergeCells('G3:H3');
  wsSummary.getCell('G3').value = `إجمالي المسدد: ${Number(summary.grand_total_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
  wsSummary.mergeCells('I3:J3');
  const bal = Number(summary.grand_total_balance || 0);
  wsSummary.getCell('I3').value = `صافي الرصيد المستحق: ${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (${summary.grand_total_balance_type || (bal > 0 ? 'له' : (bal < 0 ? 'عليه' : 'خالص'))})`;

  ['A3', 'C3', 'E3', 'G3', 'I3'].forEach(cellRef => {
    const c = wsSummary.getCell(cellRef);
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  wsSummary.getRow(3).height = 26;

  // Header Row (Row 5)
  const headerRow = wsSummary.getRow(5);
  headerRow.height = 28;
  headerRow.values = [
    'كود المورد',
    'اسم المورد',
    'رقم الهاتف',
    'التصنيف',
    'إجمالي المشتريات (ج.م)',
    'إجمالي المرتجعات (ج.م)',
    'إجمالي المسدد (ج.م)',
    'صافي الرصيد المستحق (ج.م)',
    'حالة الرصيد',
    'كشف الحساب التفصيلي'
  ];
  headerRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = grayHeaderBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });

  const suppliers = ledgerData.suppliers || [];
  const supplierSheetNameMap = new Map();

  // Pre-calculate valid unique sheet names for each supplier (strict <=31 chars, case-insensitive uniqueness)
  const usedNamesLower = new Set([summarySheetName.toLowerCase()]);
  suppliers.forEach((sup) => {
    let clean = String(sup.name || `مورد_${sup.id}`)
      .replace(/[\\/?*[\]:']/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) clean = `مورد_${sup.id}`;

    // Base name trimmed to at most 24 characters to guarantee room for suffix
    let base = clean.length > 24 ? clean.slice(0, 24).trim() : clean;
    if (!base) base = 'مورد';

    let candidate = base.slice(0, 31).trim();
    const idStr = String(sup.id || '');

    // If collision, try with id suffix within strict 31 char limit
    if (usedNamesLower.has(candidate.toLowerCase())) {
      const maxBaseLen = Math.max(1, 30 - idStr.length);
      candidate = `${base.slice(0, maxBaseLen)}_${idStr}`.slice(0, 31).trim();
    }

    // If still collision, increment counter until unique
    let counter = 2;
    while (usedNamesLower.has(candidate.toLowerCase())) {
      const suffix = `_${counter}`;
      const maxBaseLen = Math.max(1, 31 - suffix.length);
      candidate = `${base.slice(0, maxBaseLen)}${suffix}`.slice(0, 31).trim();
      counter++;
    }

    usedNamesLower.add(candidate.toLowerCase());
    supplierSheetNameMap.set(sup.id, candidate);
  });

  // Populate Level 1 summary rows
  suppliers.forEach((sup, idx) => {
    const rowIdx = 6 + idx;
    const r = wsSummary.getRow(rowIdx);
    r.height = 22;

    const sheetName = supplierSheetNameMap.get(sup.id);
    const balance = Number(sup.balance || 0);

    r.values = [
      sanitizeFormulaValue(sup.code || `-`),
      sanitizeFormulaValue(sup.name || '-'),
      sanitizeFormulaValue(sup.phone || '-'),
      sup.gender_category === 'men' ? 'رجالي' : (sup.gender_category === 'women' ? 'حريمي' : (sup.gender_category === 'both' ? 'مشترك' : (sup.gender_category || '-'))),
      Number(sup.total_purchases || 0),
      Number(sup.total_returns || 0),
      Number(sup.total_paid || 0),
      balance,
      sup.balance_type || (balance > 0 ? 'دائن (له)' : (balance < 0 ? 'مدين (عليه)' : 'خالص')),
      '',
    ];

    // Clickable Hyperlink to Level 2 detailed sheet
    const linkCell = r.getCell(10);
    linkCell.value = {
      text: '🔍 فتح كشف الحساب',
      hyperlink: `#'${sheetName}'!A1`
    };
    linkCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF2563EB' }, underline: true };

    for (let c = 1; c <= 9; c++) {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      if ([5, 6, 7, 8].includes(c)) {
        cell.numFmt = '#,##0.00';
      }
    }
    linkCell.alignment = { horizontal: 'center', vertical: 'middle' };
    linkCell.border = thinBorder;
  });

  // Level 1 Total Row
  const totalRowIdx = 6 + suppliers.length;
  const totRow = wsSummary.getRow(totalRowIdx);
  totRow.height = 26;
  totRow.getCell(2).value = 'الإجمالي العام لكافة الموردين';
  if (suppliers.length > 0) {
    totRow.getCell(5).value = { formula: `SUM(E6:E${totalRowIdx - 1})`, result: Number(summary.grand_total_purchases || 0) };
    totRow.getCell(6).value = { formula: `SUM(F6:F${totalRowIdx - 1})`, result: Number(summary.grand_total_returns || 0) };
    totRow.getCell(7).value = { formula: `SUM(G6:G${totalRowIdx - 1})`, result: Number(summary.grand_total_paid || 0) };
    totRow.getCell(8).value = { formula: `SUM(H6:H${totalRowIdx - 1})`, result: Number(summary.grand_total_balance || 0) };
  } else {
    totRow.getCell(5).value = Number(summary.grand_total_purchases || 0);
    totRow.getCell(6).value = Number(summary.grand_total_returns || 0);
    totRow.getCell(7).value = Number(summary.grand_total_paid || 0);
    totRow.getCell(8).value = Number(summary.grand_total_balance || 0);
  }
  totRow.getCell(9).value = summary.grand_total_balance_type || '-';

  for (let c = 1; c <= 10; c++) {
    const cell = totRow.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    if ([5, 6, 7, 8].includes(c)) cell.numFmt = '#,##0.00';
  }

  wsSummary.columns = [
    { width: 14 }, { width: 30 }, { width: 16 }, { width: 14 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 },
    { width: 16 }, { width: 20 }
  ];

  // LEVEL 2: Detailed Statement Worksheet per Supplier
  suppliers.forEach(sup => {
    const sheetName = supplierSheetNameMap.get(sup.id);
    const wsSup = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

    // Row 1 Title Banner
    wsSup.mergeCells('A1:K1');
    const supTitle = wsSup.getCell('A1');
    supTitle.value = `كشف حساب تفصيلي - ${sup.name} (${sup.code || 'بدون كود'})`;
    supTitle.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    supTitle.fill = darkBlueBg;
    supTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    wsSup.getRow(1).height = 34;

    // Row 2: BACK button hyperlink
    wsSup.mergeCells('A2:C2');
    const backCell = wsSup.getCell('A2');
    backCell.value = {
      text: '🔙 رجوع إلى ملخص الموردين (BACK)',
      hyperlink: `#'${summarySheetName}'!A1`
    };
    backCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1D4ED8' }, underline: true };
    backCell.alignment = { horizontal: 'center', vertical: 'middle' };
    backCell.fill = lightPurpleBg;

    wsSup.mergeCells('D2:K2');
    const subMetaCell = wsSup.getCell('D2');
    subMetaCell.value = `الهاتف: ${sup.phone || '-'}   |   العنوان: ${sup.address || '-'}   |   نطاق الفرع: ${branchName}   |   الفترة: ${period}`;
    subMetaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    subMetaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subMetaCell.fill = lightPurpleBg;
    wsSup.getRow(2).height = 24;

    // Row 3: KPI summary for this supplier
    wsSup.mergeCells('A3:B3');
    wsSup.getCell('A3').value = `إجمالي التوريدات: ${Number(sup.total_purchases || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
    wsSup.mergeCells('C3:D3');
    wsSup.getCell('C3').value = `إجمالي المرتجعات: ${Number(sup.total_returns || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
    wsSup.mergeCells('E3:F3');
    wsSup.getCell('E3').value = `إجمالي المسدد: ${Number(sup.total_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
    wsSup.mergeCells('G3:K3');
    const sBal = Number(sup.balance || 0);
    wsSup.getCell('G3').value = `الرصيد النهائي المستحق: ${sBal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (${sup.balance_type || (sBal > 0 ? 'له' : (sBal < 0 ? 'عليه' : 'خالص'))})`;

    ['A3', 'C3', 'E3', 'G3'].forEach(cRef => {
      const c = wsSup.getCell(cRef);
      c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    wsSup.getRow(3).height = 26;

    // Row 5: Detailed Headers (11 columns)
    const dtHeader = wsSup.getRow(5);
    dtHeader.height = 28;
    dtHeader.values = [
      'التاريخ والوقت',
      'نوع الحركة',
      'رقم الإذن / المرجع',
      'اسم الصنف / البيان',
      'الكمية',
      'سعر الوحدة',
      'مشتريات / مدين (ج.م)',
      'مرتجع / دائن (ج.م)',
      'مدفوعات / دائن (ج.م)',
      'صافي حركة السند (ج.م)',
      'الرصيد التراكمي (ج.م)'
    ];
    dtHeader.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = grayHeaderBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });

    const txList = sup.transactions || [];
    let runningCalc = 0;
    txList.forEach((tx, tIdx) => {
      const rIdx = 6 + tIdx;
      const r = wsSup.getRow(rIdx);
      r.height = 22;

      const movement = Number(tx.movement || 0);
      runningCalc = Math.round((runningCalc + movement) * 100) / 100;

      let typeArabic = 'توريد بضاعة';
      if (tx.transaction_type === 'payment' || tx.type === 'payment') typeArabic = 'سداد دفعة';
      else if (tx.transaction_type === 'return' || tx.type === 'return') typeArabic = 'مرتجع بضاعة';
      else if (tx.transaction_type === 'purchase' || tx.type === 'supply') typeArabic = 'توريد مشتريات';

      r.values = [
        tx.date || (tx.created_at ? String(tx.created_at).slice(0, 10) : '-'),
        typeArabic,
        sanitizeFormulaValue(tx.reference_no || '-'),
        sanitizeFormulaValue(tx.description || tx.notes || '-'),
        tx.quantity !== null && tx.quantity !== undefined ? Number(tx.quantity) : '',
        tx.price !== null && tx.price !== undefined ? Number(tx.price) : '',
        Number(tx.purchases || 0),
        Number(tx.returns || 0),
        Number(tx.payments || 0),
        movement,
        runningCalc,
      ];

      for (let c = 1; c <= 11; c++) {
        const cell = r.getCell(c);
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: c === 4 ? 'right' : 'center', vertical: 'middle' };
        cell.border = thinBorder;
        if (tIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        if ([7, 8, 9, 10, 11].includes(c)) {
          cell.numFmt = '#,##0.00';
        }
        if (c === 6 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      }
    });

    // Detailed Statement Total Row
    const supTotIdx = 6 + txList.length;
    const sTotRow = wsSup.getRow(supTotIdx);
    sTotRow.height = 26;
    sTotRow.getCell(4).value = 'الإجمالي / رصيد كشف الحساب';
    if (txList.length > 0) {
      sTotRow.getCell(7).value = { formula: `SUM(G6:G${supTotIdx - 1})`, result: Number(sup.total_purchases || 0) };
      sTotRow.getCell(8).value = { formula: `SUM(H6:H${supTotIdx - 1})`, result: Number(sup.total_returns || 0) };
      sTotRow.getCell(9).value = { formula: `SUM(I6:I${supTotIdx - 1})`, result: Number(sup.total_paid || 0) };
      sTotRow.getCell(10).value = { formula: `SUM(J6:J${supTotIdx - 1})`, result: Number(sup.balance || 0) };
      sTotRow.getCell(11).value = { formula: `K${supTotIdx - 1}`, result: runningCalc };
    } else {
      sTotRow.getCell(7).value = Number(sup.total_purchases || 0);
      sTotRow.getCell(8).value = Number(sup.total_returns || 0);
      sTotRow.getCell(9).value = Number(sup.total_paid || 0);
      sTotRow.getCell(10).value = Number(sup.balance || 0);
      sTotRow.getCell(11).value = Number(sup.balance || 0);
    }

    for (let c = 1; c <= 11; c++) {
      const cell = sTotRow.getCell(c);
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = { horizontal: c === 4 ? 'right' : 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      if ([7, 8, 9, 10, 11].includes(c)) cell.numFmt = '#,##0.00';
    }

    wsSup.columns = [
      { width: 14 }, { width: 16 }, { width: 18 }, { width: 32 },
      { width: 10 }, { width: 12 }, { width: 18 }, { width: 18 },
      { width: 18 }, { width: 18 }, { width: 22 }
    ];
  });

  return wb.xlsx.writeBuffer();
}

/**
 * Generates single supplier detailed statement Excel workbook
 */
async function generateSupplierStatementExcel(statementData, options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.lastModifiedBy = 'Elwazeer POS System';
  wb.created = new Date();

  const branchName = options.branchName || 'كافة الفروع';
  const period = options.period || 'كافة الفترات (تراكمي)';
  const sup = statementData.supplier || {};

  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const grayHeaderBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  const ws = wb.addWorksheet('كشف الحساب', { views: [{ rightToLeft: true }] });

  // Row 1 Title Banner
  ws.mergeCells('A1:K1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `كشف حساب تفصيلي للمورد - ${sup.name || ''} (${sup.code || 'بدون كود'})`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = darkBlueBg;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // Row 2 Metadata
  ws.mergeCells('A2:K2');
  const metaCell = ws.getCell('A2');
  metaCell.value = `الهاتف: ${sup.phone || '-'}   |   العنوان: ${sup.address || '-'}   |   الفرع: ${branchName}   |   الفترة: ${period}   |   تاريخ الاستخراج: ${formatCairoDateTime()}`;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  metaCell.fill = lightPurpleBg;
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // Row 3 Summary KPIs
  ws.mergeCells('A3:B3');
  ws.getCell('A3').value = `إجمالي المشتريات: ${Number(sup.total_purchases || statementData.summary?.total_purchases || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
  ws.mergeCells('C3:D3');
  ws.getCell('C3').value = `إجمالي المرتجعات: ${Number(sup.total_returns || statementData.summary?.total_returns || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
  ws.mergeCells('E3:F3');
  ws.getCell('E3').value = `إجمالي المسدد: ${Number(sup.total_paid || statementData.summary?.total_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
  ws.mergeCells('G3:K3');
  const bal = Number(sup.balance ?? statementData.summary?.balance ?? 0);
  ws.getCell('G3').value = `الرصيد المستحق: ${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (${sup.balance_type || statementData.summary?.balance_type || (bal > 0 ? 'له' : (bal < 0 ? 'عليه' : 'خالص'))})`;

  ['A3', 'C3', 'E3', 'G3'].forEach(cRef => {
    const c = ws.getCell(cRef);
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(3).height = 26;

  // Row 5 Header Row (11 columns)
  const dtHeader = ws.getRow(5);
  dtHeader.height = 28;
  dtHeader.values = [
    'التاريخ والوقت',
    'نوع الحركة',
    'رقم الإذن / المرجع',
    'اسم الصنف / البيان',
    'الكمية',
    'سعر الوحدة',
    'مشتريات / مدين (ج.م)',
    'مرتجع / دائن (ج.م)',
    'مدفوعات / دائن (ج.م)',
    'صافي حركة السند (ج.م)',
    'الرصيد التراكمي (ج.م)'
  ];
  dtHeader.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = grayHeaderBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  const txList = statementData.transactions || [];
  let runningCalc = 0;
  txList.forEach((tx, tIdx) => {
    const rIdx = 6 + tIdx;
    const r = ws.getRow(rIdx);
    r.height = 22;

    const movement = Number(tx.movement || 0);
    runningCalc = Math.round((runningCalc + movement) * 100) / 100;

    let typeArabic = 'توريد بضاعة';
    if (tx.transaction_type === 'payment' || tx.type === 'payment') typeArabic = 'سداد دفعة';
    else if (tx.transaction_type === 'return' || tx.type === 'return') typeArabic = 'مرتجع بضاعة';
    else if (tx.transaction_type === 'purchase' || tx.type === 'supply') typeArabic = 'توريد مشتريات';

    r.values = [
      tx.date || (tx.created_at ? String(tx.created_at).slice(0, 10) : '-'),
      typeArabic,
      sanitizeFormulaValue(tx.reference_no || '-'),
      sanitizeFormulaValue(tx.description || tx.notes || '-'),
      tx.quantity !== null && tx.quantity !== undefined ? Number(tx.quantity) : '',
      tx.price !== null && tx.price !== undefined ? Number(tx.price) : '',
      Number(tx.purchases || 0),
      Number(tx.returns || 0),
      Number(tx.payments || 0),
      movement,
      runningCalc,
    ];

    for (let c = 1; c <= 11; c++) {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: c === 4 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
      if (tIdx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      if ([7, 8, 9, 10, 11].includes(c)) {
        cell.numFmt = '#,##0.00';
      }
      if (c === 6 && typeof cell.value === 'number') {
        cell.numFmt = '#,##0.00';
      }
    }
  });

  const totIdx = 6 + txList.length;
  const totRow = ws.getRow(totIdx);
  totRow.height = 26;
  totRow.getCell(4).value = 'الإجمالي / رصيد كشف الحساب';
  if (txList.length > 0) {
    totRow.getCell(7).value = { formula: `SUM(G6:G${totIdx - 1})`, result: Number(sup.total_purchases || 0) };
    totRow.getCell(8).value = { formula: `SUM(H6:H${totIdx - 1})`, result: Number(sup.total_returns || 0) };
    totRow.getCell(9).value = { formula: `SUM(I6:I${totIdx - 1})`, result: Number(sup.total_paid || 0) };
    totRow.getCell(10).value = { formula: `SUM(J6:J${totIdx - 1})`, result: Number(sup.balance || 0) };
    totRow.getCell(11).value = { formula: `K${totIdx - 1}`, result: runningCalc };
  } else {
    totRow.getCell(7).value = Number(sup.total_purchases || 0);
    totRow.getCell(8).value = Number(sup.total_returns || 0);
    totRow.getCell(9).value = Number(sup.total_paid || 0);
    totRow.getCell(10).value = Number(sup.balance || 0);
    totRow.getCell(11).value = Number(sup.balance || 0);
  }

  for (let c = 1; c <= 11; c++) {
    const cell = totRow.getCell(c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { horizontal: c === 4 ? 'right' : 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    if ([7, 8, 9, 10, 11].includes(c)) cell.numFmt = '#,##0.00';
  }

  ws.columns = [
    { width: 14 }, { width: 16 }, { width: 18 }, { width: 32 },
    { width: 10 }, { width: 12 }, { width: 18 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 22 }
  ];

  return wb.xlsx.writeBuffer();
}

/**
 * Shared helper to build M${monthNum} worksheet tracking categorized expenses and daily drawer cash
 */
function buildMWorksheet(ws, daysData, monthNum, year, branding = {}) {
  ws.state = 'hidden';
  ws.views = [{ rightToLeft: true }];

  // Column headers matching reference workbook
  const headers = [
    null,
    'تاريخ المصروف', 'بيان المصروف', 'مبلغ المصروف',
    'تاريخ انستا باي', 'بيان انستا', 'مبلغ انستا',
    'تاريخ فودافون كاش', 'بيان فودافون', 'مبلغ فودافون',
    'تاريخ فيزا', 'بيان فيزا', 'مبلغ فيزا',
    'تاريخ مرتجع', 'بيان مرتجع', 'مبلغ مرتجع',
    'تاريخ مكسرات', 'بيان مكسرات', 'مبلغ مكسرات',
    'تاريخ مكافئات', 'بيان مكافئات', 'مبلغ مكافئات',
    'تاريخ ضيافة', 'بيان ضيافة', 'مبلغ ضيافة',
    null,
    'التاريخ',
    'اجمالي اليوم - بدون فيزا وانستا وفودافون ومرتجع'
  ];
  const r1 = ws.getRow(1);
  r1.values = headers;

  daysData.forEach((dayItem, idx) => {
    const rIdx = 2 + idx;
    const r = ws.getRow(rIdx);
    r.getCell(26).value = dayItem.date;
    const netCash = Number(dayItem.data?.summary?.cash_in_drawer ?? (Number(dayItem.data?.summary?.total_paid || 0) - Number(dayItem.data?.summary?.total_deductions || 0)));
    r.getCell(27).value = netCash;
  });

  const totRowIdx = 2 + daysData.length;
  const totRow = ws.getRow(totRowIdx);
  totRow.getCell(26).value = 'الاجمالي الكلي';
  totRow.getCell(27).value = { formula: `SUM(AA2:AA${totRowIdx - 1})` };
}

/**
 * Shared helper to build SALARY worksheet layout matching reference workbook
 */
function buildSalaryWorksheet(salWs, salaryData, branding = {}, month = '', isConsolidated = true) {
  salWs.views = [{ rightToLeft: true }];
  const isAll = Boolean(branding.isAll || branding.cleanName === 'كل الفروع' || branding.branchName === 'كل الفروع' || branding.branchId === 'all');
  const rawBranchName = branding.cleanName || branding.branchName || (isAll ? 'كل الفروع' : 'الرمل');
  const cleanName = isAll ? 'كل الفروع' : getBranchCleanName(rawBranchName);
  const branchDisplayName = isAll ? 'كل الفروع' : (cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`);
  const displayTitle = isAll ? 'مرتبات كل الفروع' : (branding.titles?.salary || `مرتبات ${branchDisplayName}`);

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  salWs.columns = [
    { width: 5 },   // A: spacer
    { width: 28 },  // B: الاسم
    { width: 16 },  // C: الساعات المحققه
    { width: 16 },  // D: الساعات المطلوبه
    { width: 14 },  // E: تاخيرات
    { width: 16 },  // F: خصومات التاخيرات
    { width: 14 },  // G: اوفر تايم
    { width: 16 },  // H: مبلغ الاوفر تايم
    { width: 16 },  // I: الراتب
    { width: 14 },  // J: اليوميه
    { width: 18 },  // K: الراتب بعد البدلات
    { width: 14 },  // L: ايام العمل
    { width: 16 },  // M: بدل مواصلات
    { width: 14 },  // N: بدلات
    { width: 20 },  // O: البيان
    { width: 14 },  // P: المبلغ
    { width: 16 },  // Q: السلف
    { width: 12 },  // R: غياب
    { width: 16 },  // S: المبلغ
    { width: 12 },  // T: اجازات
    { width: 16 },  // U: المبلغ
    { width: 12 },  // V: نص يوم
    { width: 16 },  // W: المبلغ
    { width: 16 },  // X: سوالب قديمه
    { width: 20 },  // Y: القبض
    { width: 5 },   // Z: spacer
    { width: 16 },  // AA: ديون خارجيه
  ];

  // Title Row 2 (Merged D2:W2)
  salWs.mergeCells('D2:W2');
  const tCell = salWs.getCell('D2');
  tCell.value = displayTitle;
  tCell.font = { name: 'Calibri', size: 22, bold: true };
  tCell.fill = lightPurpleBg;
  tCell.alignment = { horizontal: 'center', vertical: 'middle' };
  salWs.getRow(2).height = 40;

  // Header Row 4
  const sRow4 = salWs.getRow(4);
  sRow4.height = 32;
  const salHeaders = [
    null,
    'الاسم',
    'الساعات المحققه',
    'الساعات المطلوبه',
    'تاخيرات',
    'خصومات التاخيرات',
    'اوفر تايم',
    'مبلغ الاوفر تايم',
    'الراتب',
    'اليوميه',
    'الراتب بعد البدلات',
    'ايام العمل',
    'بدل مواصلات',
    'بدلات',
    'البيان',
    'المبلغ',
    'السلف',
    'غياب',
    'المبلغ',
    'اجازات',
    'المبلغ',
    'نص يوم',
    'المبلغ',
    'سوالب قديمه',
    'القبض',
    null,
    'ديون خارجيه'
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

  const employees = salaryData.employees || [];
  employees.forEach((emp, idx) => {
    const rIdx = 5 + idx;
    const r = salWs.getRow(rIdx);
    r.height = 26;

    r.getCell(2).value = emp.employee_name;
    if (isConsolidated) {
      r.getCell(3).value = { formula: `SUMIF('MASTER SHEET'!P:P, B${rIdx}, 'MASTER SHEET'!S:S)`, result: (emp.actual_hours || 0) / 24 };
      r.getCell(3).numFmt = '[h]:mm';
    } else {
      r.getCell(3).value = Number(emp.actual_hours || 0);
      r.getCell(3).numFmt = '#,##0.00';
    }

    r.getCell(4).value = Number(emp.required_hours || 268);
    r.getCell(5).value = { formula: `IF(C${rIdx}*24<D${rIdx},C${rIdx}*24-D${rIdx},0)`, result: emp.delay_hours > 0 ? -emp.delay_hours : 0 };
    r.getCell(6).value = emp.delay_deduction || '';
    r.getCell(7).value = { formula: `IF(C${rIdx}>D${rIdx}/24,C${rIdx}-D${rIdx}/24,0)`, result: (emp.overtime_hours || 0) / 24 };
    r.getCell(7).numFmt = '[h]:mm';
    r.getCell(8).value = { formula: `((J${rIdx}/10)*1.35)*(G${rIdx}*24)`, result: Number(emp.overtime_amount || 0) };
    r.getCell(8).numFmt = '#,##0.00';
    r.getCell(9).value = Number(emp.basic_salary || 0);
    r.getCell(10).value = { formula: `I${rIdx}/30`, result: Number(emp.daily_rate || 0) };
    r.getCell(10).numFmt = '#,##0.00';
    r.getCell(11).value = { formula: `J${rIdx}*L${rIdx}+H${rIdx}+M${rIdx}+N${rIdx}`, result: Number(emp.gross_salary || 0) };
    r.getCell(11).numFmt = '#,##0.00';
    r.getCell(12).value = Number(emp.work_days || 30);
    r.getCell(13).value = emp.transportation_allowance || '';
    r.getCell(14).value = emp.allowances || '';
    r.getCell(15).value = '';
    r.getCell(16).value = '';

    if (isConsolidated) {
      r.getCell(17).value = { formula: `SUMIF('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!J:J)`, result: Number(emp.advances || 0) };
      r.getCell(17).numFmt = '#,##0.00';
      r.getCell(18).value = { formula: `COUNTIFS('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!T:T, "*غياب*")`, result: Number(emp.absent_days || 0) };
      r.getCell(19).value = { formula: `R${rIdx} * J${rIdx} * 2`, result: Number(emp.absent_deduction || 0) };
      r.getCell(19).numFmt = '#,##0.00';
      r.getCell(20).value = { formula: `COUNTIFS('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!T:T, "*جاز*")`, result: Number(emp.leave_days || 0) };
      r.getCell(21).value = { formula: `IF(T${rIdx} > 4, (T${rIdx} - 4) * J${rIdx}, 0)`, result: Number(emp.leave_deduction || 0) };
      r.getCell(21).numFmt = '#,##0.00';
      r.getCell(22).value = { formula: `COUNTIFS('MASTER SHEET'!I:I, B${rIdx}, 'MASTER SHEET'!T:T, "*نص يوم*")`, result: Number(emp.half_days || 0) };
      r.getCell(23).value = { formula: `V${rIdx} * (J${rIdx} / 2)`, result: Number(emp.half_day_deduction || 0) };
      r.getCell(23).numFmt = '#,##0.00';
    } else {
      r.getCell(17).value = Number(emp.advances || 0);
      r.getCell(17).numFmt = '#,##0.00';
      r.getCell(18).value = Number(emp.absent_days || 0);
      r.getCell(19).value = { formula: `R${rIdx} * J${rIdx} * 2`, result: Number(emp.absent_deduction || 0) };
      r.getCell(19).numFmt = '#,##0.00';
      r.getCell(20).value = Number(emp.leave_days || 0);
      r.getCell(21).value = { formula: `IF(T${rIdx} > 4, (T${rIdx} - 4) * J${rIdx}, 0)`, result: Number(emp.leave_deduction || 0) };
      r.getCell(21).numFmt = '#,##0.00';
      r.getCell(22).value = Number(emp.half_days || 0);
      r.getCell(23).value = { formula: `V${rIdx} * (J${rIdx} / 2)`, result: Number(emp.half_day_deduction || 0) };
      r.getCell(23).numFmt = '#,##0.00';
    }

    r.getCell(24).value = emp.old_debts || '';
    r.getCell(25).value = { formula: `K${rIdx}-P${rIdx}-Q${rIdx}-S${rIdx}-U${rIdx}-W${rIdx}-F${rIdx}-X${rIdx}`, result: Number(emp.net_salary || 0) };
    r.getCell(25).numFmt = '#,##0.00';
    r.getCell(27).value = emp.external_debts || '';

    r.eachCell(c => {
      c.font = { name: 'Calibri', size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = thinBorder;
    });
  });

  if (employees.length > 0) {
    const totRowIdx = 5 + employees.length;
    const totRow = salWs.getRow(totRowIdx);
    totRow.height = 30;
    totRow.getCell(2).value = 'الإجمالي';
    totRow.getCell(2).font = { name: 'Calibri', size: 12, bold: true };
    totRow.getCell(2).fill = lightPurpleBg;
    totRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    totRow.getCell(2).border = thinBorder;

    const sumCols = [8, 9, 11, 17, 19, 21, 23, 25];
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
}

/**
 * Shared helper to build KPI worksheet layout matching reference workbook
 */
function buildKpiWorksheet(kpiWs, kpiData, branding = {}, dailySheetNames = []) {
  kpiWs.views = [{ rightToLeft: true }];
  const isAll = Boolean(branding.isAll || branding.cleanName === 'كل الفروع' || branding.branchName === 'كل الفروع' || branding.branchId === 'all');
  const rawBranchName = branding.cleanName || branding.branchName || (isAll ? 'كل الفروع' : 'الرمل');
  const cleanName = isAll ? 'كل الفروع' : getBranchCleanName(rawBranchName);
  const branchDisplayName = isAll ? 'كل الفروع' : (cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`);
  const displayTitle = isAll ? 'تقييم وأداء البائعين - كل الفروع' : (branding.titles?.kpi || `تقييم وأداء البائعين - ${branchDisplayName}`);

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

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
  kpiWs.getCell('D2').value = displayTitle;
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

  const sellers = kpiData.sellers || [];
  sellers.forEach((seller, idx) => {
    const rIdx = 4 + idx;
    const r = kpiWs.getRow(rIdx);
    r.height = 26;

    const sumifFormula = dailySheetNames.length > 0
      ? `SUM(${dailySheetNames.map(s => `SUMIF('${s}'!G:G, D${rIdx}, '${s}'!D:D)`).join(',')})`
      : '0';

    r.getCell(4).value = seller.seller_name;
    r.getCell(5).value = { formula: sumifFormula, result: Number(seller.total_sales || 0) };
    r.getCell(5).numFmt = '#,##0.00';
    r.getCell(6).value = Number(seller.target || 0);
    r.getCell(6).numFmt = '#,##0.00';
    r.getCell(7).value = { formula: `IF(F${rIdx}>0, E${rIdx}/F${rIdx}, 0)`, result: (Number(seller.achievement_percentage || 0) / 100) };
    r.getCell(7).numFmt = '0.0%';

    [4, 5, 6, 7].forEach(c => {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  });

  if (sellers.length > 0) {
    const totalRowIdx = 4 + sellers.length;
    const totRow = kpiWs.getRow(totalRowIdx);
    totRow.height = 28;
    totRow.getCell(4).value = 'الإجمالي';
    totRow.getCell(5).value = { formula: `SUM(E4:E${totalRowIdx - 1})`, result: Number(kpiData.summary?.total_sales || 0) };
    totRow.getCell(5).numFmt = '#,##0.00';
    totRow.getCell(6).value = { formula: `SUM(F4:F${totalRowIdx - 1})`, result: sellers.reduce((sum, s) => sum + Number(s.target || 0), 0) };
    totRow.getCell(6).numFmt = '#,##0.00';
    totRow.getCell(7).value = { formula: `IF(F${totalRowIdx}>0, E${totalRowIdx}/F${totalRowIdx}, 0)`, result: (Number(kpiData.summary?.average_achievement || 0) / 100) };
    totRow.getCell(7).numFmt = '0.0%';

    [4, 5, 6, 7].forEach(c => {
      const cell = totRow.getCell(c);
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.fill = lightPurpleBg;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  }
}

/**
 * Builds the consolidated MASTER SHEET stacking all days of the month (76 rows per day)
 */
function buildMasterSheetWorksheet(masterWs, daysData, branding = {}) {
  masterWs.views = [{ rightToLeft: true }];
  const isAll = Boolean(branding.isAll || branding.cleanName === 'كل الفروع' || branding.branchName === 'كل الفروع' || branding.branchId === 'all');
  const rawBranchName = branding.cleanName || branding.branchName || (isAll ? 'كل الفروع' : 'الرمل');
  const cleanName = isAll ? 'كل الفروع' : getBranchCleanName(rawBranchName);
  const branchDisplayName = isAll ? 'كل الفروع' : (cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`);

  let displayTitle = '';
  if (isAll) {
    displayTitle = 'كل الفروع';
  } else if (branding.titles?.master && typeof branding.titles.master === 'string') {
    let cleanedTitle = branding.titles.master
      .replace(/^التقرير\s+الشهري\s+المجمع\s+لبيبيون\s+/gi, '')
      .replace(/^التقرير\s+المجمع\s+لبيبيون\s+/gi, '')
      .replace(/^التقرير\s+اليومي\s+لبيبيون(\s*[-–]\s*)?/gi, '')
      .replace(/^التقرير\s+اليومي(\s*[-–]\s*)?/gi, '')
      .replace(/^بيبيون\s+للبدل\s+الرجالي(\s*[-–]\s*)?/gi, '')
      .replace(/^بيبيون\s+فرع\s+/gi, 'فرع ')
      .replace(/^بيبيون\s+/gi, '')
      .trim();
    if (!cleanedTitle || cleanedTitle === 'كل الفروع' || cleanedTitle === 'كافة الفروع') {
      displayTitle = isAll ? 'كل الفروع' : branchDisplayName;
    } else {
      displayTitle = cleanedTitle.startsWith('فرع') ? cleanedTitle : `فرع ${cleanedTitle}`;
    }
  } else {
    displayTitle = branchDisplayName;
  }

  const lightPurpleBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAD8F0' } };
  const darkBlueBg = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  masterWs.columns = [
    { width: 14.14 }, // A: التاريخ
    { width: 15.29 }, // B: رقم الفاتورة
    { width: 64.43 }, // C: البيان 
    { width: 17.00 }, // D: الأجمالي
    { width: 16.00 }, // E: المدفوع 
    { width: 14.86 }, // F: الباقي
    { width: 18.57 }, // G: أسم البائع
    { width: 16.71 }, // H: تاريخ الأستلام
    { width: 23.29 }, // I: الموظف
    { width: 18.00 }, // J: السلف
    { width: 23.86 }, // K: مصروفات آخرى
    { width: 14.14 }, // L: المبلغ
    { width: 24.00 }, // M: نوع الدفع الإلكتروني
    { width: 24.57 }, // N: رقم المرجع / الفاتورة
    { width: 19.71 }, // O: المبلغ الإلكتروني
    { width: 20.43 }, // P: أسماء الموظفين 
    { width: 15.86 }, // Q: وقت الحضور 
    { width: 18.86 }, // R: وقت الانصراف
    { width: 16.14 }, // S: عداد الساعات
    { width: 21.57 }  // T: ملاحظات
  ];

  // Row 1: Title & Logo (Anchored strictly inside Row 1: A1:B1 logo, C1:T1 title)
  masterWs.mergeCells('A1:B1');
  masterWs.mergeCells('C1:T1');

  // Format A1:B1 (Logo container matching reference banner styling)
  const logoCellA = masterWs.getCell('A1');
  const logoCellB = masterWs.getCell('B1');
  [logoCellA, logoCellB].forEach(cell => {
    cell.fill = bannerBg;
    cell.border = thinBorder;
  });

  // Format C1:T1 (Title banner matching reference styling)
  const titleCell = masterWs.getCell('C1');
  titleCell.value = displayTitle;
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.fill = bannerBg;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  for (let c = 3; c <= 20; c++) {
    const cell = masterWs.getRow(1).getCell(c);
    cell.fill = bannerBg;
    cell.border = thinBorder;
  }
  masterWs.getRow(1).height = 69;

  const masterLogo = branding.logo || getBranchLogoAsset();
  if (masterLogo?.buffer && masterWs.workbook) {
    try {
      const imgId = masterWs.workbook.addImage({
        buffer: masterLogo.buffer,
        extension: masterLogo.extension || 'png',
      });
      // Anchored strictly inside Row 1 with clean margins to prevent any bleed into Row 2 headers
      masterWs.addImage(imgId, {
        tl: { col: 0.15, row: 0.08 },
        br: { col: 1.85, row: 0.90 },
        editAs: 'oneCell',
      });
    } catch {
      // safe fallback
    }
  }

  // Row 2: 20 Headers
  const hRow = masterWs.getRow(2);
  hRow.height = 28;
  hRow.values = [
    'التاريخ', 'رقم الفاتورة', 'البيان ', 'الأجمالي', 'المدفوع ', 'الباقي',
    'أسم البائع', 'تاريخ الأستلام', 'الموظف', 'السلف', 'مصروفات آخرى', 'المبلغ',
    'نوع الدفع الإلكتروني', 'رقم المرجع / الفاتورة', 'المبلغ الإلكتروني',
    'أسماء الموظفين ', 'وقت الحضور ', 'وقت الانصراف', 'عداد الساعات', 'ملاحظات'
  ];
  hRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = darkBlueBg;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });

  // Vertically stacked 76-row daily blocks
  for (let dIdx = 0; dIdx < daysData.length; dIdx++) {
    const dayItem = daysData[dIdx];
    const d = dayItem.data;
    const blockStart = 3 + dIdx * 76;
    const blockEnd = blockStart + 72; // 73 data rows: blockStart..blockEnd
    const totRowIdx = blockEnd + 1;
    const settleRowIdx = totRowIdx + 1;
    const sepRowIdx = settleRowIdx + 1;

    // Staff Track
    const staffList = [...(d?.attendance || [])];
    const staffNames = new Set(staffList.map(s => s.employee_name));
    const staffIds = new Set(staffList.map(s => String(s.employee_id)));
    (d?.advances || []).forEach(adv => {
      if (!staffNames.has(adv.employee_name) && (!adv.employee_id || !staffIds.has(String(adv.employee_id)))) {
        staffList.push({
          employee_id: adv.employee_id,
          employee_name: adv.employee_name,
          total_hours: 0,
          status: 'absent',
          notes: 'سلفة',
        });
        staffNames.add(adv.employee_name);
        if (adv.employee_id) staffIds.add(String(adv.employee_id));
      }
    });

    const advanceByEmp = new Map();
    (d?.advances || []).forEach(adv => {
      const keyName = adv.employee_name;
      const keyId = adv.employee_id ? String(adv.employee_id) : null;
      const current = (advanceByEmp.get(keyName)?.amount || 0) + Number(adv.amount || 0);
      const combined = { employee_name: keyName, employee_id: adv.employee_id, amount: current };
      advanceByEmp.set(keyName, combined);
      if (keyId) advanceByEmp.set(keyId, combined);
    });

    // Deduction Track
    const deductionItems = [];
    (d?.expenses || []).forEach(exp => {
      const expMethod = formatPaymentMethodLabel(exp);
      const desc = exp.payment_method && exp.payment_method !== 'cash'
        ? `${exp.description} (${expMethod})`
        : exp.description;
      deductionItems.push({
        description: desc,
        amount: Number(exp.amount || 0),
      });
    });
    (d?.supplier_payments || []).forEach(sp => {
      deductionItems.push({
        description: `سداد مورد (كاش): ${sp.supplier_name}${sp.notes ? ` - ${sp.notes}` : ''}`,
        amount: Number(sp.amount || 0),
      });
    });

    // Electronic Payments Track
    const electronicPayments = [];
    (d?.sales_invoices || []).forEach(inv => {
      if (inv.payment_splits && Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0) {
        inv.payment_splits.forEach(s => {
          const m = (s.method || '').toLowerCase();
          const a = Number(s.amount || 0);
          if (a > 0 && m !== 'cash') {
            let label = 'إلكتروني';
            if (m === 'card' || m === 'visa') label = 'فيزا';
            else if (m === 'bank_transfer' || m === 'bank' || m === 'instapay') label = 'انستاباي';
            else if (m === 'wallet') label = 'فودافون كاش';
            electronicPayments.push({
              type: label,
              ref: inv.invoice_number || inv.id,
              amount: a,
              notes: inv.seller_name || '',
            });
          }
        });
      } else {
        const pm = (inv.payment_method || '').toLowerCase();
        const cardAmt = Number(inv.card_amount || 0);
        const bankAmt = Number(inv.bank_transfer_amount || 0);
        const walletAmt = Number(inv.wallet_amount || 0);
        if (cardAmt > 0) electronicPayments.push({ type: 'فيزا', ref: inv.invoice_number, amount: cardAmt });
        if (bankAmt > 0) electronicPayments.push({ type: 'انستاباي', ref: inv.invoice_number, amount: bankAmt });
        if (walletAmt > 0) electronicPayments.push({ type: 'فودافون كاش', ref: inv.invoice_number, amount: walletAmt });
        if (cardAmt === 0 && bankAmt === 0 && walletAmt === 0 && pm !== 'cash' && Number(inv.paid_amount || 0) > 0) {
          let label = 'إلكتروني';
          if (pm === 'visa' || pm === 'card') label = 'فيزا';
          else if (pm === 'bank_transfer' || pm === 'instapay') label = 'انستاباي';
          else if (pm === 'wallet') label = 'فودافون كاش';
          electronicPayments.push({ type: label, ref: inv.invoice_number || inv.id, amount: Number(inv.paid_amount || 0) });
        }
      }
    });

    const maxRows = Math.max(
      (d?.sales_invoices || []).length,
      deductionItems.length,
      staffList.length,
      electronicPayments.length,
      1
    );

    for (let i = 0; i < 73; i++) {
      const rowIdx = blockStart + i;
      const r = masterWs.getRow(rowIdx);
      r.height = 24;

      const inv = (d?.sales_invoices || [])[i];
      if (inv) {
        r.getCell(1).value = inv.invoice_date || dayItem.date;
        r.getCell(2).value = Number(inv.invoice_number) || inv.invoice_number;
        const invMethod = formatPaymentMethodLabel(inv);
        const desc = inv.payment_method && inv.payment_method !== 'cash'
          ? `${inv.description} (${invMethod})`
          : inv.description;
        r.getCell(3).value = desc;
        r.getCell(4).value = Number(inv.total_amount || 0);
        r.getCell(5).value = Number(inv.paid_amount || 0);
        r.getCell(6).value = { formula: `D${rowIdx}-E${rowIdx}`, result: Number(inv.remaining_amount || 0) };
        r.getCell(7).value = inv.seller_name || '';
        r.getCell(8).value = inv.delivery_date || inv.invoice_date || '';
      } else if (i < maxRows) {
        r.getCell(6).value = { formula: `D${rowIdx}-E${rowIdx}`, result: 0 };
      }

      if (i < staffList.length) {
        const staff = staffList[i];
        const adv = advanceByEmp.get(staff.employee_name) || (staff.employee_id ? advanceByEmp.get(String(staff.employee_id)) : null);

        r.getCell(9).value = { formula: `P${rowIdx}`, result: staff.employee_name };
        if (adv && adv.amount > 0) {
          r.getCell(10).value = Number(adv.amount || 0);
        }

        r.getCell(16).value = staff.employee_name;
        r.getCell(17).value = staff.check_in_24 || (staff.check_in ? staff.check_in.replace(/\s*[AP]M/i, '').trim() : '');
        r.getCell(18).value = staff.check_out_24 || (staff.check_out ? staff.check_out.replace(/\s*[AP]M/i, '').trim() : '');
        if (staff.total_hours > 0) {
          r.getCell(19).value = {
            formula: `IF(OR(Q${rowIdx}="",R${rowIdx}=""),"",MOD(R${rowIdx}-Q${rowIdx},1))`,
            result: staff.total_hours / 24,
          };
          r.getCell(19).numFmt = 'h:mm';
        } else {
          r.getCell(19).value = '';
        }
        r.getCell(20).value = staff.notes || (staff.status === 'absent' ? 'غياب' : '');
      } else {
        r.getCell(9).value = { formula: `P${rowIdx}`, result: 0 };
      }

      const ded = deductionItems[i];
      if (ded) {
        r.getCell(11).value = ded.description;
        r.getCell(12).value = ded.amount;
      }

      const ep = electronicPayments[i];
      if (ep) {
        r.getCell(13).value = ep.type;
        r.getCell(14).value = ep.ref;
        r.getCell(15).value = ep.amount;
      }

      for (let c = 1; c <= 20; c++) {
        const cell = r.getCell(c);
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
        if ([4, 5, 6, 10, 12, 15].includes(c) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      }
    }

    // Row totRowIdx: Totals
    masterWs.mergeCells(`B${totRowIdx}:C${settleRowIdx}`);
    const rTot = masterWs.getRow(totRowIdx);
    rTot.height = 26;
    const labelCell = rTot.getCell(2);
    labelCell.value = 'اجمالى اليوم ';
    labelCell.font = { name: 'Calibri', size: 12, bold: true };
    labelCell.fill = lightPurpleBg;
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.border = thinBorder;

    rTot.getCell(1).value = dayItem.date;
    rTot.getCell(4).value = { formula: `SUM(D${blockStart}:D${blockEnd})`, result: d?.summary?.total_sales || 0 };
    rTot.getCell(5).value = { formula: `SUM(E${blockStart}:E${blockEnd})`, result: d?.summary?.total_paid || 0 };
    rTot.getCell(10).value = { formula: `SUM(J${blockStart}:J${blockEnd})`, result: d?.summary?.total_advances || 0 };
    const totalL = (d?.summary?.total_expenses || 0) + (d?.summary?.total_supplier_cash_payments || 0);
    rTot.getCell(12).value = { formula: `SUM(L${blockStart}:L${blockEnd})`, result: totalL };
    const totalElectronic = Number(d?.summary?.electronic_collections || 0);
    rTot.getCell(15).value = { formula: `SUM(O${blockStart}:O${blockEnd})`, result: totalElectronic };

    [4, 5, 10, 12, 15].forEach(c => {
      const cell = rTot.getCell(c);
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = lightPurpleBg;
      cell.border = thinBorder;
      cell.numFmt = '#,##0.00';
    });

    // Row settleRowIdx: Settlement
    masterWs.mergeCells(`D${settleRowIdx}:F${settleRowIdx}`);
    const rSettle = masterWs.getRow(settleRowIdx);
    rSettle.height = 28;
    const netCash = d?.summary?.cash_in_drawer ?? (d?.summary?.total_paid - d?.summary?.total_deductions);
    const closingCell = rSettle.getCell(4);
    closingCell.value = { formula: `E${totRowIdx}-K${settleRowIdx}`, result: netCash };
    closingCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF1E293B' } };
    closingCell.fill = lightPurpleBg;
    closingCell.alignment = { horizontal: 'center', vertical: 'middle' };
    closingCell.border = thinBorder;
    closingCell.numFmt = '#,##0.00';

    const sumDeductionsCell = rSettle.getCell(11);
    sumDeductionsCell.value = { formula: `J${totRowIdx}+L${totRowIdx}+O${totRowIdx}`, result: (d?.summary?.total_deductions || 0) + totalElectronic };
    sumDeductionsCell.font = { name: 'Calibri', size: 11, bold: true };
    sumDeductionsCell.fill = lightPurpleBg;
    sumDeductionsCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sumDeductionsCell.border = thinBorder;
    sumDeductionsCell.numFmt = '#,##0.00';

    rSettle.getCell(1).value = dayItem.date;

    // Blank separator row for next day
    if (dIdx < daysData.length - 1) {
      const rSep = masterWs.getRow(sepRowIdx);
      rSep.height = 12;
      rSep.getCell(1).value = daysData[dIdx + 1]?.date;
    }
  }
}

/**
 * Generates the full consolidated monthly workbook (36 sheets)
 * Exact Sheet Order:
 * 1. 30/31 Daily sheets (1-M-YYYY to 31-M-YYYY) [visible]
 * 2. SALARY [visible]
 * 3. MASTER STAFF LIST [hidden]
 * 4. OHDA [visible]
 * 5. M${monthNum} [hidden]
 * 6. KPI [hidden]
 * 7. MASTER SHEET [visible]
 */
async function generateConsolidatedBranchExcel(query = {}, user = null) {
  const reportsService = require('./reports.service');
  const db = require('../../database/connection');
  const { getDatabaseCairoNow } = require('../../../shared/utils/date');

  const q = query || {};
  let month = q.month;
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    month = (await getDatabaseCairoNow(db)).month;
  }

  let branchId = null;
  if (user && user.role !== 'admin') {
    branchId = String(user.branch_id);
  } else if (q.branch_id && q.branch_id !== 'all') {
    branchId = String(q.branch_id);
  } else {
    branchId = 'all';
  }
  const isAll = branchId === 'all' || !branchId;
  const branding = await getBranchBranding(db, isAll ? 'all' : branchId);

  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elwazeer POS System';
  wb.lastModifiedBy = 'Elwazeer POS System';
  wb.created = new Date();

  // 1. Fetch days data concurrently for high-efficiency generation
  const dayIndices = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const dailySheetNames = dayIndices.map(d => `${d}-${monthNum}-${year}`);

  const [daysData, ohdaData, salaryData, kpiData] = await Promise.all([
    Promise.all(dayIndices.map(async (d) => {
      const sheetName = `${d}-${monthNum}-${year}`;
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      const dayData = await reportsService.getExtendedDailyReport({ date: dateStr, branch_id: isAll ? 'all' : branchId }, user);
      return { day: d, date: dateStr, sheetName, data: dayData };
    })),
    reportsService.getMonthlyOhdaReport({ month, branch_id: isAll ? 'all' : branchId }, user),
    reportsService.getMonthlySalarySheet({ month, branch_id: isAll ? 'all' : branchId }, user),
    reportsService.getSalesKpiReport({ month, branch_id: isAll ? 'all' : branchId }, user),
  ]);

  // 1. Daily sheets (visible)
  for (const dayItem of daysData) {
    const ws = wb.addWorksheet(dayItem.sheetName, { views: [{ rightToLeft: true }] });
    buildDailyOperationsSheet(ws, dayItem.data, branding.titles.daily, {
      isAll,
      branchName: branding.branchName,
      cleanName: branding.cleanName,
      branchId: branding.branchId,
      date: dayItem.date,
      logoAsset: branding.logo,
    });
  }

  // 2. SALARY Sheet (visible)
  const salWs = wb.addWorksheet('SALARY', { views: [{ rightToLeft: true }] });
  buildSalaryWorksheet(salWs, salaryData, branding, month, true);

  // 3. MASTER STAFF LIST (hidden)
  const staffSheet = wb.addWorksheet('MASTER STAFF LIST', { views: [{ rightToLeft: true }] });
  staffSheet.state = 'hidden';
  staffSheet.getCell('I3').value = 'الاسم';
  staffSheet.getCell('I3').font = { name: 'Calibri', size: 14, bold: true };
  (ohdaData.employees || []).forEach((emp, idx) => {
    staffSheet.getCell(`I${4 + idx}`).value = emp.employee_name;
  });

  // 4. OHDA Sheet (visible)
  const ohdaWs = wb.addWorksheet('OHDA', { views: [{ rightToLeft: true }] });
  buildOhdaWorksheet(ohdaWs, ohdaData, branding.branchName, month);

  // 5. M${monthNum} Sheet (hidden)
  const mSheet = wb.addWorksheet(`M${monthNum}`, { views: [{ rightToLeft: true }] });
  buildMWorksheet(mSheet, daysData, monthNum, year, branding);

  // 6. KPI Sheet (hidden)
  const kpiWs = wb.addWorksheet('KPI', { views: [{ rightToLeft: true }] });
  kpiWs.state = 'hidden';
  buildKpiWorksheet(kpiWs, kpiData, branding, dailySheetNames);

  // 7. MASTER SHEET (visible)
  const masterWs = wb.addWorksheet('MASTER SHEET', { views: [{ rightToLeft: true }] });
  buildMasterSheetWorksheet(masterWs, daysData, branding);

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
  const safeBranchName = branchName || 'كل الفروع';
  const isAll = safeBranchName === 'كل الفروع' || safeBranchName === 'all';
  const clean = isAll ? 'كل الفروع' : getBranchCleanName(safeBranchName);
  const branchDisplayName = isAll ? 'كل الفروع' : (clean.startsWith('فرع') ? clean : `فرع ${clean}`);
  const bNameText = isAll ? 'كل الفروع' : branchDisplayName;
  const titleCell = ohdaWs.getCell(1, 10);
  titleCell.value = `عهدة ${bNameText} (حضور وسلف)`;
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
  const branding = options.branding || {
    branchName,
    cleanName: options.cleanName || branchName,
    titles: { salary: options.reportTitle || `مرتبات فرع ${options.cleanName || branchName}` }
  };

  const salWs = wb.addWorksheet('SALARY', { views: [{ rightToLeft: true }] });
  buildSalaryWorksheet(salWs, salaryData, branding, month, false);

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
  const branding = options.branding || {
    branchName,
    cleanName: options.cleanName || branchName,
    titles: { kpi: options.reportTitle || `تقييم وأداء البائعين - فرع ${options.cleanName || branchName}` }
  };

  const kpiWs = wb.addWorksheet('KPI', { views: [{ rightToLeft: true }] });
  kpiWs.state = 'visible';
  buildKpiWorksheet(kpiWs, kpiData, branding, []);

  return wb.xlsx.writeBuffer();
}

/**
 * 15. Branch Stock Matrix Report (Products x Branches + Sizes)
 */
async function generateBranchMatrixExcel(matrixData, options = {}) {
  const wb = createBaseWorkbook('أرصدة الفروع والمخزن');
  const ws = wb.addWorksheet('أرصدة الفروع');
  applyWorksheetStyles(ws, 'مصفوفة أرصدة البضائع الموزعة بالفروع والمخزن الرئيسي وإجمالي الشركة', options);

  const branches = matrixData.branches || [];
  const items = matrixData.items || [];
  const isAdmin = options.isAdmin || matrixData.isAdmin || false;

  // Header row
  const headerValues = ['#', 'كود الصنف', 'اسم الصنف', 'القسم', 'التصنيف', 'اللون'];
  branches.forEach(b => {
    headerValues.push(b.is_main_warehouse ? `🏢 ${b.name}` : b.name);
  });
  headerValues.push('إجمالي الشركة 🏬');
  if (isAdmin) {
    headerValues.push('سعر البيع (ج.م)', 'سعر التكلفة (ج.م)', 'قيمة البيع (ج.م)', 'قيمة التكلفة (ج.م)');
  }

  const hRow = ws.getRow(4);
  hRow.values = headerValues;
  styleHeaderRow(hRow);

  let curLine = 5;
  const branchTotals = {};
  branches.forEach(b => { branchTotals[b.id] = 0; });
  let grandTotalStock = 0;
  let grandRetailValue = 0;
  let grandCostValue = 0;

  items.forEach((item, idx) => {
    const row = ws.getRow(curLine);
    const branchStocks = item.branch_stocks || {};
    const totalStock = Number(item.total_stock || 0);
    grandTotalStock += totalStock;

    const price = Number(item.price || 0);
    const costPrice = Number(item.cost_price || 0);
    const retailVal = totalStock * price;
    const costVal = totalStock * costPrice;
    grandRetailValue += retailVal;
    grandCostValue += costVal;

    const genderLabel = item.gender === 'women' ? 'حريمي 👗' : item.gender === 'both' ? 'مشترك 🚻' : 'رجالي 👔';

    const rowValues = [
      idx + 1,
      item.id,
      sanitizeFormulaValue(item.name || '-'),
      genderLabel,
      sanitizeFormulaValue(item.category || '-'),
      sanitizeFormulaValue(item.color || '-'),
    ];

    branches.forEach(b => {
      const bStock = Number(branchStocks[b.id] || 0);
      branchTotals[b.id] += bStock;
      rowValues.push(bStock);
    });

    rowValues.push(totalStock);

    if (isAdmin) {
      rowValues.push(price, costPrice, retailVal, costVal);
    }

    row.values = rowValues;
    styleDataRow(row, idx % 2 === 1);

    const totalCellIdx = 6 + branches.length + 1;
    row.getCell(totalCellIdx).font = { name: 'Calibri', size: 10, bold: true };

    curLine++;

    // Sub-rows for sizes if available
    const sizes = Array.isArray(item.sizes) ? item.sizes : [];
    if (sizes.length > 0) {
      sizes.forEach((sz) => {
        const szRow = ws.getRow(curLine);
        const szBranchStocks = sz.branch_stocks || {};
        const szTotalStock = Number(sz.total_stock || 0);

        const szRowValues = [
          '',
          '',
          `↳ مقاس: ${sz.size_name || '-'}${sz.color_name ? ` (${sz.color_name})` : ''}`,
          '',
          '',
          '',
        ];

        branches.forEach(b => {
          szRowValues.push(Number(szBranchStocks[b.id] || 0));
        });

        szRowValues.push(szTotalStock);

        if (isAdmin) {
          szRowValues.push('', '', '', '');
        }

        szRow.values = szRowValues;

        for (let c = 1; c <= szRowValues.length; c++) {
          const cell = szRow.getCell(c);
          cell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF555555' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9F8F6' },
          };
          cell.alignment = { horizontal: c === 3 ? 'right' : 'center', vertical: 'middle' };
          cell.border = {
            bottom: { style: 'hair', color: { argb: 'FFE0DCD3' } },
          };
        }
        curLine++;
      });
    }
  });

  // Total summary row
  const totRow = ws.getRow(curLine);
  const totValues = ['الإجمالي', '', '', '', '', ''];
  branches.forEach(b => {
    totValues.push(branchTotals[b.id] || 0);
  });
  totValues.push(grandTotalStock);
  if (isAdmin) {
    totValues.push('', '', grandRetailValue, grandCostValue);
  }

  totRow.values = totValues;
  styleTotalRow(totRow);

  autoFitColumns(ws);

  return wb.xlsx.writeBuffer();
}

/**
 * 16. Branch Transfer Logs Report
 */
async function generateTransferLogsExcel(transferData, options = {}) {
  const wb = createBaseWorkbook('سجل تحويلات الفروع');
  const ws = wb.addWorksheet('سجل التحويلات');
  applyWorksheetStyles(ws, 'سجل وحالات التحويلات بين الفروع (من وإلى)', options);

  const items = Array.isArray(transferData) ? transferData : transferData?.items || [];
  const headerValues = [
    '#',
    'رقم التحويل',
    'التاريخ والوقت',
    'النوع',
    'اسم المنتج',
    'الباركود',
    'التصنيف',
    'الفرع المصدر (من)',
    'الشخص المُسلِّم',
    'الفرع الوجهة (إلى)',
    'الشخص المُستلِم',
    'طالب التحويل (المُنشِئ)',
    'إجمالي الكمية',
    'تفاصيل المقاسات والألوان',
    'حالة التحويل',
    'تاريخ آخر تحديث',
  ];

  const hRow = ws.getRow(4);
  hRow.values = headerValues;
  styleHeaderRow(hRow);

  const statusMap = {
    requested: 'طلب معلق ⏳',
    pending: 'في الطريق 🚚',
    received: 'تم الاستلام ✅',
    completed: 'مكتمل فوري ⚡',
    rejected: 'مرفوض ❌',
  };

  let curLine = 5;
  items.forEach((item, idx) => {
    const row = ws.getRow(curLine);
    let sizes = item.sizes_breakdown;
    if (!sizes && item.sizes_data) {
      try {
        sizes = typeof item.sizes_data === 'string' ? JSON.parse(item.sizes_data) : item.sizes_data;
      } catch {
        sizes = null;
      }
    }
    let sizesStr = '';
    if (Array.isArray(sizes) && sizes.length > 0) {
      sizesStr = sizes.map(s => `${s.color_name ? s.color_name + ' ' : ''}${s.size_name}: ${s.quantity}`).join(' | ');
    } else {
      sizesStr = '—';
    }

    const rowValues = [
      idx + 1,
      `#${item.id}`,
      formatCairoDateTime(item.transfer_date),
      item.direction_label || (item.is_outgoing ? 'صادر' : (item.is_incoming ? 'وارد' : 'تحويل')),
      item.inventory_name || item.product_name || '-',
      item.inventory_barcode || '-',
      item.category || '-',
      item.from_branch_name || `فرع #${item.from_branch_id}`,
      item.sender_name || (item.status === 'requested' ? 'بانتظار الموافقة والإرسال' : (item.created_by_name || 'غير محدد')),
      item.to_branch_name || `فرع #${item.to_branch_id}`,
      item.receiver_name || (item.status === 'pending' ? 'بانتظار الاستلام' : '—'),
      item.created_by_name || '—',
      Number(item.quantity || 0),
      sizesStr,
      statusMap[item.status] || item.status,
      item.updated_at ? formatCairoDateTime(item.updated_at) : '-',
    ];

    row.values = rowValues;
    styleDataRow(row, idx % 2 === 1);
    curLine++;
  });

  autoFitColumns(ws);
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
  generateSuppliersReportExcel,
  generateSuppliersLedgerExcel,
  generateSupplierStatementExcel,
  buildDailyOperationsSheet,
  buildMasterSheetWorksheet,
  buildSalaryWorksheet,
  buildOhdaWorksheet,
  buildMWorksheet,
  buildKpiWorksheet,
  generateConsolidatedBranchExcel,
  generateOhdaReportExcel,
  generateSalaryReportExcel,
  generateKpiReportExcel,
  generateBranchMatrixExcel,
  generateTransferLogsExcel,
};
