process.env.APP_MODE = 'branch';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-sync-jwt-secret';
process.env.SYNC_API_KEY = process.env.SYNC_API_KEY || 'test-sync-api-key';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

const tempDir = path.resolve(__dirname, '../data/test_two_way_sync_accountant');
fs.mkdirSync(tempDir, { recursive: true });
const sqlitePath = path.join(tempDir, 'branch.sqlite');
for (const ext of ['', '-wal', '-shm']) {
  const f = `${sqlitePath}${ext}`;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
process.env.BRANCH_SQLITE_PATH = sqlitePath;

const config = require('../src/server/config/env');
const dbConnection = require('../src/server/database/connection');
const { runBranchSqliteMigrations } = require('../src/server/database/migrator');
const syncService = require('../src/server/modules/sync/sync.service');
const expensesService = require('../src/server/modules/expenses/expenses.service');
const { authMiddleware } = require('../src/server/middleware/auth.middleware');
const syncRoutes = require('../src/server/modules/sync/sync.routes');
const tailoringRoutes = require('../src/server/modules/tailoring/tailoring.routes');
const permissions = require('../src/shared/constants/permissions');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
}

function getRouteMiddlewares(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`Route not found: ${method} ${routePath}`);
  return layer.route.stack.map((s) => s.handle);
}

async function runMiddlewareChain(middlewares, req) {
  const res = createMockRes();
  let stopped = false;
  for (const mw of middlewares) {
    let nextCalled = false;
    await mw(req, res, (err) => {
      if (err) throw err;
      nextCalled = true;
    });
    if (!nextCalled) {
      stopped = true;
      break;
    }
  }
  return { passed: !stopped, res };
}

