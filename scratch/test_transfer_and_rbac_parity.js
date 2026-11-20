const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');

const tmpDbPath = path.join(os.tmpdir(), `elwazeer_rbac_parity_${Date.now()}.sqlite`);
process.env.APP_MODE = 'branch';
process.env.BRANCH_SQLITE_PATH = tmpDbPath;
process.env.BRANCH_ID = '1';

const config = require('../src/server/config/env');
const db = require('../src/server/database/connection');
const { runMigrations } = require('../src/server/database/migrator');
const app = require('../src/server/app');

function makeToken(payload) {
  return jwt.sign(payload, config.JWT_SECRET || 'secret', { expiresIn: '2h' });
}

async function runTests() {
  console.log('=== Running Transfer & System-Wide RBAC Parity Tests (SQLite) ===\n');

  await runMigrations();

  // Seed 2 branches + 1 product with stock in branch 2 and branch 1
  await db.query("INSERT OR IGNORE INTO branches (id, name, rentals_enabled) VALUES (1, 'الفرع الرئيسي', 1)");
  await db.query("INSERT OR IGNORE INTO branches (id, name, rentals_enabled) VALUES (2, 'فرع 2', 1)");
  await db.query("INSERT OR IGNORE INTO inventory (id, name, price, cost_price, barcode) VALUES (101, 'بدلة اختبار', 1000, 500, '999000101')");
  await db.query("INSERT OR IGNORE INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES (101, 1, 10)");
  await db.query("INSERT OR IGNORE INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES (101, 2, 10)");

  // Seed a requested transfer (from branch 2 -> to branch 1) and a pending transfer (from branch 2 -> to branch 1)
  await db.query("INSERT INTO stock_transfers (id, inventory_id, from_branch_id, to_branch_id, quantity, status) VALUES (501, 101, 1, 2, 1, 'requested')");
  await db.query("INSERT INTO stock_transfers (id, inventory_id, from_branch_id, to_branch_id, quantity, status) VALUES (502, 101, 2, 1, 1, 'pending')");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  try {
    // 1. Cashier with pos.sales.create can submit a stock request (is_request: true)
    const cashierToken = makeToken({
      id: 910,
      username: 'cashier1',
      role: 'branch_user',
      branch_id: 1,
      branch_scope: 'single',
      permissions: ['index.html', 'pos.sales.view', 'pos.sales.create'],
    });

    await test('T1: Cashier (pos.sales.create) can send a stock transfer request (is_request=true)', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}` },
        body: JSON.stringify({ inventory_id: 101, from_branch_id: 2, to_branch_id: 1, quantity: 1, is_request: true }),
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    });

    await test('T2: Cashier (pos.sales.create) is rejected (403) on direct/non-request transfer', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashierToken}` },
        body: JSON.stringify({ inventory_id: 101, from_branch_id: 1, to_branch_id: 2, quantity: 1, is_request: false, direct_transfer: true }),
      });
      assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    });

    // 2. User with inventory.transfers.request only cannot do direct_transfer: true
    const reqOnlyToken = makeToken({
      id: 911,
      username: 'req_only',
      role: 'branch_user',
      branch_id: 1,
      branch_scope: 'single',
      permissions: ['inventory.transfers.view', 'inventory.transfers.request'],
    });

    await test('T3: User with inventory.transfers.request only is rejected (403) on direct_transfer=true', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reqOnlyToken}` },
        body: JSON.stringify({ inventory_id: 101, from_branch_id: 1, to_branch_id: 2, quantity: 1, direct_transfer: true }),
      });
      assert.strictEqual(res.status, 403, `Expected 403, got ${res.status}`);
    });

    await test('T4: User with inventory.transfers.request only CAN send pending shipment (direct_transfer=false)', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reqOnlyToken}` },
        body: JSON.stringify({ inventory_id: 101, from_branch_id: 1, to_branch_id: 2, quantity: 1, direct_transfer: false }),
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    });

    // 3. listTransferLogs action flags match route permissions
    await test('T5: listTransferLogs returns can_approve=false and can_receive=false for user without approve/receive permissions', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/transfers/logs`, {
        headers: { Authorization: `Bearer ${reqOnlyToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const row501 = data.items.find((i) => Number(i.id) === 501);
      const row502 = data.items.find((i) => Number(i.id) === 502);
      assert.ok(row501 && row502, 'Seeded transfer rows should be present');
      assert.strictEqual(row501.can_approve, false, 'can_approve must be false without inventory.transfers.approve');
      assert.strictEqual(row502.can_receive, false, 'can_receive must be false without inventory.transfers.receive');
    });

    const approveReceiveToken = makeToken({
      id: 912,
      username: 'inv_mgr',
      role: 'branch_user',
      branch_id: 1,
      branch_scope: 'single',
      permissions: ['inventory.transfers.view', 'inventory.transfers.approve', 'inventory.transfers.receive'],
    });

    await test('T6: listTransferLogs returns can_approve=true and can_receive=true for branch user with approve/receive permissions', async () => {
      const res = await fetch(`${baseUrl}/api/inventory/transfers/logs`, {
        headers: { Authorization: `Bearer ${approveReceiveToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const row501 = data.items.find((i) => Number(i.id) === 501);
      const row502 = data.items.find((i) => Number(i.id) === 502);
      assert.strictEqual(row501.can_approve, true, 'can_approve must be true with inventory.transfers.approve on own branch');
      assert.strictEqual(row502.can_receive, true, 'can_receive must be true with inventory.transfers.receive on own branch');
    });

    // 4. Granular view-only enforcement across modules
    const viewOnlyToken = makeToken({
      id: 913,
      username: 'viewer',
      role: 'branch_user',
      branch_id: 1,
      branch_scope: 'single',
      permissions: [
        'worn_products.view',
        'customers.list.view',
        'alterations.view',
        'tailoring.view',
        'rentals.contracts.view',
        'rental_inventory.items.view',
      ],
    });

    const viewOnlyChecks = [
      ['GET', '/api/worn-products', 200],
      ['POST', '/api/worn-products', 403],
      ['DELETE', '/api/worn-products/1', 403],
      ['GET', '/api/customers', 200],
      ['POST', '/api/customers', 403],
      ['PUT', '/api/customers/1', 403],
      ['GET', '/api/alterations', 200],
      ['POST', '/api/alterations', 403],
      ['GET', '/api/tailoring-orders', 200],
      ['POST', '/api/tailoring-orders', 403],
      ['GET', '/api/rentals', 200],
      ['POST', '/api/rentals', 403],
      ['PUT', '/api/rentals/1/cancel', 403],
      ['GET', '/api/rental-inventory', 200],
      ['POST', '/api/rental-inventory', 403],
    ];

    for (const [method, endpoint, expectedStatus] of viewOnlyChecks) {
      await test(`T7 (${method} ${endpoint}): view-only user receives ${expectedStatus}`, async () => {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewOnlyToken}` },
          body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify({}) : undefined,
        });
        assert.strictEqual(res.status, expectedStatus, `Expected ${expectedStatus}, got ${res.status}`);
      });
    }

    // 5. Legacy user still blocked on sensitive delete routes
    const legacyToken = makeToken({
      id: 914,
      username: 'legacy',
      role: 'branch_user',
      branch_id: 1,
      branch_scope: 'single',
      permissions: ['WornProducts.html', 'Customers.html'],
    });

    await test('T8: Legacy WornProducts.html user is blocked (403) from DELETE /api/worn-products/1', async () => {
      const res = await fetch(`${baseUrl}/api/worn-products/1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${legacyToken}` },
      });
      assert.strictEqual(res.status, 403);
    });
  } finally {
    server.close();
    if (db.close) await db.close();
    try { fs.unlinkSync(tmpDbPath); } catch {}
  }

  console.log(`\n=== Summary: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
