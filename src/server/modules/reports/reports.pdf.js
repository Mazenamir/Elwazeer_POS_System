const fs = require('fs');
const path = require('path');
const { formatCairoDateTime } = require('./reports.helpers');

let localFontCss = '';
try {
  const fontDir = path.resolve(__dirname, '../../../renderer/assets');
  const regPath = path.join(fontDir, 'SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf');
  const boldPath = path.join(fontDir, 'SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hAc5W1Q.ttf');

  if (fs.existsSync(regPath)) {
    const regBase64 = fs.readFileSync(regPath).toString('base64');
    localFontCss += `
      @font-face {
        font-family: 'Cairo';
        font-style: normal;
        font-weight: 400;
        src: url(data:font/truetype;charset=utf-8;base64,${regBase64}) format('truetype');
      }
    `;
  }
  if (fs.existsSync(boldPath)) {
    const boldBase64 = fs.readFileSync(boldPath).toString('base64');
    localFontCss += `
      @font-face {
        font-family: 'Cairo';
        font-style: normal;
        font-weight: 700;
        src: url(data:font/truetype;charset=utf-8;base64,${boldBase64}) format('truetype');
      }
    `;
  }
} catch {
  // Graceful fallback to system and Google fonts
}

/**
 * Standard CSS for all Printable / PDF documents with Cairo Arabic font & RTL layout
 */
const BASE_PRINT_CSS = `
  ${localFontCss}
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
  
  /* Dynamic @page orientation is injected by wrapHtml */
  .salary-table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }
  .salary-table th {
    padding: 5px 2px !important;
    font-size: 7.5pt !important;
    font-weight: 800 !important;
    white-space: nowrap !important;
    text-align: center !important;
  }
  .salary-table td {
    padding: 4px 2px !important;
    font-size: 7.5pt !important;
    white-space: nowrap !important;
    text-align: center !important;
  }
  .salary-table td.num {
    text-align: left !important;
    direction: ltr !important;
    font-family: 'Cairo', Tahoma, monospace !important;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    font-family: 'Cairo', Tahoma, 'Segoe UI', Arial, sans-serif;
    direction: rtl;
    text-align: right;
    margin: 0;
    padding: 0;
    color: #0f172a;
    background: #ffffff;
    font-size: 10pt;
    line-height: 1.4;
  }

  .header {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title-area h1 {
    margin: 0;
    font-size: 18pt;
    font-weight: 900;
    color: #0f172a;
  }

  .title-area .subtitle {
    margin: 4px 0 0 0;
    font-size: 9.5pt;
    font-weight: 600;
    color: #64748b;
  }

  .meta-badge {
    text-align: left;
    font-size: 8.5pt;
    color: #475569;
    font-weight: 600;
  }

  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }

  .kpi-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    background: #f8fafc;
  }

  .kpi-card.highlight {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .kpi-title {
    font-size: 8pt;
    font-weight: 700;
    color: #64748b;
    margin-bottom: 4px;
  }

  .kpi-value {
    font-size: 13pt;
    font-weight: 900;
    color: #0f172a;
  }

  .kpi-card.highlight .kpi-value {
    color: #15803d;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    page-break-inside: auto;
  }

  thead {
    display: table-header-group;
  }

  tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }

  th {
    background-color: #1e293b !important;
    color: #ffffff !important;
    font-weight: 800;
    font-size: 9pt;
    padding: 8px 10px;
    text-align: right;
    border: 1px solid #0f172a;
  }

  th.center, td.center {
    text-align: center;
  }

  th.num, td.num {
    text-align: left;
    direction: ltr;
    font-family: 'Cairo', Tahoma, sans-serif;
  }

  td {
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
    font-size: 8.5pt;
    font-weight: 600;
  }

  tbody tr:nth-child(even) {
    background-color: #f8fafc;
  }

  tfoot tr td {
    font-weight: 900;
    background-color: #f1f5f9;
    border-top: 2px solid #0f172a;
    border-bottom: 2px solid #0f172a;
    font-size: 9pt;
  }

  .footer {
    margin-top: 20px;
    border-top: 1px solid #cbd5e1;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #64748b;
  }

  @media print {
    body {
      padding: 0;
    }
    .no-print {
      display: none !important;
    }
  }
`;

