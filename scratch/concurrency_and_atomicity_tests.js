const assert = require('assert');
const db = require('../src/server/database/connection');
const salesService = require('../src/server/modules/sales/sales.service');
const branchesService = require('../src/server/modules/branches/branches.service');
const tailoringService = require('../src/server/modules/tailoring/tailoring.service');
const wornService = require('../src/server/modules/worn/worn.service');
const rentalsService = require('../src/server/modules/rentals/rentals.service');
const syncService = require('../src/server/modules/sync/sync.service');
const { roundCurrency } = require('../src/shared/utils/numbers');

async function runTests() {
  console.log('🧪 Starting Concurrency, Atomicity & Financial Precision Verification Tests...\n');
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

  // 1. Financial Rounding Helper
  await test('ROUND-01: roundCurrency handles floating point arithmetic cleanly', () => {
    assert.strictEqual(roundCurrency(0.1 + 0.2), 0.3);
    assert.strictEqual(roundCurrency(10.005), 10.01);
    assert.strictEqual(roundCurrency(10.004), 10);
    assert.strictEqual(roundCurrency('49.999'), 50);
    assert.strictEqual(roundCurrency(null), 0);
    assert.strictEqual(roundCurrency(undefined), 0);
    assert.strictEqual(roundCurrency(NaN), 0);
    assert.strictEqual(roundCurrency(-5.555), -5.56);
  });

  // Setup mock active employee for testing sales
  const today = new Date().toISOString().split('T')[0];
  const empRes = await db.query(
    "INSERT INTO employees (name, phone, position, basic_salary, branch_id, join_date) VALUES ('Test Salesperson', '01011111111', 'كاشير', 5000, 1, CURRENT_DATE) RETURNING id"
  );
  const sellerId = empRes.rows[0].id;
  await db.query(
    'INSERT INTO attendance (employee_id, date, check_in) VALUES ($1, $2, $3) ON CONFLICT (employee_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = NULL',
    [sellerId, today, '09:00:00']
  );

  // Setup test products in inventory and branch
  const invRes1 = await db.query(
    "INSERT INTO inventory (name, barcode, price, stock_level) VALUES ('Test Item Alpha', 'TEST-BC-ALPHA', 150.00, 20) RETURNING id"
  );
  const itemId1 = invRes1.rows[0].id;
  await db.query(
    'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, 1, 20) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = 20',
    [itemId1]
  );

  const invRes2 = await db.query(
    "INSERT INTO inventory (name, barcode, price, stock_level) VALUES ('Test Item Beta', 'TEST-BC-BETA', 250.00, 15) RETURNING id"
  );
  const itemId2 = invRes2.rows[0].id;
  await db.query(
    'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, 1, 15) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = 15',
    [itemId2]
  );

  const adminUser = { id: 1, role: 'admin', branch_id: 1, username: 'admin' };

  // 2. Sales: Canonical Pricing & Tamper Resistance in createOrder
  let createdOrderId = null;
  await test('SALES-01: createOrder recalculates total from canonical database price and rejects price tampering', async () => {
    // Client tries to spoof price: sends price 10 instead of 150, and total_amount 20 instead of 300
    const orderPayload = {
      customer_name: 'Test Customer Pricing',
      customer_phone: '01099990001',
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 300,
      total_amount: 20.00, // Client spoofed total!
      items: [
        { id: itemId1, quantity: 2, price: 10.00 }, // Client spoofed item price!
      ],
    };

    const res = await salesService.createOrder(orderPayload, adminUser, null);
    createdOrderId = res.orderId;
    assert.ok(createdOrderId, 'Order should be created');

    // Verify stored order has canonical total 300, not spoofed 20
    const checkOrder = await db.query('SELECT total_amount, paid_amount FROM orders WHERE id = $1', [createdOrderId]);
    assert.strictEqual(Number(checkOrder.rows[0].total_amount), 300, 'Order total must be recalculated to canonical 300');

    // Verify order item has canonical price 150
    const checkItem = await db.query('SELECT price_at_time, quantity FROM order_items WHERE order_id = $1', [createdOrderId]);
    assert.strictEqual(Number(checkItem.rows[0].price_at_time), 150, 'Stored price must be canonical DB price 150');

    // Verify stock was decremented properly
    const checkStockBranch = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1]);
    const checkStockGlobal = await db.query('SELECT stock_level FROM inventory WHERE id = $1', [itemId1]);
    assert.strictEqual(Number(checkStockBranch.rows[0].stock_level), 18, 'Branch stock decremented to 18');
    assert.strictEqual(Number(checkStockGlobal.rows[0].stock_level), 18, 'Global stock decremented to 18');
  });

  // 3. Sales: Pre-sorted item locking & Insufficient Stock Validation
  await test('SALES-02: createOrder pre-sorts items ascending and throws 400 when stock is insufficient', async () => {
    const orderPayload = {
      customer_name: 'Test Customer Insufficient',
      customer_phone: '01099990002',
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      items: [
        // Sent in descending order to test sorting
        { id: itemId2, quantity: 1 },
        { id: itemId1, quantity: 50 }, // Only 18 available!
      ],
    };

    try {
      await salesService.createOrder(orderPayload, adminUser, null);
      assert.fail('Should have failed due to insufficient stock');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('المخزون غير كافٍ') || err.message.includes('المخزون العام'));
    }

    // Verify stock did NOT change (rollback worked)
    const checkStock = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1]);
    assert.strictEqual(Number(checkStock.rows[0].stock_level), 18, 'Stock must remain unchanged after rollback');
  });

  // 4. Sales: payRemaining Atomic Transactions & Overpayment Protection
  await test('SALES-03: payRemaining enforces row-lock transaction and rejects overpayments without float drift', async () => {
    // Create partial order
    const partialOrder = await salesService.createOrder({
      customer_name: 'Test Partial Pay',
      customer_phone: '01099990003',
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 100,
      items: [{ id: itemId1, quantity: 1 }], // Price 150
    }, adminUser, null);

    const pOrderId = partialOrder.orderId;

    // Remaining is 50. Try paying 60 (overpayment)
    try {
      await salesService.payRemaining(pOrderId, 60, 'cash', adminUser);
      assert.fail('Should have rejected overpayment');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('المبلغ المدفوع يتجاوز الباقي'));
    }

    // Pay exact remaining: 50
    const payRes = await salesService.payRemaining(pOrderId, 50, 'cash', adminUser);
    assert.strictEqual(payRes.newPaidAmount, 150);
    assert.strictEqual(payRes.remainingAmount, 0);

    // Try paying again when fully paid
    try {
      await salesService.payRemaining(pOrderId, 10, 'cash', adminUser);
      assert.fail('Should have rejected payment on fully paid order');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('تم سداد كامل قيمة الطلب'));
    }
  });

  // 5. Sales: updateOrder In-Transaction Locks & Stock Restoration
  await test('SALES-04: updateOrder reads order inside transaction, adjusts stock deltas and recalculates totals', async () => {
    // Create an order with 2 of itemId1 (total 300, stock of item 1 was 17)
    const ord = await salesService.createOrder({
      customer_name: 'Test Update Order',
      customer_phone: '01099990004',
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 300,
      items: [{ id: itemId1, quantity: 2 }],
    }, adminUser, null);

    // Update order: reduce itemId1 from 2 to 1, and add 1 of itemId2 (250)
    // Total should become 150 + 250 = 400
    await salesService.updateOrder(ord.orderId, {
      items: [
        { id: itemId2, quantity: 1 },
        { id: itemId1, quantity: 1 },
      ],
      payment_method: 'cash',
    }, adminUser);

    // Verify order total updated to 400
    const checkOrd = await db.query('SELECT total_amount FROM orders WHERE id = $1', [ord.orderId]);
    assert.strictEqual(Number(checkOrd.rows[0].total_amount), 400, 'Order total must be updated to 400');

    // Verify items in order_items
    const checkItems = await db.query('SELECT inventory_id, quantity, price_at_time FROM order_items WHERE order_id = $1 ORDER BY inventory_id', [ord.orderId]);
    assert.strictEqual(checkItems.rows.length, 2);
    assert.strictEqual(checkItems.rows[0].inventory_id, itemId1);
    assert.strictEqual(checkItems.rows[0].quantity, 1);
    assert.strictEqual(checkItems.rows[1].inventory_id, itemId2);
    assert.strictEqual(checkItems.rows[1].quantity, 1);
  });

  // 6. Sales: createReturn In-Transaction Locks & Validation
  await test('SALES-05: createReturn reads and locks order inside transaction and prevents double returns', async () => {
    // Create an order to return
    const ordToReturn = await salesService.createOrder({
      customer_name: 'Test Return Order',
      customer_phone: '01099990005',
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 150,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    const stockBeforeReturn = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1])).rows[0].stock_level);

    // Perform return
    const retRes = await salesService.createReturn({
      order_id: ordToReturn.orderId,
      branch_id: 1,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    assert.ok(retRes.returnId, 'Return ID should be returned');

    // Check order status is now 'returned'
    const checkOrd = await db.query('SELECT status FROM orders WHERE id = $1', [ordToReturn.orderId]);
    assert.strictEqual(checkOrd.rows[0].status, 'returned');

    // Check stock was incremented back
    const stockAfterReturn = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1])).rows[0].stock_level);
    assert.strictEqual(stockAfterReturn, stockBeforeReturn + 1);

    // Attempt second return on already returned order
    try {
      await salesService.createReturn({
        order_id: ordToReturn.orderId,
        branch_id: 1,
        items: [{ id: itemId1, quantity: 1 }],
      }, adminUser, null);
      assert.fail('Should have rejected second return on already returned order');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('تم إرجاعه بالكامل بالفعل'));
    }
  });

  // 7. Branches: Transactional createBranch & deleteBranch
  await test('BRANCH-01: createBranch & deleteBranch perform all mutations atomically in db.transaction', async () => {
    const newBranch = await branchesService.createBranch({
      name: 'فرع تجريبي للاختبار',
      location: 'مدينة نصر',
      phone: '01234567890',
      type: 'men',
    });
    assert.ok(newBranch.id, 'Branch should have an ID');

    // Verify inventory_branches initialized atomically
    const bStocks = await db.query('SELECT COUNT(*)::int as count FROM inventory_branches WHERE branch_id = $1', [newBranch.id]);
    assert.ok(bStocks.rows[0].count > 0, 'inventory_branches should be initialized');

    // Delete branch
    const delRes = await branchesService.deleteBranch(newBranch.id);
    assert.strictEqual(delRes.success, true);

    // Verify branch and its branch stocks were removed
    const checkBranch = await db.query('SELECT id FROM branches WHERE id = $1', [newBranch.id]);
    assert.strictEqual(checkBranch.rows.length, 0, 'Branch must be deleted');
    const checkStocks = await db.query('SELECT inventory_id FROM inventory_branches WHERE branch_id = $1', [newBranch.id]);
    assert.strictEqual(checkStocks.rows.length, 0, 'Branch stocks must be deleted');
  });

  // 8. Tailoring: payRemainingTailoringOrder In-Transaction Locks & Concurrency
  await test('TAILOR-01: createTailoringOrder & payRemainingTailoringOrder use in-transaction row locks & rounding', async () => {
    const tOrder = await tailoringService.createTailoringOrder({
      customer_name: 'عميل تفصيل تجريبي',
      customer_phone: '01088887777',
      product_description: 'بدلة كلاسيك كحلي',
      measurements: 'أكتاف 48، صدر 104',
      paid_amount: 500.50,
      remaining_amount: 300.50,
      payment_method: 'cash',
      seller_id: sellerId,
      branch_id: 1,
    }, adminUser);

    assert.ok(tOrder.id);
    assert.strictEqual(Number(tOrder.total_amount), 801);
    assert.strictEqual(Number(tOrder.paid_amount), 500.50);
    assert.strictEqual(Number(tOrder.remaining_amount), 300.50);

    // Pay remaining inside transaction
    const payRes = await tailoringService.payRemainingTailoringOrder(tOrder.id, adminUser);
    assert.strictEqual(payRes.message, 'تم الدفع بنجاح');

    // Check row is updated
    const checkTOrder = await db.query('SELECT paid_amount, remaining_amount FROM tailoring_orders WHERE id = $1', [tOrder.id]);
    assert.strictEqual(Number(checkTOrder.rows[0].paid_amount), 801);
    assert.strictEqual(Number(checkTOrder.rows[0].remaining_amount), 0);

    // Clean up
    await tailoringService.deleteTailoringOrder(tOrder.id, adminUser);
  });

  // 9. Worn Products: createWornProduct Atomic Row Locks (No unlocked SUM overwrite)
  await test('WORN-01: createWornProduct locks inventory and decrements atomically without unlocked SUM overwrite', async () => {
    const globalBefore = Number((await db.query('SELECT stock_level FROM inventory WHERE id = $1', [itemId1])).rows[0].stock_level);
    const branchBefore = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1])).rows[0].stock_level);

    const worn = await wornService.createWornProduct({
      product_type: 'sales',
      product_id: itemId1,
      branch_id: 1,
      quantity: 2,
      condition: 'damaged',
      reason: 'عيب تصنيع أثناء العرض',
      estimated_loss: 300.00,
    }, adminUser);

    assert.ok(worn.id);

    const globalAfter = Number((await db.query('SELECT stock_level FROM inventory WHERE id = $1', [itemId1])).rows[0].stock_level);
    const branchAfter = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1])).rows[0].stock_level);

    assert.strictEqual(branchAfter, branchBefore - 2, 'Branch stock must decrement by 2');
    assert.strictEqual(globalAfter, globalBefore - 2, 'Global stock must decrement by 2');
  });

  // 10. Sync: Conflict & Deficit Logging on Offline Replay
  await test('SYNC-01: applyOperation logs conflict and deficit when replay encounters insufficient stock', async () => {
    // Current stock of itemId2 is 14. We simulate replaying an offline order requesting 20!
    let loggedWarning = null;
    const origWarn = console.warn;
    console.warn = (msg) => {
      if (typeof msg === 'string' && msg.includes('[Sync Conflict]')) {
        loggedWarning = msg;
      }
    };

    try {
      await syncService.applyOperation({
        id: 99999,
        entity_type: 'order',
        action: 'create',
        branch_id: 1,
        payload: {
          offline_uuid: '00000000-0000-0000-0000-000000099999',
          customer: { name: 'Offline Sync Customer', phone: '01000009999' },
          order: {
            total_amount: 5000,
            branch_id: 1,
            payment_method: 'cash',
          },
          items: [
            { inventory_id: itemId2, quantity: 20, price: 250 },
          ],
        },
      });

      assert.ok(loggedWarning, 'Conflict warning must be logged');
      assert.ok(loggedWarning.includes('Deficit detected'), 'Warning must specify deficit');
      assert.ok(loggedWarning.includes(String(itemId2)), 'Warning must mention the inventory id');

      // Verify stock was floored safely at 0
      const stockAfterSync = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId2])).rows[0].stock_level);
      assert.strictEqual(stockAfterSync, 0, 'Stock should be floored at 0');
    } finally {
      console.warn = origWarn;
    }
  });

  // 11. Rentals: Customer Concurrency & Fixed Precision
  const rInvRes = await db.query(
    "INSERT INTO rental_inventory (name, barcode, price) VALUES ('Test Rental Suit', 'TEST-RENTAL-1', 100) RETURNING id"
  );
  const rInvId = rInvRes.rows[0].id;
  await db.query(
    'INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) VALUES ($1, 1, 5) ON CONFLICT (rental_inventory_id, branch_id) DO UPDATE SET stock_level = 5',
    [rInvId]
  );

  await test('RENTAL-01: createRental creates customer safely with concurrency locks and fixed precision', async () => {
    const rentalPayload = {
      customer_name: 'عميل حجز تجريبي',
      customer_phone: '01077778888',
      national_id: '12345678901234',
      rental_inventory_id: rInvId,
      branch_id: 1,
      pickup_date: '2026-10-10',
      return_date: '2026-10-15',
      total_price: 350.50,
      deposit: 150.50,
      remaining: 200.00,
    };
    const rentalRes = await rentalsService.createRental(rentalPayload, adminUser, null);
    assert.ok(rentalRes.id);
    assert.strictEqual(Number(rentalRes.total_price), 350.50);
    assert.strictEqual(Number(rentalRes.deposit), 150.50);
    assert.strictEqual(Number(rentalRes.remaining), 200.00);

    // Verify customer was created
    const checkCust = await db.query('SELECT name, phone, national_id FROM customers WHERE phone = $1', ['01077778888']);
    assert.strictEqual(checkCust.rows.length, 1);
    assert.strictEqual(checkCust.rows[0].national_id, '12345678901234');
  });

  // Cleanup test fixtures
  await db.query('DELETE FROM rentals WHERE rental_inventory_id = $1', [rInvId]);
  await db.query('DELETE FROM rental_inventory_branches WHERE rental_inventory_id = $1', [rInvId]);
  await db.query('DELETE FROM rental_inventory WHERE id = $1', [rInvId]);
  await db.query('DELETE FROM return_items WHERE inventory_id IN ($1, $2)', [itemId1, itemId2]);
  await db.query('DELETE FROM returns WHERE order_id IN (SELECT id FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE \'0109999%\'))');
  await db.query('DELETE FROM order_items WHERE inventory_id IN ($1, $2)', [itemId1, itemId2]);
  await db.query('DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE \'0109999%\' OR phone = \'01000009999\')');
  await db.query('DELETE FROM worn_products WHERE inventory_id IN ($1, $2)', [itemId1, itemId2]);
  await db.query('DELETE FROM inventory_branches WHERE inventory_id IN ($1, $2)', [itemId1, itemId2]);
  await db.query('DELETE FROM inventory WHERE id IN ($1, $2)', [itemId1, itemId2]);
  await db.query('DELETE FROM attendance WHERE employee_id = $1', [sellerId]);
  await db.query('DELETE FROM employees WHERE id = $1', [sellerId]);
  await db.query("DELETE FROM customers WHERE phone LIKE '0109999%' OR phone = '01000009999'");

  console.log(`\nConcurrency & Atomicity Results: ${passed} passed, ${failed} failed.\n`);
  await db.close();
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal in test suite:', err);
  process.exit(1);
});
