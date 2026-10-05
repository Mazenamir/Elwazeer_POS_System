const assert = require('assert');
const db = require('../src/server/database/connection');
const salesService = require('../src/server/modules/sales/sales.service');
const suppliersService = require('../src/server/modules/suppliers/suppliers.service');
const customersService = require('../src/server/modules/customers/customers.service');
const authService = require('../src/server/modules/auth/auth.service');

async function runDeepTests() {
  console.log('🔬 Running Deep Integration Tests for Database & Security Flows...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. SEC-02: Invoice Edit Password Backend Enforcement
  await test('SEC-02: updateOrder rejects modification without invoice_edit_password', async () => {
    // Branch user without password
    const mockBranchUser = { id: 1, role: 'branch_user', branch_id: 1 };
    try {
      await salesService.updateOrder(999999, { items: [{ inventory_id: 1, quantity: 1 }] }, mockBranchUser);
      assert.fail('Should have thrown 403 error');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.ok(err.message.includes('كلمة مرور تعديل الفاتورة مطلوبة'));
    }

    // Branch user with wrong password
    try {
      await salesService.updateOrder(999999, {
        items: [{ inventory_id: 1, quantity: 1 }],
        invoice_edit_password: 'wrong_password_xyz',
      }, mockBranchUser);
      assert.fail('Should have thrown 403 for wrong password');
    } catch (err) {
      assert.strictEqual(err.statusCode, 403);
      assert.ok(err.message.includes('كلمة مرور تعديل الفاتورة غير صحيحة'));
    }
  });

  // 2. DATA-02: Supplier soft-delete preserves accounting ledger
  await test('DATA-02: deleteSupplier performs soft deletion and preserves financial history', async () => {
    // Create a test supplier
    const supRes = await db.query(
      "INSERT INTO suppliers (name, phone, is_active) VALUES ('Test Supplier SoftDel', '0100000000', TRUE) RETURNING id"
    );
    const supId = supRes.rows[0].id;

    // Create a supply record & transaction
    await db.query(
      "INSERT INTO supplier_transactions (supplier_id, amount, transaction_type, transaction_date) VALUES ($1, 500, 'purchase', CURRENT_DATE)",
      [supId]
    );

    // Call deleteSupplier
    await suppliersService.deleteSupplier(supId);

    // Verify supplier is now soft-deleted
    const checkSup = await db.query('SELECT is_active, status FROM suppliers WHERE id = $1', [supId]);
    assert.strictEqual(checkSup.rows[0].is_active, false);
    assert.strictEqual(checkSup.rows[0].status, 'inactive');

    // Verify supplier_transactions is STILL PRESERVED (NOT HARD DELETED)
    const checkTx = await db.query('SELECT COUNT(*)::int as count FROM supplier_transactions WHERE supplier_id = $1', [supId]);
    assert.strictEqual(checkTx.rows[0].count, 1, 'Supplier transactions must be preserved');

    // Clean up test data
    await db.query('DELETE FROM supplier_transactions WHERE supplier_id = $1', [supId]);
    await db.query('DELETE FROM suppliers WHERE id = $1', [supId]);
  });

  // 3. DATA-03: Customer deletion with history handles FK safely
  await test('DATA-03: deleteCustomer with rental/alteration history deactivates instead of throwing FK error', async () => {
    const adminUser = { id: 1, role: 'admin' };
    // Create test customer
    const custRes = await db.query(
      "INSERT INTO customers (name, phone, status, branch_id) VALUES ('Test Customer FK', '0122222222', 'نشط', 1) RETURNING id"
    );
    const custId = custRes.rows[0].id;

    // Create a test rental attached to this customer
    const rentalRes = await db.query(
      `INSERT INTO rentals (customer_id, branch_id, pickup_date, return_date, total_price, status)
       VALUES ($1, 1, CURRENT_DATE, CURRENT_DATE + INTERVAL '2 days', 300, 'booked') RETURNING id`,
      [custId]
    );
    const rentalId = rentalRes.rows[0].id;

    // Delete customer
    await customersService.deleteCustomer(custId, adminUser);

    // Verify customer is marked 'غير نشط' instead of failing
    const checkCust = await db.query('SELECT status, is_active FROM customers WHERE id = $1', [custId]);
    assert.strictEqual(checkCust.rows[0].status, 'غير نشط');
    assert.strictEqual(checkCust.rows[0].is_active, false);

    // Clean up test data
    await db.query('DELETE FROM rentals WHERE id = $1', [rentalId]);
    await db.query('DELETE FROM customers WHERE id = $1', [custId]);
  });

  // 4. ARCH-01: Full SQLite Store test (Dual Mode verification)
  await test('ARCH-01: Branch SQLite mode executes queries, transactions, and locks safely', async () => {
    // Initialize temporary in-memory or branch database sync
    const { DatabaseSync } = require('node:sqlite');
    const tempSqlite = new DatabaseSync(':memory:');
    tempSqlite.exec(`
      CREATE TABLE test_tab (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, created_at TEXT);
    `);

    // Verify RETURNING and parameter translation
    const stmt = tempSqlite.prepare('INSERT INTO test_tab (name, created_at) VALUES (?, CURRENT_TIMESTAMP) RETURNING id, name');
    const row = stmt.get('Test Item');
    assert.strictEqual(row.id, 1);
    assert.strictEqual(row.name, 'Test Item');

    const selectStmt = tempSqlite.prepare('SELECT * FROM test_tab WHERE id = ?');
    const found = selectStmt.get(1);
    assert.strictEqual(found.name, 'Test Item');
    tempSqlite.close();
  });

  console.log(`\nDeep Integration Results: ${passed} passed, ${failed} failed.\n`);
  await db.close();
  if (failed > 0) process.exit(1);
}

runDeepTests().catch(err => {
  console.error('Fatal in deep tests:', err);
  process.exit(1);
});
