const assert = require('assert');
const db = require('../src/server/database/connection');
const salesService = require('../src/server/modules/sales/sales.service');
const branchesService = require('../src/server/modules/branches/branches.service');
const tailoringService = require('../src/server/modules/tailoring/tailoring.service');
const wornService = require('../src/server/modules/worn/worn.service');
const rentalsService = require('../src/server/modules/rentals/rentals.service');
const syncService = require('../src/server/modules/sync/sync.service');
const { roundCurrency } = require('../src/shared/utils/numbers');

async function runReviewTests() {
  console.log('🧪 Starting Review & Adversarial Edge Case Verification Tests...\n');
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

  // 1. Negative & Symmetric Financial Rounding
  await test('ROUND-02: roundCurrency handles symmetric rounding on negative and boundary numbers', () => {
    assert.strictEqual(roundCurrency(-1.005), -1.01);
    assert.strictEqual(roundCurrency(-0.005), -0.01);
    assert.strictEqual(roundCurrency(-10.004), -10);
    assert.strictEqual(roundCurrency(-10.005), -10.01);
    assert.strictEqual(roundCurrency(0), 0);
    assert.strictEqual(roundCurrency(-0), 0);
  });

  // Setup mock seller for orders
  const randSuffix = Math.floor(Math.random() * 899999 + 100000);
  const { getCairoDateTimeParts } = require('../src/shared/utils/date');
  const today = getCairoDateTimeParts().date;
  const empRes = await db.query(
    "INSERT INTO employees (name, phone, position, basic_salary, branch_id, join_date) VALUES ('Review Salesperson', $1, 'كاشير', 6000, 1, CURRENT_DATE) RETURNING id",
    [`01022${randSuffix}0`]
  );
  const sellerId = empRes.rows[0].id;
  await db.query(
    'INSERT INTO attendance (employee_id, date, check_in) VALUES ($1, $2, $3) ON CONFLICT (employee_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = NULL',
    [sellerId, today, '08:30:00']
  );

  // Setup test products
  const invRes1 = await db.query(
    "INSERT INTO inventory (name, barcode, price, stock_level) VALUES ('Review Item 100', $1, 100.00, 50) RETURNING id",
    [`REVBC${randSuffix}1`]
  );
  const itemId1 = invRes1.rows[0].id;
  await db.query(
    'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, 1, 50) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = 50',
    [itemId1]
  );

  const invRes2 = await db.query(
    "INSERT INTO inventory (name, barcode, price, stock_level) VALUES ('Review Item 200', $1, 200.00, 50) RETURNING id",
    [`REVBC${randSuffix}2`]
  );
  const itemId2 = invRes2.rows[0].id;
  await db.query(
    'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, 1, 50) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = 50',
    [itemId2]
  );

  const adminUser = { id: 1, role: 'admin', branch_id: 1, username: 'admin' };

  // 2. Sales: Discount Type 'percentage' support
  await test('SALES-PERCENTAGE-01: createOrder supports discount_type percentage from frontend', async () => {
    // 2 items of itemId1 (100 EGP each = 200), with 20% discount => net = 160
    // plus 10% invoice discount on 160 => net = 144
    const ord = await salesService.createOrder({
      customer_name: 'Percentage Discount Customer',
      customer_phone: `01055${randSuffix}1`,
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 144,
      invoice_discount: 10,
      invoice_discount_type: 'percentage', // frontend uses 'percentage'
      items: [
        { id: itemId1, quantity: 2, discount: 20, discount_type: 'percentage' },
      ],
    }, adminUser, null);

    const check = await db.query('SELECT total_amount FROM orders WHERE id = $1', [ord.orderId]);
    assert.strictEqual(Number(check.rows[0].total_amount), 144, 'Total amount should be exactly 144 with percentage discount');
  });

  // 3. Sales: Return Tampering Defense
  await test('SALES-RETURN-TAMPER-01: createReturn rejects client price tampering on total_return_amount', async () => {
    const ord = await salesService.createOrder({
      customer_name: 'Return Tamper Customer',
      customer_phone: `01055${randSuffix}2`,
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 100,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    try {
      // Client maliciously attempts to request a 50,000 EGP refund on a 100 EGP order
      await salesService.createReturn({
        order_id: ord.orderId,
        branch_id: 1,
        total_return_amount: 50000,
        items: [{ id: itemId1, quantity: 1 }],
      }, adminUser, null);
      assert.fail('Should have rejected spoofed return amount');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('يتجاوز القيمة المستحقة'));
    }
  });

  // 4. Sales: Return with Discounts
  await test('SALES-RETURN-DISCOUNT-01: createReturn refunds net discounted price rather than full price', async () => {
    // 2 items at 100 with 40 EGP line discount => net 160 total (80 each)
    const ord = await salesService.createOrder({
      customer_name: 'Discount Return Customer',
      customer_phone: `01055${randSuffix}3`,
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 160,
      items: [{ id: itemId1, quantity: 2, discount: 40, discount_type: 'amount' }],
    }, adminUser, null);

    // Return 1 item -> should refund 80, not 100!
    const retRes = await salesService.createReturn({
      order_id: ord.orderId,
      branch_id: 1,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    const checkRet = await db.query('SELECT total_return_amount FROM returns WHERE id = $1', [retRes.returnId]);
    assert.strictEqual(Number(checkRet.rows[0].total_return_amount), 80, 'Refund must reflect net price 80 EGP, not gross 100 EGP');

    const checkOrd = await db.query('SELECT status FROM orders WHERE id = $1', [ord.orderId]);
    assert.strictEqual(checkOrd.rows[0].status, 'partially_returned', 'Order should be partially_returned when 1 of 2 is returned');
  });

  // 5. Sales: Partial Return Tracking and Double Return Prevention
  await test('SALES-RETURN-PARTIAL-01: tracks partial returns and prevents exceeding purchased quantities', async () => {
    const ord = await salesService.createOrder({
      customer_name: 'Partial Return Customer',
      customer_phone: `01055${randSuffix}4`,
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 200,
      items: [{ id: itemId1, quantity: 2 }],
    }, adminUser, null);

    // First return: 1 item
    await salesService.createReturn({
      order_id: ord.orderId,
      branch_id: 1,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    // Try returning 2 items (only 1 remaining) -> must reject
    try {
      await salesService.createReturn({
        order_id: ord.orderId,
        branch_id: 1,
        items: [{ id: itemId1, quantity: 2 }],
      }, adminUser, null);
      assert.fail('Should have rejected returning 2 when only 1 is remaining');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('أكبر من الكمية المتبقية'));
    }

    // Return the second remaining item -> must succeed and set status to returned
    await salesService.createReturn({
      order_id: ord.orderId,
      branch_id: 1,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    const checkOrd = await db.query('SELECT status FROM orders WHERE id = $1', [ord.orderId]);
    assert.strictEqual(checkOrd.rows[0].status, 'returned', 'Order should be fully returned');

    // Third return attempt when already fully returned -> must reject
    try {
      await salesService.createReturn({
        order_id: ord.orderId,
        branch_id: 1,
        items: [{ id: itemId1, quantity: 1 }],
      }, adminUser, null);
      assert.fail('Should have rejected return on fully returned order');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('تم إرجاعه بالكامل بالفعل'));
    }
  });

  // 6. Branches: FK Safe Deletion with Operational History Reassignment
  await test('BRANCH-FK-REASSIGN-01: deleteBranch safely reassigns dependent records to main warehouse', async () => {
    // Create new branch
    const branchToDel = await branchesService.createBranch({
      name: `فرع للاختبار ${randSuffix}`,
      location: 'المهندسين',
      phone: `01088${randSuffix}1`,
      allowed_gender: 'men',
    });
    const bId = branchToDel.id;

    // Create an employee in this branch
    const empInBranch = await db.query(
      "INSERT INTO employees (name, phone, position, basic_salary, branch_id, join_date) VALUES ('Branch Seller', $1, 'كاشير', 4000, $2, CURRENT_DATE) RETURNING id",
      [`01088${randSuffix}2`, bId]
    );
    const bSellerId = empInBranch.rows[0].id;
    await db.query(
      'INSERT INTO attendance (employee_id, date, check_in) VALUES ($1, $2, $3) ON CONFLICT (employee_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = NULL',
      [bSellerId, today, '08:00:00']
    );

    // Set stock in branch for order creation
    await db.query(
      'UPDATE inventory_branches SET stock_level = 10 WHERE inventory_id = $1 AND branch_id = $2',
      [itemId1, bId]
    );

    // Create an order in this branch
    const bOrder = await salesService.createOrder({
      customer_name: 'Branch Customer',
      customer_phone: `01088${randSuffix}3`,
      seller_id: bSellerId,
      branch_id: bId,
      payment_method: 'cash',
      paid_amount: 100,
      items: [{ id: itemId1, quantity: 1 }],
    }, adminUser, null);

    // Now delete the branch -> MUST NOT throw FK violation!
    const delResult = await branchesService.deleteBranch(bId);
    assert.strictEqual(delResult.success, true);

    // Verify order was preserved and reassigned to main branch (id: 1)
    const checkOrd = await db.query('SELECT branch_id FROM orders WHERE id = $1', [bOrder.orderId]);
    assert.strictEqual(Number(checkOrd.rows[0].branch_id), 1, 'Order must be reassigned to main warehouse');

    // Verify branch row is gone
    const checkBranch = await db.query('SELECT id FROM branches WHERE id = $1', [bId]);
    assert.strictEqual(checkBranch.rows.length, 0, 'Branch must be deleted');
  });

  // 7. Tailoring: Partial Payment Support
  await test('TAILOR-PARTIAL-PAY-01: payRemainingTailoringOrder supports partial payments and row locks', async () => {
    const tOrder = await tailoringService.createTailoringOrder({
      customer_name: 'Tailor Partial Customer',
      customer_phone: `01077${randSuffix}1`,
      product_description: 'بدلة كلاسيك كحلي',
      measurements: 'أكتاف 45، طول 75',
      paid_amount: 100,
      remaining_amount: 200,
      seller_id: sellerId,
      branch_id: 1,
    }, adminUser);

    // Pay partial 50 EGP
    const pay1 = await tailoringService.payRemainingTailoringOrder(tOrder.id, adminUser, { amount: 50 });
    assert.strictEqual(Number(pay1.newPaidAmount), 150);
    assert.strictEqual(Number(pay1.remainingAmount), 150);

    // Check DB state
    const check1 = await db.query('SELECT paid_amount, remaining_amount FROM tailoring_orders WHERE id = $1', [tOrder.id]);
    assert.strictEqual(Number(check1.rows[0].paid_amount), 150);
    assert.strictEqual(Number(check1.rows[0].remaining_amount), 150);

    // Try overpaying (remaining is 150, trying to pay 200) -> must reject
    try {
      await tailoringService.payRemainingTailoringOrder(tOrder.id, adminUser, { amount: 200 });
      assert.fail('Should have rejected overpayment on tailoring order');
    } catch (err) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err.message.includes('يتجاوز الباقي المستحق'));
    }

    // Pay the rest without specifying amount -> full payoff
    const pay2 = await tailoringService.payRemainingTailoringOrder(tOrder.id, adminUser);
    assert.strictEqual(Number(pay2.newPaidAmount), 300);
    assert.strictEqual(Number(pay2.remainingAmount), 0);

    const check2 = await db.query('SELECT paid_amount, remaining_amount FROM tailoring_orders WHERE id = $1', [tOrder.id]);
    assert.strictEqual(Number(check2.rows[0].paid_amount), 300);
    assert.strictEqual(Number(check2.rows[0].remaining_amount), 0);
  });

  // 8. Rentals: Early return with zero fine
  await test('RENTAL-EARLY-RETURN-01: returnRental does not generate negative fines when returned early', async () => {
    // Create rental inventory item
    const rInv = await db.query(
      "INSERT INTO rental_inventory (name, barcode, price) VALUES ('بدلة عريس سموكنج', $1, 500) RETURNING id",
      [`RENTREV${randSuffix}`]
    );
    const rId = rInv.rows[0].id;
    await db.query(
      'INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) VALUES ($1, 1, 3) ON CONFLICT (rental_inventory_id, branch_id) DO UPDATE SET stock_level = 3',
      [rId]
    );

    const rentalRes = await rentalsService.createRental({
      customer_name: 'Early Return Renter',
      customer_phone: `01066${randSuffix.toString().slice(0, 6)}`,
      items: [{ rental_inventory_id: rId, quantity: 1 }],
      pickup_date: '2026-10-01',
      return_date: '2026-10-30', // Future date
      total_price: 500,
      deposit: 200,
      remaining: 300,
      daily_fine: 50,
      branch_id: 1,
    }, adminUser, null);

    const rentalId = rentalRes.rentals[0].id;
    // Pickup rental
    await rentalsService.pickupRental(rentalId, adminUser);

    // Return rental before return date
    const retRes = await rentalsService.returnRental(rentalId, 50, adminUser);
    assert.strictEqual(retRes.fine_amount, 0, 'Early return fine must be clamped to 0, not negative');

    const checkRent = await db.query('SELECT fine_amount, status FROM rentals WHERE id = $1', [rentalId]);
    assert.strictEqual(Number(checkRent.rows[0].fine_amount), 0);
    assert.strictEqual(checkRent.rows[0].status, 'returned');
  });

  // 9. Sync: Worn Product Deficit Detection & Atomic Decrement
  await test('SYNC-WORN-DEFICIT-01: worn product offline replay logs deficit without unlocked SUM overwrite', async () => {
    // Set item stock to 2
    await db.query('UPDATE inventory SET stock_level = 2 WHERE id = $1', [itemId1]);
    await db.query('UPDATE inventory_branches SET stock_level = 2 WHERE inventory_id = $1 AND branch_id = 1', [itemId1]);

    let loggedDeficit = false;
    const origWarn = console.warn;
    console.warn = (...args) => {
      if (args.join(' ').includes('[Sync Conflict] Deficit detected during offline worn product replay')) {
        loggedDeficit = true;
      }
      origWarn(...args);
    };

    try {
      await syncService.applyOperation({
        entity_type: 'worn_product',
        action: 'create',
        branch_id: 1,
        payload: {
          product_type: 'sales',
          inventory_id: itemId1,
          branch_id: 1,
          quantity: 5, // Requires 5, but stock is only 2
          deduct_stock: true,
          offline_uuid: require('crypto').randomUUID(),
        },
      });
    } finally {
      console.warn = origWarn;
    }

    assert.ok(loggedDeficit, 'Should have logged deficit conflict warning for worn product');

    // Both branch and global stock must be safely floored at 0 without SUM overwrite
    const checkBranch = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [itemId1]);
    assert.strictEqual(Number(checkBranch.rows[0].stock_level), 0);

    const checkGlobal = await db.query('SELECT stock_level FROM inventory WHERE id = $1', [itemId1]);
    assert.strictEqual(Number(checkGlobal.rows[0].stock_level), 0);
  });

  // 10. Financial Reports: Partial Return Remainder Precision
  await test('REPORT-PARTIAL-RETURN-REMAINDER-01: partial return on fully paid order yields 0 remainder in sales report', async () => {
    const reportsService = require('../src/server/modules/reports/reports.service');
    // Order 2 items of itemId2 (200 each = 400), fully paid in cash
    const ord = await salesService.createOrder({
      customer_name: 'Partial Return Customer',
      customer_phone: `01055${randSuffix}9`,
      seller_id: sellerId,
      branch_id: 1,
      payment_method: 'cash',
      paid_amount: 400,
      items: [{ id: itemId2, quantity: 2, price: 200 }],
    }, adminUser, null);

    await salesService.createReturn({
      order_id: ord.orderId,
      branch_id: 1,
      seller_id: sellerId,
      items: [{ id: itemId2, quantity: 1, price: 200 }],
    }, adminUser, null);

    const rep = await reportsService.getSalesReport({
      date_from: today,
      date_to: today,
      branch_id: 1,
    }, adminUser);

    const targetOrder = rep.orders.find((o) => o.id === ord.orderId);
    assert.ok(targetOrder, 'Order must be present in sales report');
    assert.strictEqual(targetOrder.status, 'partially_returned');
    assert.strictEqual(Number(targetOrder.net_total), 200);
    assert.strictEqual(Number(targetOrder.net_paid), 200);
    assert.strictEqual(Number(targetOrder.remainder), 0, 'Customer paid in full; remainder must be 0, not net_total');
  });

  // 11. SQLite Branch Mode: NOW() - INTERVAL translation & Expense duplicate guard
  await test('SQLITE-INTERVAL-EXPENSES-01: translatePgToSqlite converts NOW() and second intervals for SQLite duplicate guard', () => {
    const { DatabaseSync } = require('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_by INTEGER,
        branch_id INTEGER,
        amount REAL,
        category TEXT,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        offline_uuid TEXT
      );
      INSERT INTO expenses (created_by, branch_id, amount, category, created_at, offline_uuid)
      VALUES (1, 1, 75.50, 'نثريات', datetime('now'), 'exp-uuid-1');
    `);

    const rawSql = `
      SELECT id, offline_uuid FROM expenses
      WHERE created_by = $1 AND branch_id = $2 AND amount = $3 AND category = $4 AND is_deleted IS NOT TRUE
        AND created_at >= NOW() - INTERVAL '3 seconds'
      ORDER BY id DESC LIMIT 1
    `;

    const { isAdvisoryLock, sql } = db.translatePgToSqlite(rawSql);
    assert.strictEqual(isAdvisoryLock, false);
    assert.ok(sql.includes("datetime('now', '-3 second')"), `Expected datetime('now', '-3 second') but got: ${sql}`);

    const stmt = sqlite.prepare(sql);
    const row = stmt.get(1, 1, 75.50, 'نثريات');
    assert.ok(row, 'Query must execute on SQLite and match the recent expense');
    assert.strictEqual(row.offline_uuid, 'exp-uuid-1');
    sqlite.close();
  });

  // 12. Rentals: Rental Sale populates order payment breakdown columns
  await test('RENTAL-SALE-SPLIT-COLUMNS-01: selling a rental populates cash_amount and financial columns', async () => {
    const rentInv = await db.query(
      "INSERT INTO rental_inventory (name, barcode, price, is_deleted) VALUES ('Rental Suit To Sell', $1, 800, false) RETURNING id",
      [`RSBC${randSuffix}1`]
    );
    const rentInvId = rentInv.rows[0].id;
    await db.query(
      'INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) VALUES ($1, 1, 5) ON CONFLICT (rental_inventory_id, branch_id) DO UPDATE SET stock_level = 5',
      [rentInvId]
    );

    const booking = await rentalsService.createRental({
      customer_name: 'Rental Buy Customer',
      customer_phone: `01077${randSuffix}1`,
      pickup_date: today,
      return_date: today,
      rental_inventory_id: rentInvId,
      total_price: 150,
      deposit: 50,
      remaining: 100,
      payment_method: 'cash',
      branch_id: 1,
      seller_id: sellerId,
    }, adminUser, null);

    const bookingId = booking.id;
    await rentalsService.pickupRental(bookingId, adminUser);

    const sellRes = await rentalsService.sellRental(bookingId, {
      price: 1200,
      payment_method: 'cash',
    }, adminUser);

    assert.ok(sellRes && (sellRes.orderId || sellRes.order_id), 'Rental sale must create an order');
    const targetOrderId = sellRes.orderId || sellRes.order_id;
    const ordCheck = await db.query('SELECT total_amount, paid_amount, payment_method, cash_amount, order_source FROM orders WHERE id = $1', [targetOrderId]);
    assert.strictEqual(Number(ordCheck.rows[0].total_amount), 1200);
    assert.strictEqual(Number(ordCheck.rows[0].paid_amount), 1200);
    assert.strictEqual(Number(ordCheck.rows[0].cash_amount), 1200, 'Order cash_amount must be populated with price');
    assert.strictEqual(ordCheck.rows[0].order_source, 'rental_sale');

    // Clean up rental test items and order
    await db.query('DELETE FROM rentals WHERE id = $1', [bookingId]);
    if (sellRes && (sellRes.orderId || sellRes.order_id)) {
      await db.query('DELETE FROM order_items WHERE order_id = $1', [targetOrderId]);
      await db.query('DELETE FROM orders WHERE id = $1', [targetOrderId]);
    }
    await db.query('DELETE FROM rental_inventory_branches WHERE rental_inventory_id = $1', [rentInvId]);
    await db.query('DELETE FROM rental_inventory WHERE id = $1', [rentInvId]);
    await db.query("DELETE FROM inventory WHERE name = 'Rental Suit To Sell'");
  });

  // Final Teardown
  try {
    await db.query('DELETE FROM inventory_branches WHERE inventory_id IN ($1, $2)', [itemId1, itemId2]);
    await db.query('DELETE FROM inventory WHERE id IN ($1, $2)', [itemId1, itemId2]);
    await db.query('DELETE FROM attendance WHERE employee_id = $1', [sellerId]);
    await db.query('DELETE FROM employees WHERE id = $1', [sellerId]);
  } catch (cleanErr) {
    console.warn('Teardown warning:', cleanErr.message);
  }

  console.log(`\nReview Test Results: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runReviewTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test Runner Failed:', err);
    process.exit(1);
  });