function wrapHtml(title, bodyContent, options = {}) {
  const isLandscape = options.orientation === 'landscape' || options.landscape === true;
  const pageCss = isLandscape
    ? `@page {
        size: A4 landscape;
        margin: 6mm 6mm 8mm 6mm;
        @bottom-center {
          content: "صفحة " counter(page) " من " counter(pages);
          font-family: 'Cairo', Tahoma, sans-serif;
          font-size: 8pt;
          color: #64748b;
        }
      }`
    : `@page {
        size: A4 portrait;
        margin: 8mm 6mm 10mm 6mm;
        @bottom-center {
          content: "صفحة " counter(page) " من " counter(pages);
          font-family: 'Cairo', Tahoma, sans-serif;
          font-size: 8pt;
          color: #64748b;
        }
      }`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    ${pageCss}
    ${BASE_PRINT_CSS}
  </style>
</head>
<body class="${isLandscape ? 'landscape' : 'portrait'}">
  ${bodyContent}
</body>
</html>`;
}

function formatCompactNumber(amount, showDashIfZero = false) {
  const parsed = Number(amount);
  const num = Number.isFinite(parsed) ? parsed : 0;
  if (showDashIfZero && num === 0) return '-';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatMoney(amount) {
  const parsed = Number(amount);
  const num = Number.isFinite(parsed) ? parsed : 0;
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `\u200E${formatted} ج.م` : `${formatted} ج.م`;
}

function formatPdfPaymentMethod(item) {
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
        return `${mName}: ${Number(s.amount || 0).toLocaleString('en-US')}`;
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

/**
 * 1. Daily Reports History PDF HTML
 */
function generateDailyHistoryPdfHtml(historyRows, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || 'آخر 30 يوماً';
  const cairoTime = formatCairoDateTime();

  let totalSales = 0;
  let totalRentals = 0;
  let totalTailoring = 0;
  let totalRev = 0;
  let totalExp = 0;
  let totalSal = 0;
  let totalCogs = 0;
  let totalProfit = 0;

  const tableRows = historyRows.map((item, idx) => {
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

    return `
      <tr>
        <td class="center font-mono">${item.date || '-'}</td>
        <td class="num">${formatMoney(sales)}</td>
        <td class="num">${formatMoney(rentals)}</td>
        <td class="num">${formatMoney(tailoring)}</td>
        <td class="num font-bold">${formatMoney(revenue)}</td>
        <td class="num text-rose-600">${formatMoney(expenses)}</td>
        <td class="num">${formatMoney(salaries)}</td>
        <td class="num">${formatMoney(cogs)}</td>
        <td class="num font-black" style="color: ${profit >= 0 ? '#15803d' : '#e11d48'};">${formatMoney(profit)}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير حركة الإيرادات والمصروفات اليومية</h1>
        <div class="subtitle">نظام الوزير لإدارة المبيعات والتأجير والأنشطة التجارية</div>
      </div>
      <div class="meta-badge">
        <div><strong>النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المبيعات</div>
        <div class="kpi-value">${formatMoney(totalSales)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي التأجير والتفصيل</div>
        <div class="kpi-value">${formatMoney(totalRentals + totalTailoring)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المصروفات والرواتب</div>
        <div class="kpi-value">${formatMoney(totalExp + totalSal)}</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">صافي الأرباح</div>
        <div class="kpi-value">${formatMoney(totalProfit)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 12%;">التاريخ</th>
          <th class="center" style="width: 11%;">مبيعات الكاشير</th>
          <th class="center" style="width: 11%;">التأجير</th>
          <th class="center" style="width: 11%;">التفصيل</th>
          <th class="center" style="width: 11%;">إجمالي الإيرادات</th>
          <th class="center" style="width: 11%;">المصروفات</th>
          <th class="center" style="width: 11%;">الرواتب</th>
          <th class="center" style="width: 11%;">تكلفة البضاعة</th>
          <th class="center" style="width: 11%;">صافي الربح</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="9" class="center">لا توجد سجلات في هذه الفترة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td class="center font-black">الإجمالي</td>
          <td class="num font-black">${formatMoney(totalSales)}</td>
          <td class="num font-black">${formatMoney(totalRentals)}</td>
          <td class="num font-black">${formatMoney(totalTailoring)}</td>
          <td class="num font-black">${formatMoney(totalRev)}</td>
          <td class="num font-black">${formatMoney(totalExp)}</td>
          <td class="num font-black">${formatMoney(totalSal)}</td>
          <td class="num font-black">${formatMoney(totalCogs)}</td>
          <td class="num font-black">${formatMoney(totalProfit)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تم إنشاء هذا التقرير آلياً بواسطة نظام الوزير</div>
      <div>صفحة 1 من 1</div>
    </div>
  `;

  return wrapHtml('تقرير حركة الإيرادات اليومية', bodyContent);
}

/**
 * 2. Monthly Financial Overview PDF HTML
 */
function generateMonthlyHistoryPdfHtml(monthlyRows, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || 'آخر 12 شهراً';
  const cairoTime = formatCairoDateTime();

  let totalSales = 0;
  let totalRentals = 0;
  let totalTailoring = 0;
  let totalRev = 0;
  let totalExp = 0;
  let totalSal = 0;
  let totalCogs = 0;
  let totalProfit = 0;

  const tableRows = monthlyRows.map((m) => {
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

    return `
      <tr>
        <td class="center font-mono font-bold">${m.month || '-'}</td>
        <td class="num">${formatMoney(sales)}</td>
        <td class="num">${formatMoney(rentals)}</td>
        <td class="num">${formatMoney(tailoring)}</td>
        <td class="num font-bold">${formatMoney(revenue)}</td>
        <td class="num text-rose-600">${formatMoney(expenses)}</td>
        <td class="num">${formatMoney(salaries)}</td>
        <td class="num">${formatMoney(cogs)}</td>
        <td class="num font-black" style="color: ${profit >= 0 ? '#15803d' : '#e11d48'};">${formatMoney(profit)}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>التقرير المالي وحركة الأرباح الشهرية</h1>
        <div class="subtitle">مقارنة الإيرادات والمصروفات وصافي الأرباح شهرياً</div>
      </div>
      <div class="meta-badge">
        <div><strong>النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المبيعات السنوية</div>
        <div class="kpi-value">${formatMoney(totalSales)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي التأجير والتفصيل</div>
        <div class="kpi-value">${formatMoney(totalRentals + totalTailoring)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المصروفات والرواتب</div>
        <div class="kpi-value">${formatMoney(totalExp + totalSal)}</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">صافي الأرباح المحققة</div>
        <div class="kpi-value">${formatMoney(totalProfit)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 12%;">الشهر</th>
          <th class="center" style="width: 11%;">مبيعات الكاشير</th>
          <th class="center" style="width: 11%;">التأجير</th>
          <th class="center" style="width: 11%;">التفصيل</th>
          <th class="center" style="width: 11%;">إجمالي الإيرادات</th>
          <th class="center" style="width: 11%;">المصروفات</th>
          <th class="center" style="width: 11%;">الرواتب</th>
          <th class="center" style="width: 11%;">تكلفة البضاعة</th>
          <th class="center" style="width: 11%;">صافي الربح</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="9" class="center">لا تتوفر بيانات للأشهر السابقة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td class="center font-black">الإجمالي</td>
          <td class="num font-black">${formatMoney(totalSales)}</td>
          <td class="num font-black">${formatMoney(totalRentals)}</td>
          <td class="num font-black">${formatMoney(totalTailoring)}</td>
          <td class="num font-black">${formatMoney(totalRev)}</td>
          <td class="num font-black">${formatMoney(totalExp)}</td>
          <td class="num font-black">${formatMoney(totalSal)}</td>
          <td class="num font-black">${formatMoney(totalCogs)}</td>
          <td class="num font-black">${formatMoney(totalProfit)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>نظام الوزير المحاسبي المتكامل - فرع ${branchName}</div>
      <div>وثيقة مالية معتمدة</div>
    </div>
  `;

  return wrapHtml('التقرير المالي الشهري', bodyContent);
}

/**
 * 3. Profit & Loss Statement PDF HTML
 */
function generateProfitReportPdfHtml(profitReport, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || profitReport.month || '-';
  const cairoTime = formatCairoDateTime();
  const summary = profitReport.summary || profitReport;

  const totalRev = Number(summary.total_revenue || summary.revenue || 0);
  const cogs = Number(summary.cogs || 0);
  const grossProfit = Number(summary.gross_profit || (totalRev - cogs));
  const expenses = Number(summary.expenses || 0);
  const salaries = Number(summary.total_salaries_paid || summary.salaries || 0);
  const netProfit = Number(summary.net_profit || 0);
  const margin = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : '0.0';
  const cashDrawer = Number(summary.cash_drawer || 0);

  const branchRows = (profitReport.branch_reports || []).map((b) => `
    <tr>
      <td class="font-bold">${b.branch_name || `فرع #${b.branch_id}`}</td>
      <td class="num">${formatMoney(b.total_sales)}</td>
      <td class="num">${formatMoney(b.total_rentals)}</td>
      <td class="num">${formatMoney(b.total_tailoring)}</td>
      <td class="num font-bold">${formatMoney(b.total_revenue)}</td>
      <td class="num">${formatMoney(b.cogs)}</td>
      <td class="num text-rose-600">${formatMoney(b.expenses)}</td>
      <td class="num">${formatMoney(b.total_salaries_paid)}</td>
      <td class="num font-black" style="color: ${b.net_profit >= 0 ? '#15803d' : '#e11d48'};">${formatMoney(b.net_profit)}</td>
      <td class="num font-bold" style="color: #0369a1;">${formatMoney(b.cash_drawer)}</td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>قائمة الدخل والأرباح والخسائر الشاملة</h1>
        <div class="subtitle">بيان الإيرادات والتكاليف والمصروفات وصافي العائد التجاري</div>
      </div>
      <div class="meta-badge">
        <div><strong>النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">إجمالي الإيرادات الكلية</div>
        <div class="kpi-value">${formatMoney(totalRev)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">تكلفة البضاعة المباعة (COGS)</div>
        <div class="kpi-value">${formatMoney(cogs)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المصروفات والرواتب المدفوعة</div>
        <div class="kpi-value">${formatMoney(expenses + salaries)}</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">صافي الربح (\u200E${margin}%)</div>
        <div class="kpi-value">${formatMoney(netProfit)}</div>
      </div>
    </div>

    <h2 style="font-size: 12pt; margin: 16px 0 8px 0; color: #1e293b;">1. تفصيل بنود الأرباح والخسائر</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 60%;">البند المالي</th>
          <th class="center" style="width: 40%;">المبلغ المحقق (ج.م)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>مبيعات الكاشير والطلبات</td>
          <td class="num">${formatMoney(summary.total_sales)}</td>
        </tr>
        <tr>
          <td>متحصلات عقود التأجير وغرامات التأخير</td>
          <td class="num">${formatMoney(summary.total_rentals)}</td>
        </tr>
        <tr>
          <td>متحصلات خدمات التفصيل والتعديلات</td>
          <td class="num">${formatMoney(summary.total_tailoring)}</td>
        </tr>
        <tr style="background: #f1f5f9; font-weight: bold;">
          <td><strong>إجمالي الإيرادات التجارية</strong></td>
          <td class="num font-black">${formatMoney(totalRev)}</td>
        </tr>
        <tr>
          <td>تكلفة البضاعة المباعة (سعر التكلفة للمخزون)</td>
          <td class="num font-bold text-rose-600">- ${formatMoney(cogs)}</td>
        </tr>
        <tr style="background: #e2e8f0; font-weight: bold;">
          <td><strong>مجمل الربح (Gross Profit)</strong></td>
          <td class="num font-black">${formatMoney(grossProfit)}</td>
        </tr>
        <tr>
          <td>المصروفات التشغيلية والنثريات العامة</td>
          <td class="num text-rose-600">- ${formatMoney(expenses)}</td>
        </tr>
        <tr>
          <td>الرواتب الشهرية والمسحوبات المدفوعة للعاملين</td>
          <td class="num text-rose-600">- ${formatMoney(salaries)}</td>
        </tr>
        <tr style="background: #dcfce7; font-weight: bold;">
          <td><strong>صافي الربح النهائي (Net Profit)</strong></td>
          <td class="num font-black" style="color: #15803d; font-size: 11pt;">${formatMoney(netProfit)}</td>
        </tr>
        <tr>
          <td>المبلغ المحصّل بالدرج (كاش فعلي بعد المصروفات)</td>
          <td class="num font-black" style="color: #0369a1;">${formatMoney(cashDrawer)}</td>
        </tr>
      </tbody>
    </table>

    ${branchRows ? `
      <h2 style="font-size: 12pt; margin: 24px 0 8px 0; color: #1e293b;">2. مقارنة أداء الفروع</h2>
      <table>
        <thead>
          <tr>
            <th>الفرع</th>
            <th class="center">المبيعات</th>
            <th class="center">التأجير</th>
            <th class="center">التفصيل</th>
            <th class="center">الإيرادات</th>
            <th class="center">التكلفة</th>
            <th class="center">المصروفات</th>
            <th class="center">الرواتب</th>
            <th class="center">صافي الربح</th>
            <th class="center">كاش الدرج</th>
          </tr>
        </thead>
        <tbody>
          ${branchRows}
        </tbody>
      </table>
    ` : ''}

    <div class="footer">
      <div>تقرير مالي تفصيلي - نظام الوزير</div>
      <div>صفحة 1 من 1</div>
    </div>
  `;

  return wrapHtml('تقرير الأرباح والخسائر', bodyContent);
}

/**
 * 4. Top Selling Products PDF HTML
 */
function generateTopProductsPdfHtml(products, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || 'جميع الفترات';
  const cairoTime = formatCairoDateTime();

  const productList = Array.isArray(products)
    ? products
    : (products?.products || products?.top_sales || []);

  let totalQty = 0;
  let totalRevenue = 0;

  const tableRows = productList.map((p, idx) => {
    const qty = Number(p.quantity_sold ?? p.total_sold ?? p.quantity ?? 0);
    const rev = Number(p.total_revenue ?? p.revenue ?? 0);
    totalQty += qty;
    totalRevenue += rev;

    return `
      <tr>
        <td class="center font-bold text-slate-400">${idx + 1}</td>
        <td class="font-bold">${p.name || '-'}</td>
        <td class="center font-mono">${p.barcode ? '#' + p.barcode : '-'}</td>
        <td class="center">${p.category || 'عام'}</td>
        <td class="center">${p.branch_name || '-'}</td>
        <td class="center font-black" style="color: #4338ca;">${qty} قطعة</td>
        <td class="num font-black" style="color: #15803d;">${formatMoney(rev)}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير المنتجات الأكثر طلباً ومبيعاً</h1>
        <div class="subtitle">ترتيب المنتجات المحققة لأعلى عائد كمي ومالي</div>
      </div>
      <div class="meta-badge">
        <div><strong>النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">عدد المنتجات بالتقرير</div>
        <div class="kpi-value">${productList.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي القطع المباعة</div>
        <div class="kpi-value">${totalQty} قطعة</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي العائد المحقق</div>
        <div class="kpi-value">${formatMoney(totalRevenue)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">متوسط سعر القطعة المباعة</div>
        <div class="kpi-value">${totalQty > 0 ? formatMoney(totalRevenue / totalQty) : '0.00 ج.م'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 6%;">#</th>
          <th style="width: 30%;">اسم المنتج</th>
          <th class="center" style="width: 14%;">الباركود</th>
          <th class="center" style="width: 14%;">القسم</th>
          <th class="center" style="width: 14%;">الفرع</th>
          <th class="center" style="width: 10%;">الكمية المباعة</th>
          <th class="center" style="width: 12%;">إجمالي الإيرادات</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="7" class="center">لا تتوفر مبيعات بالتقرير</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="center font-black">الإجمالي الكلي</td>
          <td class="center font-black" style="color: #4338ca;">${totalQty} قطعة</td>
          <td class="num font-black" style="color: #15803d;">${formatMoney(totalRevenue)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تقرير تحليلي للمبيعات - نظام الوزير</div>
      <div>صفحة 1 من 1</div>
    </div>
  `;

  return wrapHtml('المنتجات الأكثر مبيعاً', bodyContent);
}

/**
 * 5. Daily Details PDF HTML (Invoices, Cash, Branches)
 */
function generateDailyDetailsPdfHtml(dailyData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const dateStr = options.date || dailyData.date || '-';
  const cairoTime = formatCairoDateTime();

  const branchSales = dailyData.branch_sales || [];
  const salesInvoices = dailyData.sales_invoices || [];
  const rentalInvoices = dailyData.rental_invoices || [];
  const tailoringInvoices = Array.isArray(dailyData.tailoring?.items)
    ? dailyData.tailoring.items
    : (Array.isArray(dailyData.tailoring_invoices) ? dailyData.tailoring_invoices : []);

  const expenseItems = Array.isArray(dailyData.expenses_details?.items)
    ? dailyData.expenses_details.items
    : (Array.isArray(dailyData.expenses?.items) ? dailyData.expenses.items : (Array.isArray(dailyData.expenses) ? dailyData.expenses : []));
  const attendanceList = Array.isArray(dailyData.attendance) ? dailyData.attendance : [];
  const advancesList = Array.isArray(dailyData.salaries_details?.items)
    ? dailyData.salaries_details.items.filter((s) => s.transaction_type === 'advance')
    : [];

  const bRows = branchSales.map((b) => `
    <tr>
      <td class="font-bold">${b.branch_name || '-'}</td>
      <td class="num">${formatMoney(b.total_sales)}</td>
      <td class="num">${formatMoney(b.total_rentals)}</td>
      <td class="num">${formatMoney(b.total_tailoring)}</td>
      <td class="num font-bold">${formatMoney(b.total_revenue)}</td>
      <td class="num text-rose-600">${formatMoney(b.expenses)}</td>
      <td class="num font-black" style="color: #0369a1;">${formatMoney(b.cash_drawer || b.cash_in_drawer || b.net_cash)}</td>
    </tr>
  `).join('');

  const invRows = salesInvoices.slice(0, 100).map((inv) => `
    <tr>
      <td class="center font-mono font-bold">#${inv.invoice_number || '-'}</td>
      <td class="center font-mono">${inv.created_date || '-'}</td>
      <td>${inv.cashier_name || '-'}</td>
      <td class="center">${formatPdfPaymentMethod(inv)}</td>
      <td class="num font-bold">${formatMoney(inv.amount)}</td>
      <td class="num">${formatMoney(inv.paid_amount)}</td>
      <td class="num text-rose-600">${formatMoney(inv.remainder)}</td>
    </tr>
  `).join('');

  const rRows = rentalInvoices.slice(0, 100).map((r) => {
    const rem = Number(r.remainder || r.remaining || 0);
    const statusLabel = r.status === 'returned'
      ? (rem > 0 ? 'مرتجع (غير خالص / عليه متبقي)' : 'تم الإرجاع (خالص)')
      : (r.status === 'active' ? 'تم الاستلام' : (r.status === 'booked' ? 'محجوزة' : (r.status || '-')));

    return `
      <tr>
        <td class="center font-mono font-bold">#${r.invoice_number || r.id || '-'}</td>
        <td class="center font-mono">${r.created_date || r.booking_date || '-'}</td>
        <td>${r.cashier_name || '-'}</td>
        <td class="center">${formatPdfPaymentMethod(r)}</td>
        <td class="num font-bold">${formatMoney(r.amount || r.total_price)}</td>
        <td class="num">${formatMoney(r.paid_amount || r.deposit)}</td>
        <td class="num text-rose-600">${formatMoney(rem)}</td>
        <td class="center font-bold" style="font-size: 8pt; color: ${r.status === 'returned' ? (rem > 0 ? '#d97706' : '#15803d') : '#475569'};">${statusLabel}</td>
      </tr>
    `;
  }).join('');

  const tRows = tailoringInvoices.slice(0, 100).map((t) => {
    const isRemainder = t.is_remainder;
    const typeLabel = isRemainder ? 'سداد متبقي' : 'عربون / دفعة أولى';
    return `
      <tr>
        <td class="center font-mono font-bold">#${t.invoice_number || '-'}</td>
        <td class="center font-mono">${t.created_date || '-'}</td>
        <td>${t.customer_name || '-'}</td>
        <td>${t.product_description || '-'}</td>
        <td class="center">${formatPdfPaymentMethod(t)}</td>
        <td class="num font-bold">${formatMoney(t.amount)}</td>
        <td class="num">${formatMoney(t.total_amount)}</td>
        <td class="num text-rose-600">${formatMoney(t.remaining_amount || 0)}</td>
        <td class="center font-bold" style="font-size: 8pt; color: ${isRemainder ? '#0284c7' : '#d97706'};">${typeLabel}</td>
      </tr>
    `;
  }).join('');

  const expRows = expenseItems.slice(0, 100).map((e) => `
    <tr>
      <td class="center font-mono font-bold">#${e.id || '-'}</td>
      <td>${e.branch_name || '-'}</td>
      <td class="font-bold">${e.category || 'غير محدد'}</td>
      <td>${e.notes || e.description || '-'}</td>
      <td class="center">${formatPdfPaymentMethod(e)}</td>
      <td class="num text-rose-600 font-bold">${formatMoney(e.amount)}</td>
    </tr>
  `).join('');

  const advMap = new Map();
  advancesList.forEach((adv) => {
    advMap.set(adv.employee_name, (advMap.get(adv.employee_name) || 0) + Number(adv.amount || 0));
  });

  const stRows = attendanceList.slice(0, 100).map((st) => {
    const advAmt = advMap.get(st.employee_name) || 0;
    return `
      <tr>
        <td class="font-bold">${st.employee_name || '-'}</td>
        <td>${st.branch_name || '-'}</td>
        <td class="center font-mono">${st.check_in || '-'}</td>
        <td class="center font-mono">${st.check_out || '-'}</td>
        <td class="center font-bold">${Number(st.total_hours || 0).toFixed(1)} س</td>
        <td class="num text-amber-700 font-bold">${advAmt > 0 ? formatMoney(advAmt) : '-'}</td>
        <td>${st.notes || (st.status === 'absent' ? 'غياب' : '-')}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير حركة اليوم المفصل</h1>
        <div class="subtitle">بيان مبيعات الكاشير وعقود التأجير وحركة الدرج النقدي ليوم: ${dateStr}</div>
      </div>
      <div class="meta-badge">
        <div><strong>النطاق:</strong> ${branchName}</div>
        <div><strong>اليوم:</strong> ${dateStr}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <h2 style="font-size: 11pt; margin: 12px 0 6px 0; color: #1e293b;">1. ملخص الفروع وحركة الدرج</h2>
    <table>
      <thead>
        <tr>
          <th>الفرع</th>
          <th class="center">مبيعات الكاشير</th>
          <th class="center">متحصلات التأجير</th>
          <th class="center">متحصلات التفصيل</th>
          <th class="center">إجمالي الإيرادات</th>
          <th class="center">المصروفات</th>
          <th class="center">صافي الكاش بالدرج</th>
        </tr>
      </thead>
      <tbody>
        ${bRows || '<tr><td colspan="7" class="center">لا تتوفر حركات مسجلة لهذا اليوم</td></tr>'}
      </tbody>
    </table>

    ${salesInvoices.length > 0 ? `
      <h2 style="font-size: 11pt; margin: 20px 0 6px 0; color: #1e293b;">2. فواتير المبيعات المسجلة اليوم (${salesInvoices.length} فاتورة)</h2>
      <table>
        <thead>
          <tr>
            <th class="center" style="width: 12%;">رقم الفاتورة</th>
            <th class="center" style="width: 18%;">الوقت</th>
            <th style="width: 20%;">الكاشير / البائع</th>
            <th class="center" style="width: 14%;">طريقة الدفع</th>
            <th class="center" style="width: 12%;">الإجمالي</th>
            <th class="center" style="width: 12%;">المدفوع</th>
            <th class="center" style="width: 12%;">المتبقي</th>
          </tr>
        </thead>
        <tbody>
          ${invRows}
        </tbody>
      </table>
    ` : ''}

    ${rentalInvoices.length > 0 ? `
      <h2 style="font-size: 11pt; margin: 20px 0 6px 0; color: #1e293b;">3. عقود التأجير المسجلة اليوم (${rentalInvoices.length} عقد)</h2>
      <table>
        <thead>
          <tr>
            <th class="center" style="width: 10%;">رقم العقد</th>
            <th class="center" style="width: 16%;">الوقت</th>
            <th style="width: 18%;">المسؤول</th>
            <th class="center" style="width: 12%;">طريقة الدفع</th>
            <th class="center" style="width: 11%;">الإجمالي</th>
            <th class="center" style="width: 11%;">العربون</th>
            <th class="center" style="width: 11%;">المتبقي</th>
            <th class="center" style="width: 11%;">الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${rRows}
        </tbody>
      </table>
    ` : ''}

    ${tailoringInvoices.length > 0 ? `
      <h2 style="font-size: 11pt; margin: 20px 0 6px 0; color: #1e293b;">4. متحصلات وعقود التفصيل (${tailoringInvoices.length} دفعة / عقد)</h2>
      <table>
        <thead>
          <tr>
            <th class="center" style="width: 10%;">رقم الفاتورة</th>
            <th class="center" style="width: 14%;">الوقت</th>
            <th style="width: 16%;">العميل</th>
            <th style="width: 18%;">وصف القطعة والمقاسات</th>
            <th class="center" style="width: 12%;">طريقة الدفع</th>
            <th class="center" style="width: 10%;">المحصل</th>
            <th class="center" style="width: 10%;">الإجمالي</th>
            <th class="center" style="width: 10%;">المتبقي</th>
          </tr>
        </thead>
        <tbody>
          ${tRows}
        </tbody>
      </table>
    ` : ''}

    ${expenseItems.length > 0 ? `
      <h2 style="font-size: 11pt; margin: 20px 0 6px 0; color: #1e293b;">5. المصروفات المسجلة اليوم (${expenseItems.length} بند)</h2>
      <table>
        <thead>
          <tr>
            <th class="center" style="width: 10%;">رقم الإيصال</th>
            <th style="width: 18%;">الفرع</th>
            <th style="width: 20%;">البند / التصنيف</th>
            <th style="width: 26%;">البيان والملاحظات</th>
            <th class="center" style="width: 12%;">طريقة الصرف</th>
            <th class="center" style="width: 14%;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${expRows}
        </tbody>
      </table>
    ` : ''}

    ${attendanceList.length > 0 ? `
      <h2 style="font-size: 11pt; margin: 20px 0 6px 0; color: #1e293b;">6. سجل الحضور وسلف الموظفين (${attendanceList.length} موظف)</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 20%;">الموظف</th>
            <th style="width: 16%;">الفرع</th>
            <th class="center" style="width: 12%;">الحضور</th>
            <th class="center" style="width: 12%;">الانصراف</th>
            <th class="center" style="width: 12%;">ساعات العمل</th>
            <th class="center" style="width: 14%;">السلفة</th>
            <th style="width: 14%;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${stRows}
        </tbody>
      </table>
    ` : ''}

    <h2 style="font-size: 11pt; margin: 20px 0 6px 0; color: #1e293b;">7. تقفيل الدرج النقدي والتسوية</h2>
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <span><strong>إجمالي الإيرادات الكلية:</strong> ${formatMoney(dailyData.summary?.total_revenue ?? dailyData.summary?.revenue ?? 0)}</span>
        <span><strong>المصروفات التشغيلية:</strong> ${formatMoney(dailyData.summary?.total_expenses ?? dailyData.summary?.expenses ?? 0)}</span>
        <span><strong>سلف الموظفين:</strong> ${formatMoney(dailyData.summary?.total_advances ?? dailyData.summary?.advances ?? 0)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px;">
        <span style="font-size: 11pt; font-weight: bold; color: #047857;">صافي الكاش الفعلي المتبقي بالدرج للتوريد 💵:</span>
        <span style="font-size: 14pt; font-weight: 900; color: #047857;">${formatMoney(dailyData.summary?.cash_in_drawer ?? dailyData.summary?.physical_cash_in_drawer ?? 0)}</span>
      </div>
    </div>

    <div class="footer">
      <div>تقرير الإغلاق اليومي - نظام الوزير للمبيعات والتأجير</div>
      <div>صفحة 1 من 1</div>
    </div>
  `;

  return wrapHtml(`تقرير اليوم المفصل - ${dateStr}`, bodyContent);
}

/**
 * 6. Sales Invoices PDF HTML
 */
function generateSalesPdfHtml(salesData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || (salesData.date_from && salesData.date_to ? `${salesData.date_from} إلى ${salesData.date_to}` : '-');
  const cairoTime = formatCairoDateTime();

  const orders = Array.isArray(salesData.orders) ? salesData.orders : [];
  const summary = salesData.summary || {};

  let totalAmount = 0;
  let totalPaid = 0;
  let totalRemainder = 0;

  const rowsHtml = orders.map((o) => {
    const amount = Number(o.total_amount || 0);
    const paid = Number(o.paid_amount || 0);
    const remainder = Number(o.remainder || 0);

    totalAmount += amount;
    totalPaid += paid;
    totalRemainder += remainder;

    const pMethod = formatPdfPaymentMethod(o);
    const statusLabel = o.status === 'completed'
      ? 'مكتملة'
      : o.status === 'partially_returned'
      ? 'مرتجع جزئياً'
      : o.status === 'returned'
      ? 'مرتجع بالكامل'
      : o.status === 'cancelled'
      ? 'ملغاة'
      : (o.status || '-');

    return `
      <tr>
        <td class="center font-bold">#${o.invoice_number || o.id || '-'}</td>
        <td class="center">${o.created_at_formatted || o.order_date || '-'}</td>
        <td>${o.customer_name || 'عميل نقدي'}</td>
        <td class="center">${o.customer_phone || '-'}</td>
        <td>${o.cashier_name || '-'}</td>
        <td class="center">${pMethod}</td>
        <td>${o.product_names || (o.items_count ? `${o.items_count} صنف` : '-')}</td>
        <td class="num">${formatMoney(amount)}</td>
        <td class="num text-emerald-600">${formatMoney(paid)}</td>
        <td class="num text-rose-600">${formatMoney(remainder)}</td>
        <td class="center">${statusLabel}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير فواتير ومتحصلات المبيعات</h1>
        <div class="subtitle">سجل تفصيلي بحركات البيع والمتحصلات والمتبقيات</div>
      </div>
      <div class="meta-badge">
        <div><strong>الفرع / النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">عدد الفواتير</div>
        <div class="kpi-value">${Number(summary.total_orders || orders.length).toLocaleString('en-US')}</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي المبيعات</div>
        <div class="kpi-value">${formatMoney(summary.total_amount || totalAmount)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المحصل بالدرج (كاش)</div>
        <div class="kpi-value" style="color: #047857;">${formatMoney(summary.cash_paid || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المحصل انستاباي / تحويل</div>
        <div class="kpi-value" style="color: #4338ca;">${formatMoney(summary.bank_transfer_paid || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المحصل فيزا</div>
        <div class="kpi-value">${formatMoney(summary.visa_paid || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المحصل فودافون كاش</div>
        <div class="kpi-value">${formatMoney(summary.wallet_paid || 0)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 8%;">رقم الفاتورة</th>
          <th class="center" style="width: 13%;">الوقت والتاريخ</th>
          <th style="width: 14%;">العميل</th>
          <th class="center" style="width: 10%;">الهاتف</th>
          <th style="width: 11%;">الكاشير</th>
          <th class="center" style="width: 7%;">الدفع</th>
          <th style="width: 17%;">المنتجات / الأصناف</th>
          <th class="num" style="width: 8%;">الإجمالي</th>
          <th class="num" style="width: 8%;">المدفوع</th>
          <th class="num" style="width: 8%;">المتبقي</th>
          <th class="center" style="width: 8%;">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="11" class="center">لا تتوفر فواتير مبيعات في هذه الفترة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="7" class="font-bold">الإجمالي العام</td>
          <td class="num">${formatMoney(totalAmount)}</td>
          <td class="num text-emerald-600">${formatMoney(totalPaid)}</td>
          <td class="num text-rose-600">${formatMoney(totalRemainder)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تقرير فواتير المبيعات - نظام الوزير للمبيعات والتأجير</div>
      <div>تقرير رسمي صادر من النظام الآلي</div>
    </div>
  `;

  return wrapHtml(`تقرير فواتير المبيعات - ${period}`, bodyContent);
}

/**
 * 7. Rentals Report PDF HTML
 */
function generateRentalsPdfHtml(rentalsData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || (rentalsData.date_from && rentalsData.date_to ? `${rentalsData.date_from} إلى ${rentalsData.date_to}` : '-');
  const cairoTime = formatCairoDateTime();

  const rentals = Array.isArray(rentalsData.rentals) ? rentalsData.rentals : [];
  const summary = rentalsData.summary || {};

  let totalPrice = 0;
  let totalDeposit = 0;
  let totalRemaining = 0;
  let totalFines = 0;

  const rowsHtml = rentals.map((r) => {
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

    return `
      <tr>
        <td class="center font-bold">#${r.id}</td>
        <td>${r.item_name || '-'}</td>
        <td>${r.customer_name || '-'}</td>
        <td class="center">${r.booking_date || '-'}</td>
        <td class="center">${r.return_date || '-'}</td>
        <td class="num">${formatMoney(price)}</td>
        <td class="num text-emerald-600">${formatMoney(deposit)}</td>
        <td class="num text-rose-600">${formatMoney(remaining)}</td>
        <td class="num">${fine > 0 ? formatMoney(fine) : '-'}</td>
        <td class="center">${statusLabel}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير عقود وتأجيرات الفروع</h1>
        <div class="subtitle">سجل عقود التأجير والعربونات والمتبقيات والغرامات</div>
      </div>
      <div class="meta-badge">
        <div><strong>الفرع / النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">إجمالي العقود</div>
        <div class="kpi-value">${Number(summary.total_rentals || rentals.length).toLocaleString('en-US')}</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي قيمة العقود</div>
        <div class="kpi-value">${formatMoney(summary.total_price || totalPrice)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">العربونات المسددة</div>
        <div class="kpi-value">${formatMoney(summary.total_deposit || totalDeposit)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المتبقي للتحصيل</div>
        <div class="kpi-value text-rose-600">${formatMoney(summary.total_remaining || totalRemaining)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 8%;">رقم العقد</th>
          <th style="width: 18%;">المنتج / الفستان</th>
          <th style="width: 16%;">العميل</th>
          <th class="center" style="width: 10%;">تاريخ الحجز</th>
          <th class="center" style="width: 10%;">تاريخ الإرجاع</th>
          <th class="num" style="width: 10%;">الإجمالي</th>
          <th class="num" style="width: 10%;">العربون</th>
          <th class="num" style="width: 10%;">المتبقي</th>
          <th class="num" style="width: 8%;">الغرامة</th>
          <th class="center" style="width: 10%;">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="10" class="center">لا تتوفر عقود تأجير في هذه الفترة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="font-bold">الإجمالي العام</td>
          <td class="num">${formatMoney(totalPrice)}</td>
          <td class="num text-emerald-600">${formatMoney(totalDeposit)}</td>
          <td class="num text-rose-600">${formatMoney(totalRemaining)}</td>
          <td class="num">${formatMoney(totalFines)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تقرير عقود التأجير - نظام الوزير للمبيعات والتأجير</div>
      <div>تقرير رسمي صادر من النظام الآلي</div>
    </div>
  `;

  return wrapHtml(`تقرير عقود التأجير - ${period}`, bodyContent);
}

/**
 * 8. Expenses Report PDF HTML
 */
function generateExpensesPdfHtml(expensesData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || (expensesData.date_from && expensesData.date_to ? `${expensesData.date_from} إلى ${expensesData.date_to}` : '-');
  const cairoTime = formatCairoDateTime();

  const expenses = Array.isArray(expensesData.expenses) ? expensesData.expenses : [];
  const summary = expensesData.summary || {};
  const categories = Array.isArray(expensesData.categories) ? expensesData.categories : [];

  let totalAmount = 0;
  const rowsHtml = expenses.map((e) => {
    const amount = Number(e.amount || 0);
    totalAmount += amount;

    return `
      <tr>
        <td class="center font-bold">#${e.id}</td>
        <td class="center">${e.expense_date || '-'}</td>
        <td class="font-bold">${e.category || 'عام'}</td>
        <td>${e.notes || '-'}</td>
        <td class="center">${e.branch_name || '-'}</td>
        <td class="num font-bold text-rose-600">${formatMoney(amount)}</td>
      </tr>
    `;
  }).join('');

  const catRowsHtml = categories.map((c) => {
    const catAmt = Number(c.total_amount || 0);
    const grand = Number(summary.total_amount || totalAmount || 1);
    const pct = ((catAmt / grand) * 100).toFixed(1);
    return `
      <tr>
        <td class="font-bold">${c.category || 'غير محدد'}</td>
        <td class="center">${c.count || 0}</td>
        <td class="num">${formatMoney(catAmt)}</td>
        <td class="center">${pct}%</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير المصروفات والنثريات التشغيلية</h1>
        <div class="subtitle">سجل تفصيلي بالمصروفات وبنود الإنفاق التشغيلي</div>
      </div>
      <div class="meta-badge">
        <div><strong>الفرع / النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">عدد سندات الصرف</div>
        <div class="kpi-value">${Number(summary.total_count || expenses.length).toLocaleString('en-US')}</div>
      </div>
      <div class="kpi-card highlight" style="background: #fff1f2; border-color: #fecdd3;">
        <div class="kpi-title">إجمالي المصروفات</div>
        <div class="kpi-value text-rose-600">${formatMoney(summary.total_amount || totalAmount)}</div>
      </div>
    </div>

    ${categories.length > 0 ? `
      <h2 style="font-size: 11pt; margin: 15px 0 6px 0; color: #1e293b;">1. توزيع المصروفات حسب التصنيف</h2>
      <table style="width: 70%; margin-bottom: 20px;">
        <thead>
          <tr>
            <th>التصنيف</th>
            <th class="center" style="width: 20%;">عدد الحركات</th>
            <th class="num" style="width: 30%;">المبلغ</th>
            <th class="center" style="width: 15%;">النسبة</th>
          </tr>
        </thead>
        <tbody>
          ${catRowsHtml}
        </tbody>
      </table>
    ` : ''}

    <h2 style="font-size: 11pt; margin: 15px 0 6px 0; color: #1e293b;">2. سجل سندات الصرف المفصل</h2>
    <table>
      <thead>
        <tr>
          <th class="center" style="width: 10%;">رقم السند</th>
          <th class="center" style="width: 14%;">التاريخ</th>
          <th style="width: 18%;">التصنيف</th>
          <th style="width: 32%;">البيان / الملاحظات</th>
          <th class="center" style="width: 12%;">الفرع</th>
          <th class="num" style="width: 14%;">المبلغ</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="6" class="center">لا تتوفر مصروفات في هذه الفترة</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="font-bold">إجمالي المصروفات</td>
          <td class="num text-rose-600">${formatMoney(totalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تقرير المصروفات - نظام الوزير للمبيعات والتأجير</div>
      <div>تقرير رسمي صادر من النظام الآلي</div>
    </div>
  `;

  return wrapHtml(`تقرير المصروفات - ${period}`, bodyContent);
}

/**
 * 9. Financial Summary PDF HTML
 */
function generateSummaryPdfHtml(summaryData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || (summaryData.date_from && summaryData.date_to ? `${summaryData.date_from} إلى ${summaryData.date_to}` : (summaryData.month || '-'));
  const cairoTime = formatCairoDateTime();

  const rev = Number(summaryData.revenue || summaryData.total_revenue || 0);
  const cogs = Number(summaryData.cogs || 0);
  const gp = Number(summaryData.gross_profit || (rev - cogs));
  const exp = Number(summaryData.expenses || 0);
  const sal = Number(summaryData.salaries || summaryData.total_salaries_paid || 0);
  const np = Number(summaryData.net_profit || (gp - exp - sal));
  const margin = rev > 0 ? (np / rev) * 100 : 0;
  const cash = Number(summaryData.cash_drawer || 0);

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير الملخص المالي التنفيذي</h1>
        <div class="subtitle">الموقف المالي العام والإيرادات والمصروفات وصافي الأرباح</div>
      </div>
      <div class="meta-badge">
        <div><strong>الفرع / النطاق:</strong> ${branchName}</div>
        <div><strong>الفترة:</strong> ${period}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي الإيرادات</div>
        <div class="kpi-value text-emerald-600">${formatMoney(rev)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">تكلفة البضاعة المباعة</div>
        <div class="kpi-value">${formatMoney(cogs)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المصروفات والرواتب</div>
        <div class="kpi-value text-rose-600">${formatMoney(exp + sal)}</div>
      </div>
      <div class="kpi-card ${np >= 0 ? 'highlight' : ''}" style="${np < 0 ? 'background: #fff1f2; border-color: #fecdd3;' : ''}">
        <div class="kpi-title">صافي الربح (\u200E${margin.toFixed(1)}%)</div>
        <div class="kpi-value ${np >= 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatMoney(np)}</div>
      </div>
    </div>

    <table style="margin-top: 15px;">
      <thead>
        <tr>
          <th style="width: 45%;">البند المالي</th>
          <th class="num" style="width: 25%;">القيمة المحققة</th>
          <th style="width: 30%;">ملاحظات وتفاصيل البند</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="font-bold">مبيعات الكاشير (صافي بعد المرتجعات)</td>
          <td class="num">${formatMoney(summaryData.sales || summaryData.total_sales || 0)}</td>
          <td>صافي إيرادات فواتير البيع</td>
        </tr>
        <tr>
          <td class="font-bold">متحصلات التأجير والغرامات</td>
          <td class="num">${formatMoney(summaryData.rentals || summaryData.total_rentals || 0)}</td>
          <td>عقود التأجير وغرامات التأخير</td>
        </tr>
        <tr>
          <td class="font-bold">متحصلات التفصيل والتعديلات</td>
          <td class="num">${formatMoney(summaryData.tailoring || summaryData.total_tailoring || 0)}</td>
          <td>مدفوعات التفصيل المحصلة</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td class="font-bold text-emerald-800">إجمالي الإيرادات الكلية</td>
          <td class="num font-bold text-emerald-800">${formatMoney(rev)}</td>
          <td>المبيعات + التأجير + التفصيل</td>
        </tr>
        <tr>
          <td class="font-bold">تكلفة البضاعة المباعة (COGS)</td>
          <td class="num">${formatMoney(cogs)}</td>
          <td>تكلفة البضاعة المباعة المباشرة</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td class="font-bold">مجمل الربح (Gross Profit)</td>
          <td class="num font-bold">${formatMoney(gp)}</td>
          <td>الإيرادات - تكلفة البضاعة</td>
        </tr>
        <tr>
          <td class="font-bold">المصروفات التشغيلية والنثريات</td>
          <td class="num text-rose-600">${formatMoney(exp)}</td>
          <td>مصاريف التشغيل والمرافق والصيانة</td>
        </tr>
        <tr>
          <td class="font-bold">الرواتب والأجور المسددة</td>
          <td class="num text-rose-600">${formatMoney(sal)}</td>
          <td>صافي حركات رواتب الموظفين</td>
        </tr>
        <tr style="background: #f1f5f9; font-size: 10pt;">
          <td class="font-bold" style="border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">صافي الربح النهائي</td>
          <td class="num font-bold ${np >= 0 ? 'text-emerald-700' : 'text-rose-600'}" style="border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">${formatMoney(np)}</td>
          <td style="border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">هامش الربح: \u200E${margin.toFixed(1)}%</td>
        </tr>
        <tr>
          <td class="font-bold">صافي الكاش المحصل بالدرج والخزينة</td>
          <td class="num font-bold">${formatMoney(cash)}</td>
          <td>النقدية الفعلية المحصلة بالخزينة</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <div>الملخص المالي التنفيذي - نظام الوزير للمبيعات والتأجير</div>
      <div>تقرير رسمي صادر من النظام الآلي</div>
    </div>
  `;

  return wrapHtml(`الملخص المالي التنفيذي - ${period}`, bodyContent);
}

/**
 * 10. Inventory Valuation & Stock PDF HTML
 */
function generateInventoryPdfHtml(inventoryData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const cairoTime = formatCairoDateTime();

  const items = Array.isArray(inventoryData.items) ? inventoryData.items : [];
  const summary = inventoryData.summary || {};

  let totalQty = 0;
  let totalRetail = 0;
  let totalCost = 0;
  const canSeeCost = summary.total_cost_value !== null && summary.total_cost_value !== undefined;

  const rowsHtml = items.map((item) => {
    const qty = Number(item.stock_level || 0);
    const price = Number(item.price || 0);
    const cost = item.cost_price !== null && item.cost_price !== undefined ? Number(item.cost_price || 0) : null;
    const retailVal = qty * price;
    const costVal = cost !== null ? qty * cost : null;

    totalQty += qty;
    totalRetail += retailVal;
    if (costVal !== null) totalCost += costVal;

    return `
      <tr>
        <td class="center font-bold">#${item.id}</td>
        <td class="font-bold">${item.name}</td>
        <td class="center">${item.barcode ? `#${item.barcode}` : '-'}</td>
        <td class="center">${item.category || 'عام'}</td>
        <td class="center font-bold">${qty}</td>
        <td class="num">${formatMoney(price)}</td>
        ${canSeeCost ? `<td class="num">${cost !== null ? formatMoney(cost) : '-'}</td>` : ''}
        <td class="num font-bold">${formatMoney(retailVal)}</td>
        <td class="center">${item.is_low_stock ? '<span style="color: #e11d48; font-weight: bold;">منخفض</span>' : '<span style="color: #15803d;">متوفر</span>'}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير جرد وتقييم المخزون</h1>
        <div class="subtitle">بيان رصيد البضاعة بالمخازن وتقييمها المالي</div>
      </div>
      <div class="meta-badge">
        <div><strong>الفرع / النطاق:</strong> ${branchName}</div>
        <div><strong>تاريخ الاستخراج:</strong> ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">إجمالي الأصناف</div>
        <div class="kpi-value">${Number(summary.total_items || items.length).toLocaleString('en-US')}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي كميات القطع</div>
        <div class="kpi-value">${Number(summary.total_quantity || totalQty).toLocaleString('en-US')} قطعة</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-title">القيمة بسعر البيع</div>
        <div class="kpi-value text-emerald-600">${formatMoney(summary.total_retail_value || totalRetail)}</div>
      </div>
      ${canSeeCost ? `
        <div class="kpi-card">
          <div class="kpi-title">القيمة بسعر التكلفة</div>
          <div class="kpi-value text-indigo-700">${formatMoney(summary.total_cost_value || totalCost)}</div>
        </div>
      ` : `
        <div class="kpi-card" style="${summary.low_stock_count > 0 ? 'background: #fff1f2; border-color: #fecdd3;' : ''}">
          <div class="kpi-title">الأصناف المنخفضة</div>
          <div class="kpi-value ${summary.low_stock_count > 0 ? 'text-rose-600' : ''}">${summary.low_stock_count || 0}</div>
        </div>
      `}
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 8%;">الكود</th>
          <th style="width: 25%;">اسم المنتج</th>
          <th class="center" style="width: 12%;">الباركود</th>
          <th class="center" style="width: 12%;">القسم</th>
          <th class="center" style="width: 9%;">الرصيد</th>
          <th class="num" style="width: 12%;">سعر البيع</th>
          ${canSeeCost ? '<th class="num" style="width: 11%;">سعر التكلفة</th>' : ''}
          <th class="num" style="width: 14%;">إجمالي البيع</th>
          <th class="center" style="width: 8%;">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="9" class="center">لا تتوفر منتجات مسجلة بالمخزون</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" class="font-bold">الإجمالي العام</td>
          <td class="center font-bold">${totalQty}</td>
          <td></td>
          ${canSeeCost ? `<td></td>` : ''}
          <td class="num font-bold text-emerald-700">${formatMoney(totalRetail)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تقرير جرد المخزون - نظام الوزير للمبيعات والتأجير</div>
      <div>تقرير رسمي صادر من النظام الآلي</div>
    </div>
  `;

  return wrapHtml('تقرير جرد وتقييم المخزون', bodyContent);
}


/**
 * 13. OHDA Report PDF HTML
 */
function generateOhdaPdfHtml(ohdaData, options = {}) {
  const branchName = options.branchName || (ohdaData.branch_name || 'فرع الرمل');
  const period = options.period || (ohdaData.month || '-');
  const cairoTime = formatCairoDateTime();
  const employees = ohdaData.employees || [];
  const summary = ohdaData.summary || {
    total_employees: employees.length,
    total_attendance: employees.reduce((s, e) => s + (e.total_attendance || 0), 0),
    total_advances_1_10: employees.reduce((s, e) => s + (e.advances_1_to_10 || 0), 0),
    total_advances_11_20: employees.reduce((s, e) => s + (e.advances_11_to_20 || 0), 0),
    total_advances_21_31: employees.reduce((s, e) => s + (e.advances_21_to_31 || 0), 0),
    total_advances: employees.reduce((s, e) => s + (e.total_advances || 0), 0),
  };

  const tableRows = employees.map((emp, idx) => `
    <tr>
      <td class="center font-bold">${idx + 1}</td>
      <td class="font-bold">${emp.employee_name || '-'}</td>
      <td class="center font-bold text-indigo-700">${emp.total_attendance || 0}</td>
      <td class="num text-rose-600">${formatMoney(emp.advances_1_to_10 || 0)}</td>
      <td class="num text-rose-600">${formatMoney(emp.advances_11_to_20 || 0)}</td>
      <td class="num text-rose-600">${formatMoney(emp.advances_21_to_31 || 0)}</td>
      <td class="num font-black text-rose-700 bg-rose-50">${formatMoney(emp.total_advances || 0)}</td>
      <td class="num font-bold">${formatMoney(emp.daily_rate || 0)}</td>
      <td class="num font-black text-emerald-800 bg-emerald-50">${formatMoney(emp.basic_salary || 0)}</td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير العهدة وحضور وسلف الموظفين (OHDA)</h1>
        <div class="subtitle">متابعة السلف الدورية ومجموع الحضور الشهري لكل موظف</div>
      </div>
      <div class="meta-badge">
        <div>الفرع: <strong>${branchName}</strong></div>
        <div>الشهر: <strong>${period}</strong></div>
        <div>وقت الطباعة: ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي سلف الشهر المسحوبة</div>
        <div class="kpi-value text-rose-700">${formatMoney(summary.total_advances || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">سلف (من 1 إلى 10)</div>
        <div class="kpi-value">${formatMoney(summary.total_advances_1_10 || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">سلف (من 11 إلى 20)</div>
        <div class="kpi-value">${formatMoney(summary.total_advances_11_20 || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">سلف (من 21 إلى 31)</div>
        <div class="kpi-value">${formatMoney(summary.total_advances_21_31 || 0)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>اسم الموظف</th>
          <th>أيام الحضور</th>
          <th>سلف (1 إلى 10)</th>
          <th>سلف (11 إلى 20)</th>
          <th>سلف (21 إلى 31)</th>
          <th>مجمع السلف</th>
          <th>اليومية التقديرية</th>
          <th>توتال الشهر</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="9" class="center">لا توجد بيانات</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="font-black bg-slate-100">
          <td colspan="2" class="center">الإجمالي</td>
          <td class="center">${employees.reduce((sum, e) => sum + Number(e.total_attendance || 0), 0)}</td>
          <td class="num text-rose-600">${formatMoney(summary.total_advances_1_10 || 0)}</td>
          <td class="num text-rose-600">${formatMoney(summary.total_advances_11_20 || 0)}</td>
          <td class="num text-rose-600">${formatMoney(summary.total_advances_21_31 || 0)}</td>
          <td class="num font-black text-rose-800 bg-rose-100">${formatMoney(summary.total_advances || 0)}</td>
          <td>-</td>
          <td class="num font-black text-emerald-900 bg-emerald-100">${formatMoney(employees.reduce((sum, e) => sum + Number(e.basic_salary || 0), 0))}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>كشف عهدة وسلف الموظفين - نظام الوزير</div>
      <div>توقيع مسؤول الفرع: _______________________</div>
    </div>
  `;

  return wrapHtml('تقرير العهدة وحضور وسلف الموظفين', bodyContent, { orientation: 'landscape' });
}

/**
 * 14. SALARY Report PDF HTML
 */
function generateSalaryPdfHtml(salaryData, options = {}) {
  const branchName = options.branchName || (salaryData.branch_name || 'فرع الرمل');
  const period = options.period || (salaryData.month || '-');
  const cairoTime = formatCairoDateTime();
  const employees = salaryData.employees || [];
  const summary = salaryData.summary || {
    total_employees: employees.length,
    total_basic_salaries: employees.reduce((s, e) => s + (e.basic_salary || 0), 0),
    total_gross_salaries: employees.reduce((s, e) => s + (e.gross_salary || 0), 0),
    total_net_salary: employees.reduce((s, e) => s + (e.net_salary || 0), 0),
    total_advances: employees.reduce((s, e) => s + (e.advances || 0), 0),
    total_absent_deductions: employees.reduce((s, e) => s + (e.absent_deduction || 0), 0),
    total_leave_deductions: employees.reduce((s, e) => s + (e.leave_deduction || 0), 0),
    total_delay_deductions: employees.reduce((s, e) => s + (e.delay_deduction || 0), 0),
  };

  const tableRows = employees.map((emp, idx) => `
    <tr>
      <td class="center font-mono">${idx + 1}</td>
      <td class="font-bold text-right" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${emp.employee_name || '-'}</td>
      <td class="center font-mono">${Number(emp.actual_hours || 0).toFixed(1)}</td>
      <td class="center font-mono">${emp.required_hours || 268}</td>
      <td class="center text-rose-600 font-mono">${emp.delay_hours > 0 ? emp.delay_hours.toFixed(1) : '-'}</td>
      <td class="center text-emerald-600 font-mono">${emp.overtime_hours > 0 ? emp.overtime_hours.toFixed(1) : '-'}</td>
      <td class="num">${formatCompactNumber(emp.basic_salary)}</td>
      <td class="num">${formatCompactNumber(emp.daily_rate)}</td>
      <td class="num font-bold">${formatCompactNumber(emp.gross_salary)}</td>
      <td class="num text-rose-600">${formatCompactNumber(emp.advances, true)}</td>
      <td class="num text-rose-600">${formatCompactNumber(emp.absent_deduction, true)}</td>
      <td class="num text-rose-600">${formatCompactNumber(emp.leave_deduction, true)}</td>
      <td class="num text-rose-600">${formatCompactNumber(emp.delay_deduction, true)}</td>
      <td class="num font-black text-emerald-800" style="background: #f0fdf4 !important;">${formatCompactNumber(emp.net_salary)}</td>
      <td class="center font-mono" style="border-right: 1px dashed #cbd5e1;"></td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>مسير رواتب ومستحقات العاملين (SALARY)</h1>
        <div class="subtitle">كشف تفصيلي بالساعات المحققة، البدلات، الخصومات وصافي القبض (كافة المبالغ بالجنيه المصري ج.م)</div>
      </div>
      <div class="meta-badge">
        <div>الفرع: <strong>${branchName}</strong></div>
        <div>الشهر: <strong>${period}</strong></div>
        <div>تاريخ الاستخراج: ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي صافي المرتبات للتسليم</div>
        <div class="kpi-value">${formatMoney(summary.total_net_salary || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي السلف المستقطعة</div>
        <div class="kpi-value text-rose-600">${formatMoney(summary.total_advances || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي الخصومات والجزاءات</div>
        <div class="kpi-value text-rose-600">${formatMoney((summary.total_absent_deductions || 0) + (summary.total_delay_deductions || 0))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">عدد الموظفين بالمسير</div>
        <div class="kpi-value">${employees.length}</div>
      </div>
    </div>

    <table class="salary-table">
      <colgroup>
        <col style="width: 3%;" />
        <col style="width: 14%;" />
        <col style="width: 6%;" />
        <col style="width: 5%;" />
        <col style="width: 5%;" />
        <col style="width: 5%;" />
        <col style="width: 7%;" />
        <col style="width: 6%;" />
        <col style="width: 8%;" />
        <col style="width: 6%;" />
        <col style="width: 6%;" />
        <col style="width: 6%;" />
        <col style="width: 6%;" />
        <col style="width: 9%;" />
        <col style="width: 8%;" />
      </colgroup>
      <thead>
        <tr>
          <th>#</th>
          <th>اسم الموظف</th>
          <th>ساعات فعلية</th>
          <th>مطلوب</th>
          <th>تأخير</th>
          <th>إضافي</th>
          <th>الأساسي</th>
          <th>اليومية</th>
          <th>الإجمالي المستحق</th>
          <th>سلف</th>
          <th>خصم غياب</th>
          <th>إجازات زائدة</th>
          <th>خصم تأخير</th>
          <th style="background: #15803d !important; color: #fff !important;">صافي القبض</th>
          <th>توقيع الاستلام</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="15" class="center">لا توجد بيانات موظفين</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="font-black bg-slate-100">
          <td colspan="6" class="center">الإجماليات</td>
          <td class="num">${formatCompactNumber(summary.total_basic_salaries)}</td>
          <td>-</td>
          <td class="num font-bold">${formatCompactNumber(summary.total_gross_salaries)}</td>
          <td class="num text-rose-600">${formatCompactNumber(summary.total_advances, true)}</td>
          <td class="num text-rose-600">${formatCompactNumber(summary.total_absent_deductions, true)}</td>
          <td class="num text-rose-600">${formatCompactNumber(summary.total_leave_deductions, true)}</td>
          <td class="num text-rose-600">${formatCompactNumber(summary.total_delay_deductions, true)}</td>
          <td class="num font-black text-emerald-900" style="background: #bbf7d0 !important;">${formatCompactNumber(summary.total_net_salary)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>مسير الرواتب - نظام الوزير لإدارة الفروع</div>
      <div>اعتماد الإدارة: _______________________</div>
    </div>
  `;

  return wrapHtml('مسير الرواتب والمستحقات الشهرية', bodyContent, { orientation: 'landscape' });
}

/**
 * 15. KPI Report PDF HTML
 */
function generateKpiPdfHtml(kpiData, options = {}) {
  const branchName = options.branchName || (kpiData.branch_name || 'فرع الرمل');
  const period = options.period || (kpiData.month || '-');
  const cairoTime = formatCairoDateTime();
  const summary = kpiData.summary || {};
  const sellers = kpiData.sellers || [];

  const tableRows = sellers.map((s, idx) => `
    <tr>
      <td class="center font-bold">${idx + 1}</td>
      <td class="font-bold">${s.seller_name || '-'}</td>
      <td class="num font-black text-emerald-700">${formatMoney(s.total_sales || 0)}</td>
      <td class="num font-bold">${formatMoney(s.target || 0)}</td>
      <td class="center font-black" style="color: ${Number(s.achievement_percentage || 0) >= 100 ? '#15803d' : '#4f46e5'};">
        ${Number(s.achievement_percentage || 0).toFixed(1)}%
      </td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير أداء وتقييم البائعين (KPI)</h1>
        <div class="subtitle">متابعة مبيعات البائعين ونسب تحقيق المستهدفات الشهرية</div>
      </div>
      <div class="meta-badge">
        <div>الفرع: <strong>${branchName}</strong></div>
        <div>الشهر: <strong>${period}</strong></div>
        <div>وقت الطباعة: ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي المبيعات المحققة</div>
        <div class="kpi-value">${formatMoney(summary.total_sales || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">عدد البائعين</div>
        <div class="kpi-value">${summary.active_sellers || sellers.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">متوسط تحقيق المستهدف</div>
        <div class="kpi-value">${Number(summary.average_achievement || 0).toFixed(1)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">أعلى بائع مبيعاً</div>
        <div class="kpi-value" style="font-size: 11pt;">${summary.top_seller?.name || '-'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 50px;">#</th>
          <th>اسم البائع</th>
          <th>المبيعات المحققة</th>
          <th>المستهدف (التارجت)</th>
          <th>نسبة الإنجاز</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="5" class="center">لا توجد بيانات</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="font-black bg-slate-100">
          <td colspan="2" class="center">الإجمالي</td>
          <td class="num font-black text-emerald-800">${formatMoney(summary.total_sales || 0)}</td>
          <td class="num">${formatMoney(sellers.reduce((sum, s) => sum + Number(s.target || 0), 0))}</td>
          <td class="center">${Number(summary.average_achievement || 0).toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>تقرير تقييم البائعين - نظام الوزير</div>
      <div>تقرير رسمي معتمد</div>
    </div>
  `;

  return wrapHtml('تقرير تقييم وأداء البائعين', bodyContent);
}

/**
 * 16. Consolidated Branch Overview & Master Sheet PDF HTML
 */
function generateConsolidatedPdfHtml(data, options = {}) {
  const isAll = options.branchName === 'كل الفروع' || options.branchName === 'all' || data?.branch_id === 'all' || data?.branch_clean_name === 'كل الفروع' || data?.branch_name === 'كل الفروع';
  const cleanName = isAll ? 'كل الفروع' : (data?.branch_clean_name || data?.branding?.cleanName || options.branchName || 'الرمل');
  const branchName = isAll ? 'كل الفروع' : (options.branchName || data?.branch_name || data?.branding?.branchName || (cleanName.startsWith('فرع') ? cleanName : `فرع ${cleanName}`));
  const period = options.period || data?.month || '-';
  const cairoTime = formatCairoDateTime();
  const { ohda, salary, kpi, days, summary = {} } = data || {};
  const logoDataUri = options.branding?.logoDataUri || data?.branding?.logoDataUri || '';
  let rawTitle = isAll
    ? 'كل الفروع'
    : (data?.report_title || data?.branding?.titles?.master || branchName);
  const displayTitle = isAll
    ? 'كل الفروع'
    : (rawTitle
        .replace(/^التقرير\s+الشهري\s+المجمع\s+لبيبيون\s+/gi, '')
        .replace(/^التقرير\s+المجمع\s+لبيبيون\s+/gi, '')
        .replace(/^التقرير\s+اليومي\s+لبيبيون(\s*[-–]\s*)?/gi, '')
        .replace(/^التقرير\s+اليومي(\s*[-–]\s*)?/gi, '')
        .replace(/^بيبيون\s+للبدل\s+الرجالي(\s*[-–]\s*)?/gi, '')
        .replace(/^بيبيون\s+فرع\s+/gi, 'فرع ')
        .replace(/^بيبيون\s+/gi, '')
        .trim() || branchName);

  const bodyContent = `
    <div class="header">
      <div style="display: flex; align-items: center; gap: 14px;">
        ${logoDataUri ? `
          <img src="${logoDataUri}" alt="Logo" style="height: 52px; width: auto; max-width: 120px; object-fit: contain; border-radius: 8px; border: 1px solid #cbd5e1; padding: 2px; background: #fff;" />
        ` : ''}
        <div class="title-area">
          <h1 style="font-size: 16pt; margin: 0; color: #0f172a;">${displayTitle}</h1>
          <div class="subtitle" style="font-size: 9pt; color: #475569; margin-top: 3px;">
            المجمع الشهري لحركة التشغيل والمبيعات والعهد ومسير الرواتب وتقفيل الدرج اليومي لشهر ${period}
          </div>
        </div>
      </div>
      <div class="meta-badge" style="font-size: 8.5pt; text-align: left;">
        <div>الفرع: <strong>${branchName}</strong></div>
        <div>الشهر: <strong>${period}</strong></div>
        <div>وقت الطباعة: ${cairoTime}</div>
      </div>
    </div>

    <!-- Monthly Grand KPI Cards -->
    <div class="kpi-grid" style="grid-template-columns: repeat(6, 1fr); margin-bottom: 18px;">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي مبيعات الشهر</div>
        <div class="kpi-value text-emerald-700">${formatMoney(summary.total_sales || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المقبوض كاش (E76)</div>
        <div class="kpi-value text-indigo-700">${formatMoney(summary.total_paid_cash || summary.total_paid || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي السلف (J76)</div>
        <div class="kpi-value text-rose-700">${formatMoney(summary.total_advances || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">المصروفات والتشغيل (L76)</div>
        <div class="kpi-value text-amber-700">${formatMoney(summary.total_expenses || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">كاش الدرج للتوريد (D77)</div>
        <div class="kpi-value ${(summary.total_cash_drawer || summary.net_cash_drawer || 0) >= 0 ? 'text-emerald-800' : 'text-rose-700'} font-black">
          ${formatMoney(summary.total_cash_drawer || summary.net_cash_drawer || 0)}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">مدفوعات إلكترونية (O76)</div>
        <div class="kpi-value text-blue-700">${formatMoney(summary.total_electronic || 0)}</div>
      </div>
    </div>

    <!-- Section 1: Daily Operations Breakdown Table (MASTER SHEET) -->
    ${days && days.length > 0 ? `
      <h3 style="margin-top: 16px; margin-bottom: 8px; font-size: 11pt; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
        1. ملخص حركة العمليات اليومية وتقفيل الدرج (MASTER SHEET):
      </h3>
      <table style="font-size: 8pt; width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #0f172a; color: #fff;">
            <th style="padding: 6px 4px; text-align: center;">اليوم والتاريخ</th>
            <th style="padding: 6px 4px; text-align: center;">المبيعات (D76)</th>
            <th style="padding: 6px 4px; text-align: center;">المقبوض (E76)</th>
            <th style="padding: 6px 4px; text-align: center;">السلف (J76)</th>
            <th style="padding: 6px 4px; text-align: center;">المصروفات (L76)</th>
            <th style="padding: 6px 4px; text-align: center;">إلكتروني (O76)</th>
            <th style="padding: 6px 4px; text-align: center;">المنصرف (K77)</th>
            <th style="padding: 6px 4px; text-align: center;">صافي توريد الدرج (D77)</th>
          </tr>
        </thead>
        <tbody>
          ${days.map(d => {
            const dNetCash = d.summary?.net_cash_drawer ?? (d.data?.summary?.cash_in_drawer || 0);
            return `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 4px 6px; font-weight: bold; text-align: center;">يوم ${d.day} (${d.date})</td>
                <td class="num">${formatMoney(d.summary?.total_sales ?? d.data?.summary?.total_sales ?? 0)}</td>
                <td class="num">${formatMoney(d.summary?.total_paid ?? d.data?.summary?.total_paid ?? 0)}</td>
                <td class="num text-rose-600">${formatMoney(d.summary?.total_advances ?? d.data?.summary?.total_advances ?? 0)}</td>
                <td class="num text-amber-700">${formatMoney(d.summary?.total_expenses ?? d.data?.summary?.total_expenses ?? 0)}</td>
                <td class="num text-blue-600">${formatMoney(d.summary?.total_electronic ?? d.data?.summary?.electronic_collections ?? 0)}</td>
                <td class="num text-rose-700 font-bold">${formatMoney(d.summary?.total_drawer_deductions ?? 0)}</td>
                <td class="num font-black ${dNetCash >= 0 ? 'text-emerald-800' : 'text-rose-700'}">${formatMoney(dNetCash)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; font-weight: 900; border-top: 2px solid #94a3b8;">
            <td style="padding: 6px 6px; text-align: center;">الإجمالي الشهري (Totals)</td>
            <td class="num font-black">${formatMoney(summary.total_sales || 0)}</td>
            <td class="num font-black text-indigo-900">${formatMoney(summary.total_paid_cash || summary.total_paid || 0)}</td>
            <td class="num font-black text-rose-800">${formatMoney(summary.total_advances || 0)}</td>
            <td class="num font-black text-amber-800">${formatMoney(summary.total_expenses || 0)}</td>
            <td class="num font-black text-blue-800">${formatMoney(summary.total_electronic || 0)}</td>
            <td class="num font-black text-rose-900">${formatMoney(summary.total_drawer_deductions || 0)}</td>
            <td class="num font-black text-emerald-900">${formatMoney(summary.total_cash_drawer || summary.net_cash_drawer || 0)}</td>
          </tr>
        </tfoot>
      </table>
    ` : ''}

    <!-- Section 2: Payroll Summary (SALARY) -->
    <h3 style="margin-top: 16px; margin-bottom: 8px; font-size: 11pt; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
      2. مسير رواتب الموظفين (SALARY Sheet):
    </h3>
    <table style="font-size: 8pt; width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: #1e293b; color: #fff;">
          <th style="padding: 6px 4px; text-align: center;">اسم الموظف</th>
          <th style="padding: 6px 4px; text-align: center;">ساعات فعلية</th>
          <th style="padding: 6px 4px; text-align: center;">تأخير</th>
          <th style="padding: 6px 4px; text-align: center;">إضافي</th>
          <th style="padding: 6px 4px; text-align: center;">الأساسي</th>
          <th style="padding: 6px 4px; text-align: center;">اليومية</th>
          <th style="padding: 6px 4px; text-align: center;">السلف</th>
          <th style="padding: 6px 4px; text-align: center;">استقطاع الغياب</th>
          <th style="padding: 6px 4px; text-align: center;">استقطاع إجازات</th>
          <th style="padding: 6px 4px; text-align: center;">صافي القبض</th>
        </tr>
      </thead>
      <tbody>
        ${(salary?.employees || []).map(e => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 4px 6px; font-weight: bold;">${e.employee_name || '-'}</td>
            <td class="center">${Number(e.actual_hours || 0).toFixed(1)}</td>
            <td class="center text-rose-600">${e.delay_hours > 0 ? e.delay_hours.toFixed(1) : '-'}</td>
            <td class="center text-emerald-600">${e.overtime_hours > 0 ? e.overtime_hours.toFixed(1) : '-'}</td>
            <td class="num">${formatMoney(e.basic_salary || 0)}</td>
            <td class="num">${formatMoney(e.daily_rate || 0)}</td>
            <td class="num text-rose-600">${formatMoney(e.advances || 0)}</td>
            <td class="num text-rose-600">${formatMoney(e.absent_deduction || 0)}</td>
            <td class="num text-rose-600">${formatMoney(e.leave_deduction || 0)}</td>
            <td class="num font-black text-emerald-800">${formatMoney(e.net_salary || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: 900; border-top: 2px solid #94a3b8;">
          <td style="padding: 6px 6px; text-align: center;">الإجمالي</td>
          <td colspan="3"></td>
          <td class="num">${formatMoney((salary?.employees || []).reduce((sum, e) => sum + Number(e.basic_salary || 0), 0))}</td>
          <td></td>
          <td class="num text-rose-700">${formatMoney((salary?.employees || []).reduce((sum, e) => sum + Number(e.advances || 0), 0))}</td>
          <td class="num text-rose-700">${formatMoney((salary?.employees || []).reduce((sum, e) => sum + Number(e.absent_deduction || 0), 0))}</td>
          <td class="num text-rose-700">${formatMoney((salary?.employees || []).reduce((sum, e) => sum + Number(e.leave_deduction || 0), 0))}</td>
          <td class="num font-black text-emerald-900">${formatMoney(salary?.summary?.total_net_salary || 0)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Section 3: Seller KPI Summary (KPI) -->
    <h3 style="margin-top: 16px; margin-bottom: 8px; font-size: 11pt; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">
      3. تقييم وأداء البائعين (KPI Sheet):
    </h3>
    <table style="font-size: 8pt; width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #1e293b; color: #fff;">
          <th style="padding: 6px 4px; text-align: center;">اسم البائع</th>
          <th style="padding: 6px 4px; text-align: center;">المبيعات المحققة</th>
          <th style="padding: 6px 4px; text-align: center;">التارجت</th>
          <th style="padding: 6px 4px; text-align: center;">نسبة الإنجاز</th>
        </tr>
      </thead>
      <tbody>
        ${(kpi?.sellers || []).map(s => `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 4px 6px; font-weight: bold;">${s.seller_name || '-'}</td>
            <td class="num font-bold text-emerald-700">${formatMoney(s.total_sales || 0)}</td>
            <td class="num">${formatMoney(s.target || 0)}</td>
            <td class="center font-black">${Number(s.achievement_percentage || 0).toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: 900; border-top: 2px solid #94a3b8;">
          <td style="padding: 6px 6px; text-align: center;">الإجمالي</td>
          <td class="num text-emerald-800">${formatMoney(kpi?.summary?.total_sales || 0)}</td>
          <td class="num">${formatMoney((kpi?.sellers || []).reduce((sum, s) => sum + Number(s.target || 0), 0))}</td>
          <td class="center font-black">${Number(kpi?.summary?.average_achievement || 0).toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer" style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 8px;">
      <div>الملف المجمع للفرع (MASTER SHEET) - نظام الوزير لإدارة الفروع ونقاط البيع</div>
      <div>تقرير مالي رسمي معتمد ومطابق لدفاتر التفتيش</div>
    </div>
  `;

  return wrapHtml(displayTitle, bodyContent, { orientation: 'landscape' });
}

/**
 * 17. Suppliers Ledger Overview PDF HTML
 */
function generateSuppliersLedgerPdfHtml(ledgerData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || 'كافة الفترات (تراكمي)';
  const cairoTime = formatCairoDateTime();
  const summary = ledgerData?.summary || {};
  const suppliers = ledgerData?.suppliers || [];

  const grandPurchases = Number(summary.grand_total_purchases || 0);
  const grandReturns = Number(summary.grand_total_returns || 0);
  const grandPaid = Number(summary.grand_total_paid || 0);
  const grandBalance = Number(summary.grand_total_balance || 0);

  const tableRows = suppliers.map((s, idx) => {
    const bal = Number(s.total_balance ?? s.balance ?? 0);
    const balType = s.balance_type || (bal > 0 ? 'له' : (bal < 0 ? 'عليه' : 'خالص'));
    return `
      <tr>
        <td class="center font-mono">${idx + 1}</td>
        <td class="center font-mono">${s.code || '-'}</td>
        <td class="font-bold text-right">${s.name || '-'}</td>
        <td class="center font-mono">${s.phone || '-'}</td>
        <td class="center">${s.gender_category || s.category || 'عام'}</td>
        <td class="num">${formatMoney(s.total_purchases || 0)}</td>
        <td class="num text-amber-700">${formatMoney(s.total_returns || 0)}</td>
        <td class="num text-blue-700">${formatMoney(s.total_paid || 0)}</td>
        <td class="num font-black ${bal > 0 ? 'text-rose-700' : 'text-emerald-700'}">${formatMoney(bal)}</td>
        <td class="center font-bold">${balType}</td>
      </tr>
    `;
  }).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>سجل وكشوف حسابات الموردين التراكمية</h1>
        <div class="subtitle">بيان مالي تفصيلي لحسابات الموردين، التوريدات، المرتجعات وصافي الأرصدة المستحقة</div>
      </div>
      <div class="meta-badge">
        <div>النطاق: <strong>${branchName}</strong></div>
        <div>الفترة: <strong>${period}</strong></div>
        <div>تاريخ الاستخراج: ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي المشتريات</div>
        <div class="kpi-value text-emerald-800">${formatMoney(grandPurchases)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المرتجعات</div>
        <div class="kpi-value text-amber-700">${formatMoney(grandReturns)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المسدد</div>
        <div class="kpi-value text-blue-700">${formatMoney(grandPaid)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">صافي الأرصدة المستحقة</div>
        <div class="kpi-value ${grandBalance > 0 ? 'text-rose-700' : 'text-emerald-700'} font-black">${formatMoney(grandBalance)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 4%;">#</th>
          <th class="center" style="width: 8%;">كود المورد</th>
          <th style="width: 22%;">اسم المورد</th>
          <th class="center" style="width: 11%;">رقم الهاتف</th>
          <th class="center" style="width: 9%;">التصنيف</th>
          <th class="center" style="width: 11%;">المشتريات</th>
          <th class="center" style="width: 10%;">المرتجعات</th>
          <th class="center" style="width: 11%;">المسدد</th>
          <th class="center" style="width: 11%;">الرصيد المستحق</th>
          <th class="center" style="width: 6%;">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="10" class="center">لا تتوفر بيانات موردين</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="center font-black">الإجمالي العام</td>
          <td class="num font-black">${formatMoney(grandPurchases)}</td>
          <td class="num font-black text-amber-700">${formatMoney(grandReturns)}</td>
          <td class="num font-black text-blue-700">${formatMoney(grandPaid)}</td>
          <td class="num font-black ${grandBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}">${formatMoney(grandBalance)}</td>
          <td class="center font-black">${summary.grand_total_balance_type || '-'}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>دفتر أستاذ الموردين - نظام الوزير لإدارة نقاط البيع</div>
      <div>وثيقة مالية رسمية معتمدة</div>
    </div>
  `;

  return wrapHtml('سجل حسابات الموردين', bodyContent, { orientation: 'landscape' });
}

/**
 * 18. Supplier Statement PDF HTML
 */
function generateSupplierStatementPdfHtml(statementData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || 'كافة الفترات';
  const cairoTime = formatCairoDateTime();
  const supplier = statementData?.supplier || {};
  const transactions = statementData?.transactions || statementData?.ledger || [];
  const summary = statementData?.summary || {};

  const totalPurchases = Number(summary.total_purchases || 0);
  const totalPaid = Number(summary.total_paid || 0);
  const totalReturns = Number(summary.total_returns || 0);
  const closingBalance = Number(summary.closing_balance ?? summary.balance ?? 0);

  const txRows = transactions.map((t, idx) => `
    <tr>
      <td class="center font-mono">${idx + 1}</td>
      <td class="center font-mono">${t.date ? String(t.date).slice(0, 10) : '-'}</td>
      <td class="center font-mono">${t.reference_number || t.invoice_number || '-'}</td>
      <td class="font-bold">${t.transaction_type_label || t.type || '-'}</td>
      <td class="text-right">${t.notes || t.description || '-'}</td>
      <td class="num">${Number(t.debit || 0) > 0 ? formatMoney(t.debit) : '-'}</td>
      <td class="num text-blue-700">${Number(t.credit || 0) > 0 ? formatMoney(t.credit) : '-'}</td>
      <td class="num font-black">${formatMoney(t.running_balance ?? t.balance ?? 0)}</td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>كشف حساب مورد تفصيلي</h1>
        <div class="subtitle">المورد: ${supplier.name || '-'} | الكود: #${supplier.code || supplier.id || '-'} | الهاتف: ${supplier.phone || '-'}</div>
      </div>
      <div class="meta-badge">
        <div>النطاق: <strong>${branchName}</strong></div>
        <div>الفترة: <strong>${period}</strong></div>
        <div>تاريخ الاستخراج: ${cairoTime}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card highlight">
        <div class="kpi-title">إجمالي المشتريات</div>
        <div class="kpi-value text-emerald-800">${formatMoney(totalPurchases)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المسدد</div>
        <div class="kpi-value text-blue-700">${formatMoney(totalPaid)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">إجمالي المرتجعات</div>
        <div class="kpi-value text-amber-700">${formatMoney(totalReturns)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">الرصيد الختامي المستحق</div>
        <div class="kpi-value ${closingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'} font-black">${formatMoney(closingBalance)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 4%;">#</th>
          <th class="center" style="width: 10%;">التاريخ</th>
          <th class="center" style="width: 12%;">رقم المرجع / الفاتورة</th>
          <th class="center" style="width: 12%;">نوع الحركة</th>
          <th style="width: 26%;">البيان / الملاحظات</th>
          <th class="center" style="width: 12%;">مدين (توريدات)</th>
          <th class="center" style="width: 12%;">دائن (سداد/مرتجع)</th>
          <th class="center" style="width: 12%;">الرصيد التراكمي</th>
        </tr>
      </thead>
      <tbody>
        ${txRows || '<tr><td colspan="8" class="center">لا تتوفر حركات مسجلة لهذا المورد</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="center font-black">الرصيد النهائي</td>
          <td class="num font-black">${formatMoney(totalPurchases)}</td>
          <td class="num font-black text-blue-700">${formatMoney(totalPaid + totalReturns)}</td>
          <td class="num font-black ${closingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}">${formatMoney(closingBalance)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div>كشف حساب مورد - نظام الوزير</div>
      <div>وثيقة محاسبية معتمدة</div>
    </div>
  `;

  return wrapHtml(`كشف حساب مورد - ${supplier.name || ''}`, bodyContent, { orientation: 'landscape' });
}

/**
 * 19. Branch Stock Matrix PDF HTML
 */
function generateBranchMatrixPdfHtml(matrixData, options = {}) {
  const branchName = options.branchName || 'كافة الفروع والمخزن';
  const cairoTime = formatCairoDateTime();
  const rows = matrixData?.rows || matrixData?.items || (Array.isArray(matrixData) ? matrixData : []);

  const tableRows = rows.map((r, idx) => `
    <tr>
      <td class="center font-mono">${idx + 1}</td>
      <td class="font-bold text-right">${r.name || '-'}</td>
      <td class="center font-mono">${r.barcode || '-'}</td>
      <td class="center">${r.category || '-'}</td>
      <td class="center font-mono">${r.gender_category || '-'}</td>
      <td class="center font-bold text-indigo-700">${r.main_stock ?? r.warehouse_stock ?? 0}</td>
      <td class="center font-bold text-emerald-700">${r.branch_stock ?? r.raml_stock ?? 0}</td>
      <td class="center font-black bg-slate-100">${r.total_stock ?? 0}</td>
      <td class="num">${formatMoney(r.price ?? r.sale_price ?? 0)}</td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>تقرير أرصدة البضائع الموزعة بالفروع والمخزن الرئيسي</h1>
        <div class="subtitle">توزيع المخزون بين المخزن المركزي والفروع التشغيلية</div>
      </div>
      <div class="meta-badge">
        <div>النطاق: <strong>${branchName}</strong></div>
        <div>تاريخ الاستخراج: ${cairoTime}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 4%;">#</th>
          <th style="width: 25%;">اسم الصنف</th>
          <th class="center" style="width: 14%;">الباركود</th>
          <th class="center" style="width: 12%;">القسم</th>
          <th class="center" style="width: 9%;">النوع</th>
          <th class="center" style="width: 10%;">المخزن الرئيسي</th>
          <th class="center" style="width: 10%;">فرع الرمل</th>
          <th class="center" style="width: 8%;">إجمالي الرصيد</th>
          <th class="center" style="width: 8%;">سعر البيع</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="9" class="center">لا تتوفر أصناف مسجلة</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <div>تقرير مصفوفة أرصدة الفروع - نظام الوزير</div>
      <div>تقرير رسمي معتمد</div>
    </div>
  `;

  return wrapHtml('مصفوفة أرصدة الفروع والمخزن', bodyContent, { orientation: 'landscape' });
}

/**
 * 20. Stock Transfer Logs PDF HTML
 */
function generateTransferLogsPdfHtml(transferData, options = {}) {
  const branchName = options.branchName || 'كل الفروع';
  const period = options.period || 'كافة الفترات';
  const cairoTime = formatCairoDateTime();
  const logs = transferData?.logs || transferData?.rows || (Array.isArray(transferData) ? transferData : []);

  const tableRows = logs.map((log, idx) => `
    <tr>
      <td class="center font-mono">${idx + 1}</td>
      <td class="center font-mono">${log.created_at ? String(log.created_at).slice(0, 16).replace('T', ' ') : '-'}</td>
      <td class="center font-mono font-bold">${log.transfer_code || `#${log.id}`}</td>
      <td class="center font-bold text-amber-800">${log.from_branch_name || 'المخزن الرئيسي'}</td>
      <td class="center font-bold text-emerald-800">${log.to_branch_name || 'فرع الرمل'}</td>
      <td class="font-bold text-right">${log.product_name || '-'}</td>
      <td class="center font-mono">${log.barcode || '-'}</td>
      <td class="center font-black">${log.quantity || 0}</td>
      <td class="center">${log.created_by_name || log.user_name || '-'}</td>
      <td class="text-right">${log.notes || '-'}</td>
    </tr>
  `).join('');

  const bodyContent = `
    <div class="header">
      <div class="title-area">
        <h1>سجل تحويلات البضائع بين الفروع</h1>
        <div class="subtitle">حركة التحويل والتوريد الداخلي بين المخزن الرئيسي ونقاط البيع</div>
      </div>
      <div class="meta-badge">
        <div>النطاق: <strong>${branchName}</strong></div>
        <div>الفترة: <strong>${period}</strong></div>
        <div>تاريخ الاستخراج: ${cairoTime}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 4%;">#</th>
          <th class="center" style="width: 11%;">تاريخ التحويل</th>
          <th class="center" style="width: 10%;">كود التحويل</th>
          <th class="center" style="width: 11%;">من فرع / مخزن</th>
          <th class="center" style="width: 11%;">إلى فرع</th>
          <th style="width: 18%;">اسم الصنف</th>
          <th class="center" style="width: 11%;">الباركود</th>
          <th class="center" style="width: 6%;">الكمية</th>
          <th class="center" style="width: 8%;">المسؤول</th>
          <th style="width: 10%;">ملاحظات</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="10" class="center">لا تتوفر سجلات تحويل مسجلة</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <div>سجل التحويلات البينية - نظام الوزير</div>
      <div>تقرير رسمي معتمد</div>
    </div>
  `;

  return wrapHtml('سجل تحويلات البضائع بين الفروع', bodyContent, { orientation: 'landscape' });
}

module.exports = {
  BASE_PRINT_CSS,
  wrapHtml,
  generateDailyHistoryPdfHtml,
  generateMonthlyHistoryPdfHtml,
  generateProfitReportPdfHtml,
  generateTopProductsPdfHtml,
  generateDailyDetailsPdfHtml,
  generateSalesPdfHtml,
  generateRentalsPdfHtml,
  generateExpensesPdfHtml,
  generateSummaryPdfHtml,
  generateInventoryPdfHtml,
  generateOhdaPdfHtml,
  generateSalaryPdfHtml,
  generateKpiPdfHtml,
  generateConsolidatedPdfHtml,
  generateSuppliersLedgerPdfHtml,
  generateSupplierStatementPdfHtml,
  generateBranchMatrixPdfHtml,
  generateTransferLogsPdfHtml,
};
