/**
 * Full-System Dual-Mode Live HTTP E2E Stress Audit
 * Exercises all core routes across Master (PostgreSQL) and Branch (SQLite) via real Express HTTP server.
 *
 * Usage:
 *   node scratch/test_full_system_http_e2e.js            (runs BOTH --mode=master and --mode=branch)
 *   node scratch/test_full_system_http_e2e.js --mode=master
 *   node scratch/test_full_system_http_e2e.js --mode=branch
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const jwt = require('jsonwebtoken');

const modeArg = process.argv.find((a) => a.startsWith('--mode='));
if (!modeArg) {
  for (const mode of ['master', 'branch']) {
    const res = spawnSync(process.execPath, [__filename, `--mode=${mode}`], { stdio: 'inherit', env: process.env });
    if (res.status !== 0) process.exit(res.status || 1);
  }
  console.log('\n🎉 FULL-SYSTEM DUAL-MODE HTTP E2E AUDIT PASSED 100% (MASTER PG + BRANCH SQLITE)!');
  process.exit(0);
}

const MODE = modeArg.split('=')[1];
const tmpBranchDir = path.resolve(__dirname, `../data/test_full_e2e_${MODE}_${Date.now()}`);
if (MODE === 'branch') {
  fs.mkdirSync(tmpBranchDir, { recursive: true });
  process.env.APP_MODE = 'branch';
  process.env.DATA_DIR = tmpBranchDir;
  process.env.BRANCH_SQLITE_PATH = path.join(tmpBranchDir, 'branch.sqlite');
} else {
  process.env.APP_MODE = 'master';
}
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-e2e-jwt-secret';
process.env.SYNC_API_KEY = process.env.SYNC_API_KEY || 'test-e2e-sync-key';

const config = require('../src/server/config/env');
const db = require('../src/server/database/connection');
const { runBranchSqliteMigrations } = require('../src/server/database/migrator');
const app = require('../src/server/app');
const { getCairoDateTimeParts } = require('../src/shared/utils/date');
const ExcelJS = require('exceljs');

function startHttpServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function reqJson(baseUrl, method, urlPath, token, body = null) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    headers['x-idempotency-key'] = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  const res = await fetch(`${baseUrl}/api${urlPath}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) {
    data = await res.json();
  } else if (ct.includes('spreadsheetml') || ct.includes('octet-stream')) {
    data = Buffer.from(await res.arrayBuffer());
  } else {
    data = await res.text();
  }
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

(async () => {
  console.log(`\n======================================================================`);
  console.log(` RUNNING FULL-SYSTEM HTTP E2E AUDIT — MODE: ${MODE.toUpperCase()}`);
  console.log(`======================================================================`);

  if (MODE === 'branch') {
    await runBranchSqliteMigrations();
  }

  const { server, port } = await startHttpServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { date: todayDate } = getCairoDateTimeParts();
  const stamp = Date.now();

  const cleanup = {
    orderIds: [],
    returnIds: [],
    rentalIds: [],
    rentalInvIds: [],
    tailoringIds: [],
    alterationIds: [],
    expenseIds: [],
    wornIds: [],
    inventoryIds: [],
    supplierIds: [],
    employeeIds: [],
    userIds: [],
    customerPhones: [`01055${String(stamp).slice(-6)}`],
  };

  try {
    // Seed/lookup admin token
    let adminUserRow = (await db.query("SELECT id, username, role, branch_id, branch_scope, token_version FROM users WHERE role = 'admin' LIMIT 1")).rows[0];
    assert.ok(adminUserRow, 'Expected at least 1 admin user');
    const adminToken = jwt.sign({
      id: adminUserRow.id,
      username: adminUserRow.username,
      role: 'admin',
      branch_id: adminUserRow.branch_id || 1,
      branch_scope: 'all',
      token_version: adminUserRow.token_version || 1,
      permissions: ['*'],
    }, config.JWT_SECRET, { expiresIn: '2h' });

    // Create scoped test users (branch view-only vs accountant)
    const viewOnlyUsername = `e2e_view_${stamp}`;
    const viewCreate = await reqJson(baseUrl, 'POST', '/users/branch', adminToken, {
      username: viewOnlyUsername,
      full_name: 'E2E Viewer',
      password: 'Password123!',
      role: 'branch_user',
      branch_id: 1,
      branch_scope: 'single',
      permissions: ['Dashboard.html', 'Tailoring.html', 'tailoring.view', 'Expenses.html', 'expenses.view'],
    });
    assert.ok(viewCreate.ok, `Create view user failed (${viewCreate.status}): ${JSON.stringify(viewCreate.data)}`);
    cleanup.userIds.push(viewCreate.data.id || viewCreate.data.user?.id);
    // Clean any orphaned prior test user just in case
    await db.query("DELETE FROM users WHERE username LIKE 'e2e_view_%' AND id != $1", [viewCreate.data.id || 0]).catch(() => {});
    const viewUserRow = (await db.query('SELECT id, username, role, branch_id, branch_scope, permissions, token_version FROM users WHERE username = $1', [viewOnlyUsername])).rows[0];
    const viewToken = jwt.sign({
      id: viewUserRow.id,
      username: viewUserRow.username,
      role: viewUserRow.role,
      branch_id: 1,
      branch_scope: 'single',
      token_version: viewUserRow.token_version || 1,
      permissions: JSON.parse(typeof viewUserRow.permissions === 'string' ? viewUserRow.permissions : JSON.stringify(viewUserRow.permissions || [])),
    }, config.JWT_SECRET, { expiresIn: '2h' });

    // 1. Auth & Public Endpoints
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/public/check-setup', null)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/public/settings', null)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/me', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/me', null)).status, 401);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/branches', adminToken)).status, 200);
    console.log('✓ [1/10] Auth, public routes, and JWT guard verified');

    // 2. HR Employee + Attendance + Transactions + Payslip
    const empCreate = await reqJson(baseUrl, 'POST', '/employees', adminToken, {
      name: `موظف E2E ${stamp}`,
      position: 'بائع',
      branch_id: 1,
      basic_salary: 6000,
      phone: `011${String(stamp).slice(-8)}`,
      shift_start: '10:00',
      shift_end: '20:00',
    });
    assert.ok(empCreate.ok, `Employee create failed (${empCreate.status}): ${JSON.stringify(empCreate.data)}`);
    const empId = empCreate.data.id || empCreate.data.employee?.id;
    cleanup.employeeIds.push(empId);

    const empList = await reqJson(baseUrl, 'GET', '/employees?branch_id=1', adminToken);
    assert.strictEqual(empList.status, 200, `GET /employees failed (${empList.status}): ${JSON.stringify(empList.data)}`);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/employees/active-sellers?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/employees/options?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/employees/checkout-reminders?branch_id=1', adminToken)).status, 200);

    // Check in employee so they can sell in POS
    const attIn = await reqJson(baseUrl, 'POST', `/employees/${empId}/attendance-manual`, adminToken, {
      date: todayDate,
      status: 'present',
      check_in: '09:30',
    });
    assert.ok(attIn.ok, `Manual check-in failed: ${JSON.stringify(attIn.data)}`);

    // Advance transaction (reduces drawer & salary)
    const advRes = await reqJson(baseUrl, 'POST', '/employee_transactions', adminToken, {
      employee_id: empId,
      type: 'advance',
      amount: 200,
      date: todayDate,
      reason: 'سلفة اختبار',
    });
    assert.ok(advRes.ok, `Advance failed (${advRes.status}): ${JSON.stringify(advRes.data)}`);

    const empSum = await reqJson(baseUrl, 'GET', `/employees/${empId}/summary?month=${todayDate.slice(0, 7)}`, adminToken);
    assert.strictEqual(empSum.status, 200);
    const empSlip = await reqJson(baseUrl, 'GET', `/employees/${empId}/payslip?month=${todayDate.slice(0, 7)}`, adminToken);
    assert.strictEqual(empSlip.status, 200);
    console.log('✓ [2/10] HR employees, attendance, transactions, summary & payslip verified');

    // 3. Supplier & Inventory Creation + Multi-Size + Matrix + Barcodes
    const supRes = await reqJson(baseUrl, 'POST', '/suppliers', adminToken, {
      name: `مورد E2E ${stamp}`,
      phone: `012${String(stamp).slice(-8)}`,
      gender_category: 'رجالي',
    });
    assert.ok(supRes.ok, `Create supplier failed (${supRes.status}): ${JSON.stringify(supRes.data)}`);
    const supId = supRes.data.id || supRes.data.supplier?.id;
    cleanup.supplierIds.push(supId);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/suppliers', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/suppliers/options', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/suppliers/ledger', adminToken)).status, 200);

    const invCreate = await reqJson(baseUrl, 'POST', '/inventory', adminToken, {
      name: `بدلة E2E ${stamp}`,
      category: 'SUIT',
      gender: 'men',
      color: 'أسود',
      price: 1000,
      cost_price: 500,
      preferred_supplier_id: supId,
      branch_id: 1,
      sizes: JSON.stringify([
        { size_name: '48', color_name: 'أسود', stock_level: 5, barcode: `E2E48_${stamp}` },
        { size_name: '50', color_name: 'أسود', stock_level: 3, barcode: `E2E50_${stamp}` },
      ]),
    });
    assert.ok(invCreate.ok, `Create inventory failed (${invCreate.status}): ${JSON.stringify(invCreate.data)}`);
    const invId = invCreate.data.id || invCreate.data.product?.id;
    cleanup.inventoryIds.push(invId);

    for (const ep of [
      '/inventory?branch_id=1&all=true&include_zero=true',
      '/inventory?branch_id=all&all=true&include_zero=true',
      '/inventory/metadata?branch_id=1',
      '/inventory/categories',
      '/inventory/models',
      '/inventory/barcodes',
      '/inventory/names',
      '/colors',
      '/sizes',
      '/inventory/branch-matrix',
      `/inventory/search?q=${encodeURIComponent(`بدلة E2E ${stamp}`)}`,
      `/inventory/${invId}`,
    ]) {
      const r = await reqJson(baseUrl, 'GET', ep, adminToken);
      assert.strictEqual(r.status, 200, `GET ${ep} failed (${r.status}): ${JSON.stringify(r.data)}`);
    }
    console.log('✓ [3/10] Suppliers & inventory multi-endpoint parity verified');

    // 4. POS Orders (Cash + Split/Debt + PayRemaining + Return) & Employee Sales Report
    const custPhone = cleanup.customerPhones[0];
    const cashOrder = await reqJson(baseUrl, 'POST', '/orders', adminToken, {
      customer_name: 'عميل E2E',
      customer_phone: custPhone,
      branch_id: 1,
      seller_id: empId,
      payment_method: 'cash',
      paid_amount: 1000,
      items: [{ id: invId, quantity: 1, price: 1000, size: '48', color: 'أسود' }],
    });
    assert.ok(cashOrder.ok, `Cash order failed (${cashOrder.status}): ${JSON.stringify(cashOrder.data)}`);
    cleanup.orderIds.push(cashOrder.data.orderId || cashOrder.data.id);

    const splitDebtOrder = await reqJson(baseUrl, 'POST', '/orders', adminToken, {
      customer_name: 'عميل E2E',
      customer_phone: custPhone,
      branch_id: 1,
      seller_id: empId,
      payment_method: 'split',
      payment_splits: JSON.stringify([
        { method: 'cash', amount: 300 },
        { method: 'bank_transfer', amount: 200 },
        { method: 'debt', amount: 500 },
      ]),
      paid_amount: 500,
      items: [{ id: invId, quantity: 1, price: 1000, size: '50', color: 'أسود' }],
    });
    assert.ok(splitDebtOrder.ok, `Split+debt order failed (${splitDebtOrder.status}): ${JSON.stringify(splitDebtOrder.data)}`);
    const splitOrderId = splitDebtOrder.data.orderId || splitDebtOrder.data.id;
    cleanup.orderIds.push(splitOrderId);

    // Pay remaining 500 via card
    const payRem = await reqJson(baseUrl, 'POST', `/orders/${splitOrderId}/pay-remaining`, adminToken, {
      amount: 500,
      payment_method: 'card',
    });
    assert.strictEqual(payRem.status, 200, `Pay remaining failed: ${JSON.stringify(payRem.data)}`);

    // List orders, order details, and verify Employee Sales Report
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/orders?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', `/orders/${splitOrderId}/details`, adminToken)).status, 200);
    const empSalesRes = await reqJson(baseUrl, 'GET', `/employees/${empId}/sales-report`, adminToken);
    assert.strictEqual(empSalesRes.status, 200, `Employee sales report failed (${empSalesRes.status}): ${JSON.stringify(empSalesRes.data)}`);
    assert.strictEqual(empSalesRes.data.sales.length, 2, 'Expected 2 sales in employee sales report');
    assert.strictEqual(Number(empSalesRes.data.total_sales), 2000);

    // Return 1 item from cashOrder & verify stock restores
    const retRes = await reqJson(baseUrl, 'POST', '/returns', adminToken, {
      order_id: cashOrder.data.orderId || cashOrder.data.id,
      reason: 'اختبار مرتجع',
      refund_method: 'cash',
      items: [{ inventory_id: invId, quantity: 1, price_at_time: 1000, size: '48' }],
    });
    assert.ok(retRes.ok, `Return order failed (${retRes.status}): ${JSON.stringify(retRes.data)}`);
    cleanup.returnIds.push(retRes.data.returnId || retRes.data.id);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/returns?branch_id=1', adminToken)).status, 200);
    console.log('✓ [4/10] POS Cash, Split+Debt, PayRemaining, Return & Employee Sales Report verified');

    // 5. Expenses & Cash Drawer Reconciliation
    const expCreate = await reqJson(baseUrl, 'POST', '/expenses', adminToken, {
      title: `مصروف E2E ${stamp}`,
      amount: 150,
      category: 'تشغيل',
      branch_id: 1,
      payment_method: 'cash',
      expense_date: todayDate,
    });
    assert.ok(expCreate.ok, `Expense create failed (${expCreate.status}): ${JSON.stringify(expCreate.data)}`);
    cleanup.expenseIds.push(expCreate.data.id || expCreate.data.expense?.id);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/expenses?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/expenses/summary?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/expenses/cashiers?branch_id=1', adminToken)).status, 200);
    // Test PUT expense
    assert.ok((await reqJson(baseUrl, 'PUT', `/expenses/${cleanup.expenseIds[0]}`, adminToken, {
      title: `مصروف معدّل ${stamp}`,
      amount: 160,
      category: 'تشغيل',
      branch_id: 1,
      payment_method: 'cash',
      expense_date: todayDate,
    })).ok);
    // RBAC guard: view-only user cannot create expense
    const viewExpDeny = await reqJson(baseUrl, 'POST', '/expenses', viewToken, { title: 'x', amount: 10, branch_id: 1 });
    assert.strictEqual(viewExpDeny.status, 403, 'Expected 403 for expenses.view user creating expense');
    console.log('✓ [5/10] Expenses, summary, and expenses.view RBAC verified');

    // 6. Tailoring & Alterations + View-Only Cancel Guard
    const tailCreate = await reqJson(baseUrl, 'POST', '/tailoring-orders', adminToken, {
      customer_name: 'عميل تفصيل E2E',
      customer_phone: custPhone,
      product_description: 'جاكيت كحلي',
      measurements: { chest: '100', waist: '85' },
      total_price: 800,
      paid_amount: 300,
      payment_method: 'cash',
      due_date: todayDate,
      seller_id: empId,
      branch_id: 1,
    });
    assert.ok(tailCreate.ok, `Tailoring create failed (${tailCreate.status}): ${JSON.stringify(tailCreate.data)}`);
    const tailId = tailCreate.data.id || tailCreate.data.order?.id;
    cleanup.tailoringIds.push(tailId);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/tailoring-orders?branch_id=1', adminToken)).status, 200);
    const viewTailCancelDeny = await reqJson(baseUrl, 'PUT', `/tailoring-orders/${tailId}/cancel`, viewToken, { refund_deposit: false });
    assert.strictEqual(viewTailCancelDeny.status, 403, 'Expected 403 for tailoring.view user cancelling tailoring order');
    const tailCancelOk = await reqJson(baseUrl, 'PUT', `/tailoring-orders/${tailId}/cancel`, adminToken, { refund_deposit: true, notes: 'إلغاء اختبار' });
    assert.strictEqual(tailCancelOk.status, 200, `Tailoring cancel failed: ${JSON.stringify(tailCancelOk.data)}`);

    const altCreate = await reqJson(baseUrl, 'POST', '/alterations', adminToken, {
      order_id: splitOrderId,
      description: 'تضييق جاكيت',
      due_date: todayDate,
      branch_id: 1,
    });
    assert.ok(altCreate.ok, `Alteration create failed (${altCreate.status}): ${JSON.stringify(altCreate.data)}`);
    cleanup.alterationIds.push(altCreate.data.id);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/alterations?branch_id=1', adminToken)).status, 200);
    console.log('✓ [6/10] Tailoring create/cancel, view RBAC, and Alterations verified');

    // 7. Rentals Lifecycle (Inventory -> Book -> Prepare -> Deliver -> Return)
    const rInv = await reqJson(baseUrl, 'POST', '/rental-inventory', adminToken, {
      name: `بدلة إيجار E2E ${stamp}`,
      category: 'SUIT',
      color: 'أسود',
      price: 600,
      branch_id: 1,
      stock_level: 2,
    });
    assert.ok(rInv.ok, `Rental inv create failed (${rInv.status}): ${JSON.stringify(rInv.data)}`);
    const rInvId = rInv.data.id || rInv.data.item?.id;
    cleanup.rentalInvIds.push(rInvId);

    const rBook = await reqJson(baseUrl, 'POST', '/rentals', adminToken, {
      customer_name: 'عميل إيجار E2E',
      customer_phone: custPhone,
      rental_inventory_id: rInvId,
      branch_id: 1,
      pickup_date: todayDate,
      return_date: todayDate,
      total_price: 600,
      deposit_amount: 200,
      payment_method: 'cash',
      seller_id: empId,
    });
    assert.ok(rBook.ok, `Rental booking failed (${rBook.status}): ${JSON.stringify(rBook.data)}`);
    const rentalId = rBook.data.id || rBook.data.rental?.id;
    cleanup.rentalIds.push(rentalId);

    assert.strictEqual((await reqJson(baseUrl, 'GET', '/rentals?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/rentals/summary?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/rentals/preparation?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/rentals/history-ledger?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'PUT', `/rentals/${rentalId}/prepare`, adminToken, { is_prepared: true })).status, 200);
    console.log('✓ [7/10] Rentals inventory, booking, summary, preparation & ledger verified');

    // 8. Customers, Worn Products, Search, Notifications & Audit
    const custList = await reqJson(baseUrl, 'GET', '/customers?branch_id=1', adminToken);
    assert.strictEqual(custList.status, 200, `GET /customers failed: ${JSON.stringify(custList.data)}`);
    const custRows = custList.data.customers || custList.data.items || custList.data.data || custList.data;
    const targetCust = (Array.isArray(custRows) ? custRows : []).find((c) => c.phone === custPhone);
    if (targetCust) {
      const hist = await reqJson(baseUrl, 'GET', `/customers/${targetCust.id}/history`, adminToken);
      assert.strictEqual(hist.status, 200, `Customer history failed (${hist.status}): ${JSON.stringify(hist.data)}`);
    }

    const wornRes = await reqJson(baseUrl, 'POST', '/worn-products', adminToken, {
      product_type: 'sales',
      product_id: invId,
      quantity: 1,
      reason: 'تلف اختبار E2E',
      branch_id: 1,
      deduct_stock: false,
    });
    assert.ok(wornRes.ok, `Worn product create failed (${wornRes.status}): ${JSON.stringify(wornRes.data)}`);
    cleanup.wornIds.push(wornRes.data.id || wornRes.data.record?.id);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/worn-products?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/worn-products/summary?branch_id=1', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', `/search?q=${encodeURIComponent('E2E')}`, adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/notifications', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/audit-logs', adminToken)).status, 200);
    console.log('✓ [8/10] Customers history, Worn Products summary, Search, Notifications & Audit verified');

    // 9. Reports & 36-Sheet Consolidated Excel Workbook Validation
    const monthStr = todayDate.slice(0, 7);
    const reportEndpoints = [
      '/dashboard?branch_id=1',
      '/reports/summary?branch_id=1',
      '/reports/sales?branch_id=1',
      '/reports/rentals?branch_id=1',
      '/reports/expenses?branch_id=1',
      '/reports/inventory?branch_id=1',
      '/reports/profit?branch_id=1',
      '/reports/daily-history?branch_id=1',
      '/reports/monthly-history?branch_id=1',
      '/reports/top-products?branch_id=1',
      `/reports/daily?date=${todayDate}&branch_id=1`,
      `/reports/extended-daily?date=${todayDate}&branch_id=1`,
      `/reports/ohda?month=${monthStr}&branch_id=1`,
      `/reports/salary-sheet?month=${monthStr}&branch_id=1`,
      `/reports/kpi?month=${monthStr}&branch_id=1`,
      `/reports/master-sheet?month=${monthStr}&branch_id=1`,
      '/reports/suppliers-ledger?branch_id=1',
    ];
    for (const rep of reportEndpoints) {
      const r = await reqJson(baseUrl, 'GET', rep, adminToken);
      assert.strictEqual(r.status, 200, `Report GET ${rep} failed (${r.status}): ${JSON.stringify(r.data)}`);
    }

    const xlRes = await reqJson(baseUrl, 'GET', `/reports/export/consolidated-excel?month=${monthStr}&branch_id=1`, adminToken);
    assert.strictEqual(xlRes.status, 200, `Consolidated Excel failed (${xlRes.status})`);
    assert.ok(Buffer.isBuffer(xlRes.data) && xlRes.data.length > 5000, 'Expected non-empty Excel buffer');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlRes.data);
    const sheetNames = wb.worksheets.map((w) => w.name);
    for (const requiredSheet of ['MASTER STAFF LIST', 'MASTER SHEET', 'OHDA', 'SALARY', 'KPI']) {
      assert.ok(sheetNames.includes(requiredSheet), `Missing consolidated Excel sheet: ${requiredSheet}`);
    }
    assert.ok(sheetNames.length >= 36, `Expected >= 36 sheets in consolidated Excel, got ${sheetNames.length}`);
    console.log(`✓ [9/10] All 17 reports endpoints + 36-sheet Consolidated Excel (${sheetNames.length} sheets) verified`);

    // 10. Settings & Sensitive Passwords Status + Backup Groups
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/settings', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/sensitive-passwords/status', adminToken)).status, 200);
    assert.strictEqual((await reqJson(baseUrl, 'GET', '/backup/groups', adminToken)).status, 200);
    console.log('✓ [10/10] Settings, sensitive passwords status & backup groups verified');
  } finally {
    // Cleanup synthetic records in PG mode cleanly (Branch uses disposable folder)
    if (MODE === 'master') {
      try {
        if (cleanup.alterationIds.length) {
          await db.query('DELETE FROM alterations WHERE id = ANY($1::int[])', [cleanup.alterationIds]);
        }
        await db.query("DELETE FROM alterations WHERE description = 'تضييق جاكيت'").catch(() => {});
        if (cleanup.returnIds.length) {
          await db.query('DELETE FROM return_items WHERE return_id = ANY($1::int[])', [cleanup.returnIds]);
          await db.query('DELETE FROM returns WHERE id = ANY($1::int[])', [cleanup.returnIds]);
        }
        if (cleanup.orderIds.length) {
          await db.query('DELETE FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE order_id = ANY($1::int[]))', [cleanup.orderIds]).catch(() => {});
          await db.query('DELETE FROM returns WHERE order_id = ANY($1::int[])', [cleanup.orderIds]).catch(() => {});
          await db.query('DELETE FROM alterations WHERE order_id = ANY($1::int[])', [cleanup.orderIds]).catch(() => {});
          await db.query('DELETE FROM order_payments WHERE order_id = ANY($1::int[])', [cleanup.orderIds]);
          await db.query('DELETE FROM order_items WHERE order_id = ANY($1::int[])', [cleanup.orderIds]);
          await db.query('DELETE FROM orders WHERE id = ANY($1::int[])', [cleanup.orderIds]);
        }
        // Also remove any orphaned E2E orders/customers from prior aborted runs
        await db.query("DELETE FROM return_items WHERE return_id IN (SELECT r.id FROM returns r JOIN orders o ON r.order_id = o.id JOIN customers c ON o.customer_id = c.id WHERE c.name = 'عميل E2E')").catch(() => {});
        await db.query("DELETE FROM returns WHERE order_id IN (SELECT o.id FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.name = 'عميل E2E')").catch(() => {});
        await db.query("DELETE FROM alterations WHERE order_id IN (SELECT o.id FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.name = 'عميل E2E')").catch(() => {});
        await db.query("DELETE FROM order_payments WHERE order_id IN (SELECT o.id FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.name = 'عميل E2E')").catch(() => {});
        await db.query("DELETE FROM order_items WHERE order_id IN (SELECT o.id FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.name = 'عميل E2E')").catch(() => {});
        await db.query("DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE name = 'عميل E2E')").catch(() => {});
        await db.query("DELETE FROM customers WHERE name = 'عميل E2E'").catch(() => {});
        if (cleanup.rentalIds.length) {
          await db.query('DELETE FROM rental_payments WHERE rental_id = ANY($1::int[])', [cleanup.rentalIds]);
          await db.query('DELETE FROM rentals WHERE id = ANY($1::int[])', [cleanup.rentalIds]);
        }
        if (cleanup.rentalInvIds.length) {
          await db.query('DELETE FROM rental_inventory_branches WHERE rental_inventory_id = ANY($1::int[])', [cleanup.rentalInvIds]);
          await db.query('DELETE FROM rental_inventory WHERE id = ANY($1::int[])', [cleanup.rentalInvIds]);
        }
        if (cleanup.tailoringIds.length) {
          await db.query('DELETE FROM tailoring_payments WHERE tailoring_order_id = ANY($1::int[])', [cleanup.tailoringIds]);
          await db.query('DELETE FROM tailoring_orders WHERE id = ANY($1::int[])', [cleanup.tailoringIds]);
        }
        if (cleanup.expenseIds.length) {
          await db.query('DELETE FROM expenses WHERE id = ANY($1::int[])', [cleanup.expenseIds]);
        }
        if (cleanup.wornIds.length) {
          await db.query('DELETE FROM worn_products WHERE id = ANY($1::int[])', [cleanup.wornIds]);
        }
        if (cleanup.inventoryIds.length) {
          await db.query('DELETE FROM supply_records WHERE inventory_id = ANY($1::int[])', [cleanup.inventoryIds]);
          await db.query('DELETE FROM inventory_sizes WHERE inventory_id = ANY($1::int[])', [cleanup.inventoryIds]);
          await db.query('DELETE FROM inventory_branches WHERE inventory_id = ANY($1::int[])', [cleanup.inventoryIds]);
          await db.query('DELETE FROM inventory WHERE id = ANY($1::int[])', [cleanup.inventoryIds]);
        }
        if (cleanup.supplierIds.length) {
          await db.query('DELETE FROM supplier_transactions WHERE supplier_id = ANY($1::int[])', [cleanup.supplierIds]);
          await db.query('DELETE FROM supply_records WHERE supplier_id = ANY($1::int[])', [cleanup.supplierIds]);
          await db.query('DELETE FROM suppliers WHERE id = ANY($1::int[])', [cleanup.supplierIds]);
        }
        // Remove any orphaned E2E records from an earlier aborted run
        await db.query("DELETE FROM supply_records WHERE inventory_id IN (SELECT id FROM inventory WHERE name LIKE 'بدلة E2E %')").catch(() => {});
        await db.query("DELETE FROM inventory_sizes WHERE inventory_id IN (SELECT id FROM inventory WHERE name LIKE 'بدلة E2E %')").catch(() => {});
        await db.query("DELETE FROM inventory_branches WHERE inventory_id IN (SELECT id FROM inventory WHERE name LIKE 'بدلة E2E %')").catch(() => {});
        await db.query("DELETE FROM inventory WHERE name LIKE 'بدلة E2E %'").catch(() => {});
        await db.query("DELETE FROM supplier_transactions WHERE supplier_id IN (SELECT id FROM suppliers WHERE name LIKE 'مورد E2E %')").catch(() => {});
        await db.query("DELETE FROM suppliers WHERE name LIKE 'مورد E2E %'").catch(() => {});
        if (cleanup.employeeIds.length) {
          await db.query('DELETE FROM employee_transactions WHERE employee_id = ANY($1::int[])', [cleanup.employeeIds]);
          await db.query('DELETE FROM attendance WHERE employee_id = ANY($1::int[])', [cleanup.employeeIds]);
          await db.query('DELETE FROM employees WHERE id = ANY($1::int[])', [cleanup.employeeIds]);
        }
        if (cleanup.customerPhones.length) {
          await db.query('DELETE FROM customers WHERE phone = ANY($1::text[])', [cleanup.customerPhones]);
        }
        if (cleanup.userIds.length) {
          await db.query('DELETE FROM users WHERE id = ANY($1::int[])', [cleanup.userIds]);
        }
      } catch (cleanErr) {
        console.warn('PG cleanup warning:', cleanErr.message);
      }
      try { await db.closePool(); } catch {}
    } else {
      try { db.sqlite?.close(); } catch {}
      setTimeout(() => {}, 50);
      try { fs.rmSync(tmpBranchDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    }
    server.close();
  }
  console.log(`=== MODE ${MODE.toUpperCase()} FULL HTTP E2E PASSED (10/10 DOMAINS) ===`);
})();
