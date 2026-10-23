const assert = require('assert');
const db = require('../src/server/database/connection');
const reportsService = require('../src/server/modules/reports/reports.service');
const reportsExcel = require('../src/server/modules/reports/reports.excel');
const reportsPdf = require('../src/server/modules/reports/reports.pdf');
const { getPaymentMethodArabic } = require('../src/renderer/utils/receiptHelpers');

async function runTests() {
  console.log('=== TEST SUITE: Split Sales Payments in Reports ===\n');

  const adminUser = { id: 1, username: 'admin', role: 'admin' };

  // 1. Verify getSalesReport on existing split orders
  console.log('1. Testing getSalesReport on current date (2026-10-22)...');
  const salesReport = await reportsService.getSalesReport({ date_from: '2026-10-22', date_to: '2026-10-22' }, adminUser);

  console.log('Summary:', salesReport.summary);
  assert(salesReport.summary.total_orders > 0, 'Should have orders today');
  assert(salesReport.summary.cash_paid > 0, 'Cash paid should be > 0');
  assert(salesReport.summary.visa_paid > 0, 'Visa paid should be > 0');
  assert(salesReport.summary.bank_transfer_paid > 0, 'Bank transfer paid should be > 0');

  // Check split orders
  const splitOrders = salesReport.orders.filter(o => o.payment_method === 'split' || (o.payment_splits && o.payment_splits.length > 1));
  console.log(`Found ${splitOrders.length} split orders in salesReport`);
  assert(splitOrders.length >= 3, 'Should find at least 3 split orders today');

  for (const so of splitOrders) {
    console.log(`- Order #${so.invoice_number}: total=${so.total_amount}, paid=${so.paid_amount}, method=${so.payment_method}`);
    console.log('  Splits:', so.payment_splits);
    assert(Array.isArray(so.payment_splits), `Order #${so.invoice_number} should have payment_splits as Array`);
    assert(so.payment_splits.length > 0, `Order #${so.invoice_number} payment_splits should not be empty`);
    
    // Check getPaymentMethodArabic
    const label = getPaymentMethodArabic(so.payment_method, so.payment_splits);
    console.log(`  Arabic Label: "${label}"`);
    assert(label.startsWith('مجزأ ('), `Label should start with مجزأ (, got: ${label}`);
  }
  console.log('✔ getSalesReport assertions passed!\n');

  // 2. Verify getDailyReport
  console.log('2. Testing getDailyReport on current date (2026-10-22)...');
  const dailyReport = await reportsService.getDailyReport({ date: '2026-10-22' }, adminUser);
  console.log('Payment Methods:', dailyReport.payment_methods);
  
  // Verify that 'split' is NOT present as an unnormalized lumped payment method!
  const rawSplit = dailyReport.payment_methods.find(p => p.method === 'split');
  assert(!rawSplit, 'Payment methods should NOT contain a generic "split" method; it should be distributed into actual methods!');
  
  const cashPm = dailyReport.payment_methods.find(p => p.method === 'cash');
  const visaPm = dailyReport.payment_methods.find(p => p.method === 'visa');
  const bankPm = dailyReport.payment_methods.find(p => p.method === 'bank_transfer');
  
  assert(cashPm && cashPm.total_amount > 0, 'Cash payment method total should be > 0');
  assert(visaPm && visaPm.total_amount > 0, 'Visa payment method total should be > 0');
  assert(bankPm && bankPm.total_amount > 0, 'Bank transfer payment method total should be > 0');
  console.log('✔ getDailyReport payment breakdown assertions passed!\n');

  // 3. Verify getExtendedDailyReport
  console.log('3. Testing getExtendedDailyReport on current date (2026-10-22)...');
  const extReport = await reportsService.getExtendedDailyReport({ date: '2026-10-22' }, adminUser);
  const extSplits = extReport.sales_invoices.filter(i => i.payment_method === 'split');
  console.log(`Found ${extSplits.length} split sales invoices in extended daily report`);
  assert(extSplits.length >= 3, 'Should find split sales invoices in extended report');
  for (const s of extSplits) {
    assert(Array.isArray(s.payment_splits), 'Extended sales invoice must have payment_splits array');
    assert(s.payment_splits.length > 0, 'Extended sales invoice payment_splits must not be empty');
  }
  console.log('✔ getExtendedDailyReport assertions passed!\n');

  // 4. Verify reports.excel.js
  console.log('4. Testing Excel generation with split payments...');
  const salesWb = await reportsExcel.generateSalesReportExcel(salesReport, { date_from: '2026-10-22', date_to: '2026-10-22' });
  assert(salesWb, 'SalesReportExcel workbook should be created');
  const dailyWb = await reportsExcel.generateDailyReportExcel(dailyReport, { date: '2026-10-22' });
  assert(dailyWb, 'DailyReportExcel workbook should be created');
  console.log('✔ Excel generation assertions passed!\n');

  // 5. Verify reports.pdf.js HTML templates
  console.log('5. Testing PDF HTML generation with split payments...');
  const salesHtml = reportsPdf.generateSalesPdfHtml(salesReport, { date_from: '2026-10-22', date_to: '2026-10-22' });
  assert(salesHtml && typeof salesHtml === 'string', 'Sales PDF HTML should be created');
  assert(salesHtml.includes('مجزأ ('), 'Sales PDF HTML should contain split breakdown');
  
  const dailyHtml = reportsPdf.generateDailyDetailsPdfHtml(dailyReport, { date: '2026-10-22' });
  assert(dailyHtml && typeof dailyHtml === 'string', 'Daily PDF HTML should be created');
  assert(dailyHtml.includes('مجزأ ('), 'Daily PDF HTML should contain split breakdown');
  console.log('✔ PDF HTML generation assertions passed!\n');

  // 6. Test fallback when payment_splits is null but item has cash_amount and card_amount
  console.log('6. Testing fallback formatting when payment_splits is null...');
  const dummySplitItem = {
    payment_method: 'split',
    cash_amount: 500,
    card_amount: 500,
    payment_splits: null
  };
  const dummyLabel = getPaymentMethodArabic(dummySplitItem.payment_method, dummySplitItem);
  console.log(`Fallback label: "${dummyLabel}"`);
  assert(dummyLabel.includes('نقدي: ٥٠٠') && dummyLabel.includes('فيزا: ٥٠٠'), 'Should synthesize from item columns');
  console.log('✔ Fallback formatting assertions passed!\n');

  console.log('====================================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Split payments reflect accurately across all reports!');
  console.log('====================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