(async () => {
  console.log('=== TEST SUITE: Two-Way Sync, Accountant Scoping & Tailoring Fixes ===');
  const sqliteDb = dbConnection.sqlite;
  sqliteDb.exec('PRAGMA foreign_keys = OFF;');

  await runBranchSqliteMigrations(sqliteDb);

  // 1. Seed local colliding rows (same offline_uuid, different local SQLite id) and a pending offline expense
  sqliteDb.prepare(`
    INSERT INTO customers (id, name, phone, branch_id, offline_uuid, pending_sync)
    VALUES (999999, 'Local Offline Customer', '01000000999', 1, 'cust-uuid-collision-1', 0)
  `).run();

  sqliteDb.prepare(`
    INSERT INTO orders (id, customer_id, seller_id, order_date, total_amount, paid_amount, change_amount, status, branch_id, payment_method, offline_uuid, pending_sync)
    VALUES (888888, 999999, 1, '2026-11-18', 500, 500, 0, 'completed', 1, 'cash', 'ord-local-pending-1', 1)
  `).run();

  sqliteDb.prepare(`
    INSERT INTO employees (id, name, position, branch_id, basic_salary, phone, offline_uuid)
    VALUES (999999, 'Local Offline Employee', 'Sales', 1, 6000, '01111111999', 'emp-uuid-collision-1')
  `).run();

  sqliteDb.prepare(`
    INSERT INTO attendance (id, employee_id, date, status)
    VALUES (777777, 999999, '2026-11-17', 'present')
  `).run();

  // Pending local expense that MUST be preserved across catalog import
  sqliteDb.prepare(`
    INSERT INTO expenses (id, branch_id, category, amount, expense_date, notes, offline_uuid, payment_method, created_by, pending_sync)
    VALUES (555555, 2, 'نثريات', 120, '2026-11-18', 'Pending local expense', 'exp-pending-local-1', 'cash', 9, 1)
  `).run();
  sqliteDb.prepare(`
    INSERT INTO sync_queue (operation_uuid, entity_type, entity_id, branch_id, action, payload, status)
    VALUES ('op-exp-555555', 'expense', 555555, 2, 'create', '{}', 'pending')
  `).run();

  // Keep local pending order protected too
  sqliteDb.prepare(`
    INSERT INTO sync_queue (operation_uuid, entity_type, entity_id, branch_id, action, payload, status)
    VALUES ('op-ord-888888', 'sale', 888888, 1, 'create', '{}', 'pending')
  `).run();

  // 2. Build full Central Catalog payload with ALL synced operational & accounting tables
  const acctPreset = permissions.PERMISSION_PRESETS.find((p) => p.id === 'accountant');
  assert.ok(acctPreset, 'Accountant permission preset must exist');
  const acctPresetPermissions = acctPreset.permissions;
  const catalog = {
    reset_token: 'test-reset-token-1',
    branches: [
      { id: 1, name: 'الفرع الرئيسي', code: 'MAIN', is_active: true },
      { id: 2, name: 'فرع العجمي', code: 'AGAMI', is_active: true },
      { id: 3, name: 'الوزير', code: 'WAZEER', is_active: true },
    ],
    users: [
      {
        id: 101,
        username: 'hesabat_new',
        password_hash: '$2a$10$hashhashhashhashhashhashhashhashhashhashhashhashhash',
        role: 'accountant',
        branch_id: 2,
        branch_scope: null, // Intentionally null to test import enforcement to 'all'
        branch_ids: [1, 2, 3],
        permissions: JSON.stringify(acctPresetPermissions),
        full_name: 'حسابات جديدة',
        token_version: 1,
      },
      {
        id: 102,
        username: 'karika_tailor',
        password_hash: '$2a$10$hashhashhashhashhashhashhashhashhashhashhashhashhash',
        role: 'branch_user',
        branch_id: 1,
        branch_scope: 'branch',
        branch_ids: [1],
        permissions: JSON.stringify(['Tailoring.html', 'tailoring.create', 'tailoring.edit']),
        full_name: 'كاريكا',
        token_version: 1,
      },
    ],
    categories: [{ id: 1, name: 'بدل' }],
    colors: [{ id: 1, name: 'أسود' }],
    sizes: [{ id: 1, name: '50' }],
    suppliers: [{ id: 1, name: 'مورد ١', phone: '0100', balance: 0 }],
    products: [{ id: 1, name: 'بدلة كحلي', category_id: 1, cost_price: 1000, price: 2000 }],
    inventory: [
      { id: 1, name: 'بدلة كحلي', category: 'بدل', size_cut: '50', color: 'أسود', barcode: 'BC-1', stock_level: 10, min_stock_level: 2, price: 2000, cost_price: 1000, color_id: 1, size_id: 1 },
    ],
    inventory_branches: [
      { inventory_id: 1, branch_id: 1, stock_level: 10 },
    ],
    rental_inventory: [
      { id: 1, name: 'بدلة إيجار', category: 'بدل', size_cut: '50', color: 'أسود', barcode: 'RBC-1', price: 500, stock_level: 4, color_id: 1, size_id: 1 },
    ],
    rental_inventory_branches: [
      { rental_inventory_id: 1, branch_id: 1, stock_level: 4 },
    ],
    employees: [
      {
        id: 33,
        name: 'Synced Central Employee',
        position: 'Sales',
        branch_id: 2,
        basic_salary: 6500,
        phone: '01111111999',
        join_date: '2026-01-01',
        shift_start: '10:00',
        shift_end: '20:00',
        status: 'active',
        offline_uuid: 'emp-uuid-collision-1',
      },
    ],
    customers: [
      {
        id: 42,
        name: 'Synced Central Customer',
        phone: '01000000999',
        branch_id: 2,
        is_active: true,
        offline_uuid: 'cust-uuid-collision-1',
        wallet_balance: 250,
      },
    ],
    expenses: [
      {
        id: 201,
        branch_id: 3,
        category: 'كهرباء',
        amount: 950,
        expense_date: '2026-11-18',
        notes: 'Central synced expense from another laptop',
        offline_uuid: 'exp-central-201',
        payment_method: 'cash',
        created_by: 101,
      },
    ],
    attendance: [
      {
        id: 301,
        employee_id: 33,
        date: '2026-11-18',
        check_in: '10:00',
        check_out: '20:00',
        status: 'present',
        total_hours: 10,
      },
    ],
    employee_transactions: [
      {
        id: 401,
        employee_id: 33,
        type: 'advance',
        amount: 400,
        transaction_date: '2026-11-18',
        notes: 'سلفة من جهاز آخر',
        offline_uuid: 'etx-central-401',
      },
    ],
    // Two tailoring orders from DIFFERENT branches sharing invoice_number '1001'
    tailoring_orders: [
      {
        id: 501,
        invoice_number: '1001',
        customer_name: 'عميل فرع 1',
        customer_phone: '0101',
        product_description: 'بدلة تفصيل',
        measurements: { chest: 100 },
        total_amount: 3000,
        paid_amount: 1000,
        remaining_amount: 2000,
        payment_method: 'cash',
        status: 'pending',
        order_date: '2026-11-18',
        branch_id: 1,
        seller_id: 33,
        created_by: 101,
        offline_uuid: 'tail-central-501',
      },
      {
        id: 502,
        invoice_number: '1001',
        customer_name: 'عميل فرع 2',
        customer_phone: '0102',
        product_description: 'بليزر تفصيل',
        measurements: { chest: 104 },
        total_amount: 2500,
        paid_amount: 2500,
        remaining_amount: 0,
        payment_method: 'visa',
        status: 'completed',
        order_date: '2026-11-18',
        branch_id: 2,
        seller_id: 33,
        created_by: 101,
        offline_uuid: 'tail-central-502',
      },
    ],
    tailoring_payments: [
      {
        id: 511,
        tailoring_order_id: 501,
        amount: 1000,
        branch_id: 1,
        payment_date: '2026-11-18',
        is_remainder: false,
        payment_method: 'cash',
        offline_uuid: 'tailp-central-511',
      },
    ],
    alterations: [
      {
        id: 601,
        order_id: null,
        customer_id: 42,
        branch_id: 2,
        description: 'تضييق بنطلون',
        status: 'pending',
        due_date: '2026-11-19',
      },
    ],
    orders: [
      {
        id: 701,
        customer_id: 42,
        seller_id: 33,
        order_date: '2026-11-18',
        total_amount: 2000,
        paid_amount: 2000,
        change_amount: 0,
        status: 'completed',
        branch_id: 2,
        payment_method: 'cash',
        branch_invoice_number: 101,
        offline_uuid: 'ord-central-701',
      },
    ],
    order_items: [
      { id: 711, order_id: 701, inventory_id: 1, quantity: 1, price_at_time: 2000, discount: 0, discount_type: 'fixed', size: '50' },
    ],
    order_payments: [
      { id: 721, order_id: 701, amount: 2000, payment_method: 'cash', payment_date: '2026-11-18', branch_id: 2, seller_id: 33, offline_uuid: 'opay-721' },
    ],
    returns: [
      { id: 801, order_id: 701, return_date: '2026-11-18', total_return_amount: 500, reason: 'تبديل مقاس', seller_id: 33, branch_id: 2, refund_method: 'cash', offline_uuid: 'ret-801' },
    ],
    return_items: [
      { id: 811, return_id: 801, inventory_id: 1, quantity: 1, price_at_time: 500, size: '50', discount: 0, discount_type: 'fixed' },
    ],
    rentals: [
      {
        id: 901,
        customer_id: 42,
        rental_inventory_id: 1,
        seller_id: 33,
        branch_id: 1,
        booking_date: '2026-11-18',
        pickup_date: '2026-11-20',
        return_date: '2026-11-22',
        total_price: 500,
        deposit_amount: 1000,
        paid_amount: 500,
        remaining_amount: 1000,
        status: 'booked',
        payment_method: 'cash',
        offline_uuid: 'rent-901',
      },
    ],
    rental_payments: [
      { id: 911, rental_id: 901, amount: 500, payment_method: 'cash', payment_date: '2026-11-18', branch_id: 1, seller_id: 33, offline_uuid: 'rpay-911' },
    ],
    supplier_transactions: [
      { id: 1001, supplier_id: 1, branch_id: 1, transaction_type: 'payment', amount: 1500, payment_method: 'cash', paid_from_drawer: true, transaction_date: '2026-11-18', notes: 'دفعة مورد' },
    ],
    supply_records: [
      { id: 1101, supplier_id: 1, inventory_id: 1, branch_id: 1, quantity: 5, supply_date: '2026-11-18', cost_price: 1000, notes: 'توريد' },
    ],
    worn_products: [
      { id: 1201, product_type: 'sale', inventory_id: 1, branch_id: 1, quantity: 1, condition: 'damaged', reason: 'تمزق', estimated_loss: 500, created_by: 101, offline_uuid: 'worn-1201' },
    ],
    stock_transfers: [
      { id: 1301, inventory_id: 1, from_branch_id: 1, to_branch_id: 2, quantity: 2, status: 'completed', created_by: 101, sender_name: 'الفرع الرئيسي' },
    ],
  };

  await syncService.importCatalogIntoBranch(catalog, sqliteDb);

  // Verify customer & employee offline_uuid collision reconciliation + FK remapping
  const reconciledCust = sqliteDb.prepare('SELECT id, name FROM customers WHERE offline_uuid = ?').get('cust-uuid-collision-1');
  assert.strictEqual(reconciledCust.id, 42, 'Colliding customer must reconcile to central id 42');
  const remappedOrder = sqliteDb.prepare('SELECT customer_id FROM orders WHERE id = 888888').get();
  assert.strictEqual(remappedOrder.customer_id, 42, 'Local pending order FK must remap to reconciled customer_id 42');

  const reconciledEmp = sqliteDb.prepare('SELECT id, name FROM employees WHERE offline_uuid = ?').get('emp-uuid-collision-1');
  assert.strictEqual(reconciledEmp.id, 33, 'Colliding employee must reconcile to central id 33');
  const remappedAtt = sqliteDb.prepare('SELECT employee_id FROM attendance WHERE id = 777777').get();
  assert.strictEqual(remappedAtt.employee_id, 33, 'Local attendance FK must remap to reconciled employee_id 33');

  // Verify all operational/accounting tables imported & local pending expense preserved
  assert.ok(sqliteDb.prepare('SELECT id FROM expenses WHERE id = 201').get(), 'Central expense 201 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM expenses WHERE id = 555555').get(), 'Pending local expense 555555 must be preserved');
  assert.ok(sqliteDb.prepare("SELECT id, total_hours FROM attendance WHERE employee_id = 33 AND date = '2026-11-18'").get(), 'Attendance for employee 33 on 2026-11-18 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM employee_transactions WHERE id = 401').get(), 'Employee transaction 401 must sync down');
  assert.strictEqual(sqliteDb.prepare('SELECT COUNT(*) AS c FROM tailoring_orders WHERE invoice_number = ?').get('1001').c, 2, 'Two tailoring orders with same invoice_number across branches must coexist');
  assert.ok(sqliteDb.prepare('SELECT id FROM tailoring_payments WHERE id = 511').get(), 'Tailoring payment 511 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM alterations WHERE id = 601').get(), 'Alteration 601 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM orders WHERE id = 701').get(), 'Order 701 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM order_items WHERE id = 711').get(), 'Order item 711 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM order_payments WHERE id = 721').get(), 'Order payment 721 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM returns WHERE id = 801').get(), 'Return 801 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM return_items WHERE id = 811').get(), 'Return item 811 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM rentals WHERE id = 901').get(), 'Rental 901 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM rental_payments WHERE id = 911').get(), 'Rental payment 911 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM supplier_transactions WHERE id = 1001').get(), 'Supplier transaction 1001 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM supply_records WHERE id = 1101').get(), 'Supply record 1101 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM worn_products WHERE id = 1201').get(), 'Worn product 1201 must sync down');
  assert.ok(sqliteDb.prepare('SELECT id FROM stock_transfers WHERE id = 1301').get(), 'Stock transfer 1301 must sync down');

  // Verify accountant branch_scope enforced to 'all' and sync status timestamp set
  const acctRow = sqliteDb.prepare('SELECT branch_scope, permissions FROM users WHERE username = ?').get('hesabat_new');
  assert.strictEqual(acctRow.branch_scope, 'all', 'Accountant branch_scope must be normalized to all on import');
  const status = await syncService.getSyncStatus();
  assert.ok(status.last_catalog_imported_at, 'getSyncStatus should expose last_catalog_imported_at after import');
  console.log('✓ Two-way catalog import + FK/offline_uuid reconciliation + branch_scope verified');

  // 3. Test RBAC on sync routes & tailoring cancel routes
  const jwtSecret = config.JWT_SECRET || process.env.JWT_SECRET;
  const acctToken = jwt.sign(
    { id: 101, username: 'hesabat_new', role: 'accountant', branch_id: 2, branch_scope: 'all', token_version: 1 },
    jwtSecret
  );
  const tailorUserToken = jwt.sign(
    { id: 102, username: 'karika_tailor', role: 'branch_user', branch_id: 1, branch_scope: 'branch', token_version: 1 },
    jwtSecret
  );

  const makeReq = (token, reqPath = '/api/sync/pull') => ({
    path: reqPath,
    ip: '127.0.0.1',
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
    query: {},
    body: {},
    app: { get: () => false },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  });

  // Pull & cycle allowed for accountant / branch_user, configure forbidden for accountant
  for (const rPath of ['/sync/pull', '/sync/run', '/sync/cycle']) {
    const chain = getRouteMiddlewares(syncRoutes, 'post', rPath);
    const guards = [authMiddleware, ...chain.slice(0, -1)]; // full auth + route guards
    const { passed, res } = await runMiddlewareChain(guards, makeReq(acctToken, `/api${rPath}`));
    assert.strictEqual(passed, true, `Accountant should be allowed to trigger POST ${rPath} (status=${res.statusCode}, body=${JSON.stringify(res.body)})`);
  }
  {
    const chain = getRouteMiddlewares(syncRoutes, 'post', '/sync/configure');
    const guards = [authMiddleware, ...chain.slice(0, -1)];
    const { passed, res } = await runMiddlewareChain(guards, makeReq(acctToken, '/api/sync/configure'));
    assert.strictEqual(passed, false, 'Non-admin accountant must be rejected on POST /sync/configure');
    assert.strictEqual(res.statusCode, 403);
  }
  {
    const chain = getRouteMiddlewares(tailoringRoutes, 'delete', '/tailoring-orders/:id');
    const guards = [authMiddleware, ...chain.slice(0, -1)];
    const { passed, res } = await runMiddlewareChain(guards, makeReq(tailorUserToken, '/api/tailoring-orders/501'));
    assert.strictEqual(passed, true, `User with Tailoring.html / tailoring.edit should be allowed to cancel tailoring order (status=${res.statusCode}, body=${JSON.stringify(res.body)})`);
  }
  console.log('✓ Sync routes RBAC & Tailoring cancellation RBAC verified');

  // 4. Verify accountant permissions preset isolation constraint + capabilities
  const acctPerms = acctPresetPermissions;
  assert.strictEqual(acctPerms.includes('Suppliers.html'), false, 'Accountant preset must NOT include Suppliers.html');
  assert.strictEqual(acctPerms.includes('tailoring.delete'), true, 'Accountant preset must include tailoring.delete');
  assert.strictEqual(acctPerms.includes('Tailoring.html'), true, 'Accountant preset must include Tailoring.html');
  assert.strictEqual(acctPerms.includes('expenses.delete'), true, 'Accountant preset must include expenses.delete');

  // 5. Verify accountant can update/delete another user's expense (ID 555555 created_by=9, acct user id=101)
  const updateRes = await expensesService.updateExpense(
    555555,
    { category: 'كهرباء ومياه', amount: 150, expense_date: '2026-11-18', notes: 'Updated by accountant', payment_method: 'cash', branch_id: 2 },
    { id: 101, username: 'hesabat_new', role: 'accountant', branch_id: 2, branch_scope: 'all', permissions: acctPerms },
    { ip: '127.0.0.1' }
  );
  assert.strictEqual(Number(updateRes.amount), 150, 'Accountant should be able to update expense created by another user');

  // 6. Verify worn product queues sync operation
  const wornRes = await expensesService.createWornProduct(
    { product_type: 'sale', inventory_id: 1, branch_id: 1, quantity: 1, condition: 'damaged', reason: 'تالف اختبار', estimated_loss: 200 },
    { id: 101, username: 'hesabat_new', role: 'accountant', branch_id: 1, branch_scope: 'all' }
  );
  assert.ok(wornRes?.id, 'createWornProduct should create record');
  const wornQueueOp = sqliteDb.prepare("SELECT * FROM sync_queue WHERE entity_type = 'worn_product' AND entity_id = ?").get(wornRes.id);
  assert.ok(wornQueueOp, 'createWornProduct should enqueue sync_queue operation');
  console.log('✓ Accountant cross-user expense edit & worn product sync enqueue verified');

  // 7. Verify inventory barcode collision FK remap, supplier collision FK remap, color/size dup cleanup,
  //    obsolete inventory_sizes removal, and row-level pending stock_transfer preservation
  sqliteDb.exec("DELETE FROM sync_queue WHERE status != 'synced';");
  sqliteDb.prepare(`
    INSERT INTO suppliers (id, name, phone, code, balance, is_active, status)
    VALUES (8888, 'مورد تصادم', '0109998888', 'SUP-COL-1', 0, 1, 'active')
  `).run();
  sqliteDb.prepare(`
    INSERT INTO inventory (id, name, category, size_cut, color, barcode, stock_level, price, cost_price, preferred_supplier_id)
    VALUES (7777, 'صنف تصادم باركود', 'بدل', '50', 'أسود', 'BC-COL-7777', 5, 1000, 500, 8888)
  `).run();
  sqliteDb.prepare(`
    INSERT INTO colors (id, name) VALUES (6661, 'ذهبي اختبار')
  `).run();
  sqliteDb.prepare(`
    INSERT INTO sizes (id, name) VALUES (6662, '58-اختبار')
  `).run();
  sqliteDb.prepare(`
    INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id)
    VALUES (1, 1, 'OBSOLETE_SIZE', 'أسود', 'OBS-1', 3, 1)
  `).run();
  sqliteDb.prepare(`
    INSERT INTO order_items (id, order_id, inventory_id, quantity, price_at_time, size)
    VALUES (7701, 701, 7777, 1, 1000, '50')
  `).run();
  sqliteDb.prepare(`
    INSERT INTO supplier_transactions (id, supplier_id, branch_id, transaction_type, amount, paid_from_drawer)
    VALUES (8801, 8888, 1, 'payment', 300, 1)
  `).run();
  // One pending local stock_transfer (id=9901) that must NOT block central transfer (id=9902)
  sqliteDb.prepare(`
    INSERT INTO stock_transfers (id, inventory_id, from_branch_id, to_branch_id, quantity, status)
    VALUES (9901, 1, 1, 2, 1, 'pending')
  `).run();
  sqliteDb.prepare(`
    INSERT INTO sync_queue (operation_uuid, entity_type, entity_id, branch_id, action, payload, status)
    VALUES ('op-tr-9901', 'stock_transfer', 9901, 1, 'transfer', '{}', 'pending')
  `).run();

  const reconcileCatalog = {
    branches: catalog.branches,
    colors: [...catalog.colors, { id: 91, name: 'ذهبي اختبار' }],
    sizes: [...catalog.sizes, { id: 92, name: '58-اختبار' }],
    suppliers: [
      ...catalog.suppliers,
      { id: 75, name: 'مورد تصادم', phone: '0109998888', code: 'SUP-COL-1', balance: 500, status: 'active' },
    ],
    inventory: [
      ...catalog.inventory,
      { id: 76, name: 'صنف تصادم باركود', category: 'بدل', size_cut: '50', color: 'أسود', barcode: 'BC-COL-7777', stock_level: 5, price: 1000, cost_price: 500, preferred_supplier_id: 75 },
    ],
    inventory_sizes: [
      { inventory_id: 1, size_id: 1, size_name: '50', color_name: 'أسود', barcode: 'BC-1-50', stock_level: 10, branch_id: 1 },
    ],
    stock_transfers: [
      ...catalog.stock_transfers,
      { id: 9901, inventory_id: 1, from_branch_id: 1, to_branch_id: 2, quantity: 99, status: 'completed' },
      { id: 9902, inventory_id: 1, from_branch_id: 2, to_branch_id: 3, quantity: 4, status: 'pending' },
    ],
  };

  await syncService.importCatalogIntoBranch(reconcileCatalog, sqliteDb);

  const remappedOi = sqliteDb.prepare('SELECT inventory_id FROM order_items WHERE id = 7701').get();
  assert.strictEqual(remappedOi.inventory_id, 76, 'order_items must remap colliding inventory_id 7777 -> 76');
  const remappedSt = sqliteDb.prepare('SELECT supplier_id FROM supplier_transactions WHERE id = 8801').get();
  assert.strictEqual(remappedSt.supplier_id, 75, 'supplier_transactions must remap colliding supplier_id 8888 -> 75');
  assert.strictEqual(sqliteDb.prepare('SELECT COUNT(*) AS c FROM colors WHERE LOWER(TRIM(name)) = ?').get('ذهبي اختبار').c, 1, 'Duplicate color must collapse to central id');
  assert.strictEqual(sqliteDb.prepare('SELECT id FROM colors WHERE LOWER(TRIM(name)) = ?').get('ذهبي اختبار').id, 91, 'Color must have central id 91');
  assert.strictEqual(sqliteDb.prepare('SELECT COUNT(*) AS c FROM sizes WHERE LOWER(TRIM(name)) = ?').get('58-اختبار').c, 1, 'Duplicate size must collapse to central id');
  assert.strictEqual(sqliteDb.prepare('SELECT quantity FROM stock_transfers WHERE id = 9901').get().quantity, 1, 'Pending local transfer 9901 must not be overwritten');
  assert.strictEqual(sqliteDb.prepare('SELECT quantity FROM stock_transfers WHERE id = 9902').get().quantity, 4, 'Non-pending server transfer 9902 must import despite another pending transfer');
  assert.strictEqual(sqliteDb.prepare("SELECT COUNT(*) AS c FROM inventory_sizes WHERE size_name = 'OBSOLETE_SIZE'").get().c, 1, 'Obsolete inventory_sizes row is safely protected while a stock_transfer op is still pending');

  // Once the pending stock_transfer op finishes syncing, obsolete inventory_sizes must clean up cleanly
  sqliteDb.exec("UPDATE sync_queue SET status = 'synced' WHERE operation_uuid = 'op-tr-9901';");
  await syncService.importCatalogIntoBranch(reconcileCatalog, sqliteDb);
  assert.strictEqual(sqliteDb.prepare("SELECT COUNT(*) AS c FROM inventory_sizes WHERE size_name = 'OBSOLETE_SIZE'").get().c, 0, 'Obsolete inventory_sizes row must be cleaned up once no pending size ops remain');
  console.log('✓ Collision FK remapping, color/size deduplication, obsolete size cleanup & row-level transfer skip verified');

  sqliteDb.close();
  console.log('=== ALL TWO-WAY SYNC & ACCOUNTANT VERIFICATION CHECKS PASSED ===');
  process.exit(0);
})().catch((err) => {
  console.error('FAIL:', err);
  try { dbConnection.sqlite?.close(); } catch {}
  process.exit(1);
});
