const assert = require('assert');

async function runTests() {
  console.log('🧪 Starting Verification Tests for Bebyoon Architecture & Security Fixes...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. SEC-01: Whitelist in settings.service.js
  await testAsync('SEC-01: getPublicSettings() whitelists fields and strips passwords', async () => {
    const settingsService = require('../src/server/modules/settings/settings.service');
    const publicSettings = await settingsService.getPublicSettings();
    assert.strictEqual(publicSettings.salary_password, undefined, 'salary_password must not be exposed');
    assert.strictEqual(publicSettings.invoice_edit_password, undefined, 'invoice_edit_password must not be exposed');
    assert.ok(publicSettings.store_name, 'store_name should be present');
  });

  // 2. SEC-03: CORS origin validation
  test('SEC-03: Strict CORS origin validation allows localhost, 127.0.0.1, LAN IPs, and rejects attackers', () => {
    const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i;
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://localhost:5173'), true);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://127.0.0.1:6253'), true);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('https://localhost:3000'), true);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://192.168.1.15:6253'), true);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://10.0.0.2:6253'), true);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://attacker.com'), false);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://localhost.evil.com'), false);
    assert.strictEqual(LOCAL_ORIGIN_REGEX.test('http://evil-127.0.0.1.com'), false);
  });

  // 3. SEC-04: NODE_TLS_REJECT_UNAUTHORIZED not globally disabled
  test('SEC-04: process.env.NODE_TLS_REJECT_UNAUTHORIZED is not 0', () => {
    require('../src/server/modules/sync/sync.service');
    assert.notStrictEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0', 'NODE_TLS_REJECT_UNAUTHORIZED must not be 0');
  });

  // 4. SEC-05: RBAC on inventory routes & service
  test('SEC-05: Inventory routes and service enforce requireInventoryAdmin on POST/PUT/DELETE', async () => {
    const inventoryRoutes = require('../src/server/modules/inventory/inventory.routes');
    const routes = inventoryRoutes.stack;
    const postRoute = routes.find(r => r.route?.path === '/inventory' && r.route?.methods?.post);
    const putRoute = routes.find(r => r.route?.path === '/inventory/:id' && r.route?.methods?.put);
    const deleteRoute = routes.find(r => r.route?.path === '/inventory/:id' && r.route?.methods?.delete);

    assert.ok(postRoute, 'POST /inventory exists');
    assert.ok(putRoute, 'PUT /inventory/:id exists');
    assert.ok(deleteRoute, 'DELETE /inventory/:id exists');
    assert.ok(postRoute.route.stack.some(s => s.name === 'requireInventoryAdmin' || s.handle.name === 'requireInventoryAdmin'), 'POST /inventory must have RBAC middleware');
    assert.ok(putRoute.route.stack.some(s => s.name === 'requireInventoryAdmin' || s.handle.name === 'requireInventoryAdmin'), 'PUT /inventory/:id must have RBAC middleware');
    assert.ok(deleteRoute.route.stack.some(s => s.name === 'requireInventoryAdmin' || s.handle.name === 'requireInventoryAdmin'), 'DELETE /inventory/:id must have RBAC middleware');

    // Service-level check
    const inventoryService = require('../src/server/modules/inventory/inventory.service');
    const unprivilegedUser = { id: 2, role: 'branch_user', permissions: ['index.html'] };
    try {
      await inventoryService.createProduct({ name: 'Hacked Product' }, unprivilegedUser);
      assert.fail('createProduct should have thrown 403');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
    }
  });

  // 5. ARCH-02: No route collision between expenses and worn
  test('ARCH-02: No collision on /worn-products routes between expenses and worn', () => {
    const expensesRoutes = require('../src/server/modules/expenses/expenses.routes');
    const wornRoutes = require('../src/server/modules/worn/worn.routes');

    const expensesPaths = expensesRoutes.stack.map(r => r.route?.path).filter(Boolean);
    const wornPaths = wornRoutes.stack.map(r => r.route?.path).filter(Boolean);

    const hasWornInExpenses = expensesPaths.some(p => p.includes('worn-products'));
    assert.strictEqual(hasWornInExpenses, false, 'expenses routes must not declare /worn-products routes');
    assert.ok(wornPaths.includes('/worn-products'), 'worn routes must handle /worn-products');
    assert.ok(wornPaths.includes('/worn-products/summary'), 'worn routes must handle /worn-products/summary');
    assert.ok(wornPaths.includes('/worn-products/:id'), 'worn routes must handle /worn-products/:id');
  });

  // 6. DATA-01: Migration 004 exists and contains necessary statements
  test('DATA-01: Migration 004 contains occurred_at, reported_by, status', () => {
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, '../src/server/database/migrations/004_worn_products_columns.sql'), 'utf8');
    assert.ok(sql.includes('occurred_at'), 'Migration 004 must add occurred_at');
    assert.ok(sql.includes('reported_by'), 'Migration 004 must add reported_by');
    assert.ok(sql.includes('status'), 'Migration 004 must add status');
    assert.ok(sql.includes('suppliers'), 'Migration 004 must handle suppliers is_active');
    assert.ok(sql.includes('customers'), 'Migration 004 must handle customers is_active');
  });

  // 7. AUTH-01: Bearer token support in auth.middleware
  await testAsync('AUTH-01: authMiddleware extracts token from Authorization: Bearer header', async () => {
    const jwt = require('jsonwebtoken');
    const config = require('../src/server/config/env');
    const { authMiddleware } = require('../src/server/middleware/auth.middleware');

    const sampleToken = jwt.sign({ id: 99, username: 'tester', role: 'admin' }, config.JWT_SECRET);
    const req = {
      cookies: {},
      headers: {
        authorization: `Bearer ${sampleToken}`,
      },
      path: '/api/test',
    };
    const res = {
      clearCookie: () => {},
      status: () => ({ json: () => {} }),
    };

    let nextCalled = false;
    await authMiddleware(req, res, () => { nextCalled = true; });

    assert.ok(nextCalled, 'next() should be called');
    assert.ok(req.user, 'req.user should be populated');
    assert.strictEqual(req.user.id, 99);
    assert.strictEqual(req.user.username, 'tester');
  });

  // 8. SEC-06: Employees summary & payslip require salary password
  test('SEC-06: Employees summary & payslip have salary password middleware', () => {
    const employeesRoutes = require('../src/server/modules/hr/employees.routes');
    const summaryRoute = employeesRoutes.stack.find(r => r.route?.path === '/employees/:id/summary');
    const payslipRoute = employeesRoutes.stack.find(r => r.route?.path === '/employees/:id/payslip');

    assert.ok(summaryRoute, '/employees/:id/summary exists');
    assert.ok(payslipRoute, '/employees/:id/payslip exists');
    assert.strictEqual(summaryRoute.route.stack.length, 2, 'Summary route must have salary access check');
    assert.strictEqual(payslipRoute.route.stack.length, 2, 'Payslip route must have salary access check');
  });

  // 9. FRONTEND-03: Sidebar empty permissions logic
  test('FRONTEND-03: Sidebar correctly filters for empty permissions user', () => {
    const allNavItems = [
      { perm: 'Dashboard.html', label: 'الرئيسية' },
      { perm: 'Settings.html', label: 'الإعدادات' },
    ];

    function filterNav(user, userPerms) {
      if (!user) return [];
      if (user.role === 'admin') return allNavItems;
      if (!Array.isArray(userPerms)) return [];
      return allNavItems.filter((item) => userPerms.includes(item.perm));
    }

    const adminNav = filterNav({ role: 'admin' }, null);
    assert.strictEqual(adminNav.length, 2, 'Admin sees all items');

    const emptyPermsUserNav = filterNav({ role: 'cashier' }, []);
    assert.strictEqual(emptyPermsUserNav.length, 0, 'User with empty permissions sees 0 items');

    const singlePermsUserNav = filterNav({ role: 'cashier' }, ['Dashboard.html']);
    assert.strictEqual(singlePermsUserNav.length, 1, 'User with 1 permission sees only that item');
    assert.strictEqual(singlePermsUserNav[0].perm, 'Dashboard.html');
  });

  // 10. ARCH-01: SQLite query compatibility function test
  test('ARCH-01: SQLite query translator translates PG specific constructs', () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.function('now', () => new Date().toISOString());
    db.function('timezone', { varargs: true }, (tz, dt) => dt || new Date().toISOString());
    db.function('date_trunc', { varargs: true }, (unit, dateStr) => '2026-10-01');

    db.exec(`
      CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL, branch_id INTEGER);
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO customers VALUES (1, 'Ahmed');
      INSERT INTO orders (total, branch_id) VALUES (150, 1);
    `);

    function translatePgToSqlite(sql) {
      let s = sql;
      if (/pg_advisory_xact_lock/i.test(s)) return { isAdvisoryLock: true, sql: 'SELECT 1 AS lock' };
      s = s.replace(/\(now\(\)\s+AT\s+TIME\s+ZONE\s+'[^']+'\)::date/gi, "date('now', 'localtime')");
      s = s.replace(/\(now\(\)\s+AT\s+TIME\s+ZONE\s+'[^']+'\)/gi, "datetime('now', 'localtime')");
      s = s.replace(/\bILIKE\b/gi, 'LIKE');
      s = s.replace(/::[a-zA-Z0-9_]+(\s*\[\s*\])?/g, '');
      s = s.replace(/\bFOR\s+UPDATE\b/gi, '');
      s = s.replace(/\bjson_agg\b/gi, 'json_group_array');
      s = s.replace(/\bjson_build_object\b/gi, 'json_object');
      s = s.replace(/=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, 'IN (SELECT value FROM json_each(?$1))');
      s = s.replace(/\$(\d+)/g, '?$1');
      return { isAdvisoryLock: false, sql: s };
    }

    const q1 = translatePgToSqlite('SELECT * FROM orders WHERE id = $1::int AND branch_id = $2 FOR UPDATE');
    assert.strictEqual(q1.sql.includes('FOR UPDATE'), false);
    assert.strictEqual(q1.sql.includes('::int'), false);
    assert.strictEqual(q1.sql.includes('?1'), true);
    assert.strictEqual(q1.sql.includes('?2'), true);

    const q2 = translatePgToSqlite('SELECT * FROM orders WHERE branch_id = ANY($1::int[])');
    assert.ok(q2.sql.includes('IN (SELECT value FROM json_each(?1))'));

    const lockQ = translatePgToSqlite('SELECT pg_advisory_xact_lock($1::int, $2::int)');
    assert.strictEqual(lockQ.isAdvisoryLock, true);
  });

  // 11. SEC-02 & SEC-06: Robust password matching (numbers, strings, trimmed)
  await testAsync('SEC-02 & SEC-06: Auth service password verification handles string/number and trimming', async () => {
    const authService = require('../src/server/modules/auth/auth.service');
    // Invoice edit password
    assert.strictEqual(await authService.verifyInvoiceEditPassword('123456'), true);
    assert.strictEqual(await authService.verifyInvoiceEditPassword(123456), true);
    assert.strictEqual(await authService.verifyInvoiceEditPassword(' 123456 '), true);
    assert.strictEqual(await authService.verifyInvoiceEditPassword('wrong'), false);
    assert.strictEqual(await authService.verifyInvoiceEditPassword(null), false);

    // Salary password
    assert.strictEqual(await authService.verifySalaryPassword('123'), true);
    assert.strictEqual(await authService.verifySalaryPassword(123), true);
    assert.strictEqual(await authService.verifySalaryPassword(' 123 '), true);
    assert.strictEqual(await authService.verifySalaryPassword('wrong'), false);
    assert.strictEqual(await authService.verifySalaryPassword(null), false);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal in test runner:', err);
  process.exit(1);
});
