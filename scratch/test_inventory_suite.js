const assert = require('assert');
const db = require('../src/server/database/connection');
const inventoryService = require('../src/server/modules/inventory/inventory.service');
const salesService = require('../src/server/modules/sales/sales.service');
const suppliersService = require('../src/server/modules/suppliers/suppliers.service');
const wornService = require('../src/server/modules/worn/worn.service');
const rentalsService = require('../src/server/modules/rentals/rentals.service');
const reportsService = require('../src/server/modules/reports/reports.service');
const { adjustInventoryStock } = require('../src/server/modules/inventory/inventory.helpers');

async function runInventorySuite() {
  console.log('🧪 Starting Comprehensive Inventory & Warehouse Test Suite...\n');
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

  // Setup test environment
  const adminUser = { id: 1, username: 'admin_test', role: 'admin', permissions: ['all'] };
  const branchUser1 = { id: 2, username: 'branch1_test', role: 'branch_user', branch_id: 1, permissions: [] };
  const branchUser2 = { id: 3, username: 'branch2_test', role: 'branch_user', branch_id: 2, permissions: [] };

  // Helper to query stock
  async function getStock(invId, branchId) {
    const bRes = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [invId, branchId]);
    const iRes = await db.query('SELECT stock_level FROM inventory WHERE id = $1', [invId]);
    const szRes = await db.query('SELECT size_name, color_name, stock_level FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2', [invId, branchId]);
    return {
      branchStock: bRes.rows[0]?.stock_level !== undefined ? Number(bRes.rows[0].stock_level) : 0,
      globalStock: iRes.rows[0]?.stock_level !== undefined ? Number(iRes.rows[0].stock_level) : 0,
      sizes: szRes.rows.map(r => ({ size: r.size_name, color: r.color_name, stock: Number(r.stock_level) })),
    };
  }

  // Helper to create test employee for order operations
  const empRes = await db.query(
    "INSERT INTO employees (name, phone, position, basic_salary, branch_id, join_date) VALUES ('Inv Test Cashier', '01099999999', 'كاشير', 5000, 1, CURRENT_DATE) RETURNING id"
  );
  const testSellerId = empRes.rows[0].id;
  const { getCairoDateTimeParts } = require('../src/shared/utils/date');
  const today = getCairoDateTimeParts().date;
  await db.query(
    'INSERT INTO attendance (employee_id, date, check_in) VALUES ($1, $2, $3) ON CONFLICT (employee_id, date) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = NULL',
    [testSellerId, today, '09:00:00']
  );

  // Helper to create test supplier
  const suppRes = await db.query(
    "INSERT INTO suppliers (name, phone, address, balance) VALUES ('Inv Test Supplier', '01088888888', 'Cairo', 0) RETURNING id"
  );
  const testSupplierId = suppRes.rows[0].id;

  // 1. PRODUCT CREATION WITH MULTI-COLOR VARIANTS
  const testProductName = 'بدلة توكسيدو فاخرة للتجربة ' + Date.now();
  let multiColorProductId = null;
  await test('INV-01: Create multi-variant product with distinct colors and sizes across branches', async () => {
    const p = await inventoryService.createProduct({
      name: testProductName,
      category: 'TUXEDO SUIT',
      branch_id: 1,
      price: 1500,
      cost_price: 1000,
      min_stock_level: 2,
      preferred_supplier_id: testSupplierId,
      sizes: [
        { size_name: '50', color_name: 'Black', stock: 5 },
        { size_name: '50', color_name: 'Navy', stock: 3 },
        { size_name: '52', color_name: 'Black', stock: 4 },
      ],
    }, adminUser);
    multiColorProductId = p.id;
    assert.ok(multiColorProductId, 'Product created');

    // Add stock for branch 2
    await suppliersService.createSupplyRecord({
      supplier_id: testSupplierId,
      branch_id: 2,
      inventory_id: multiColorProductId,
      quantity: 6,
      cost_price: 1000,
      size: '50',
      color: 'Black',
    }, adminUser);

    const s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 12, 'Branch 1 stock should sum to 12 (5+3+4)');
    const s2 = await getStock(multiColorProductId, 2);
    assert.strictEqual(s2.branchStock, 6, 'Branch 2 stock should be 6');
    assert.strictEqual(s1.globalStock, 18, 'Global stock should be 18');
  });

  // 2. SALE WITH MULTI-COLOR VARIANTS (No double deduction bug)
  let testOrderId = null;
  await test('INV-02: POS sale decrements exact size and color without duplicate deductions in sibling variants', async () => {
    const order = await salesService.createOrder({
      customer_name: 'عميل تجريبي للبيع',
      customer_phone: '01012345678',
      branch_id: 1,
      seller_id: testSellerId,
      paid_amount: 1500,
      total_amount: 1500,
      payment_method: 'cash',
      items: [
        {
          id: multiColorProductId,
          size: '50',
          color: 'Black',
          quantity: 2,
          price: 1500,
        },
      ],
    }, adminUser);
    testOrderId = order.id;

    const s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 10, 'Branch 1 stock should decrease by 2 (12 -> 10)');
    assert.strictEqual(s1.globalStock, 16, 'Global stock should decrease by 2 (18 -> 16)');

    const b50Black = s1.sizes.find(s => s.size === '50' && s.color === 'Black');
    const b50Navy = s1.sizes.find(s => s.size === '50' && s.color === 'Navy');
    assert.strictEqual(b50Black.stock, 3, 'Size 50 Black should decrease from 5 to 3');
    assert.strictEqual(b50Navy.stock, 3, 'Size 50 Navy should remain untouched at 3');
  });

  // 3. ORDER UPDATE RESTORES / ADJUSTS SIZES
  await test('INV-03: updateOrder adjusts delta in inventory_sizes and inventory_branches', async () => {
    // Increase quantity from 2 to 3
    await salesService.updateOrder(testOrderId, {
      customer_name: 'عميل تجريبي للبيع',
      customer_phone: '01012345678',
      branch_id: 1,
      seller_id: testSellerId,
      paid_amount: 4500,
      total_amount: 4500,
      payment_method: 'cash',
      items: [
        {
          id: multiColorProductId,
          size: '50',
          color: 'Black',
          quantity: 3,
          price: 1500,
        },
      ],
    }, adminUser);

    const s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 9, 'Branch 1 stock should decrease by another 1 (10 -> 9)');
    const b50Black = s1.sizes.find(s => s.size === '50' && s.color === 'Black');
    assert.strictEqual(b50Black.stock, 2, 'Size 50 Black should decrease from 3 to 2');
  });

  // 4. RETURN RESTORES SIZES
  await test('INV-04: createReturn restores stock to the exact size and color row', async () => {
    const returnRes = await salesService.createReturn({
      order_id: testOrderId,
      branch_id: 1,
      seller_id: testSellerId,
      items: [
        {
          id: multiColorProductId,
          quantity: 1,
          size: '50',
          color: 'Black',
          price: 1500,
        },
      ],
    }, adminUser);
    assert.ok(returnRes.success, 'Return succeeded');

    const s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 10, 'Branch 1 stock should be restored by 1 (9 -> 10)');
    const b50Black = s1.sizes.find(s => s.size === '50' && s.color === 'Black');
    assert.strictEqual(b50Black.stock, 3, 'Size 50 Black should be restored from 2 to 3');
  });

  // 5. SUPPLIER RESTOCK & RETURN
  await test('INV-05: Supplier createSupplyRecord & processSupplierReturn update inventory_sizes', async () => {
    // Supply 5 pieces of 52 Black to branch 1
    const sr = await suppliersService.createSupplyRecord({
      supplier_id: testSupplierId,
      branch_id: 1,
      inventory_id: multiColorProductId,
      quantity: 5,
      cost_price: 1000,
      size: '52',
      color: 'Black',
    }, adminUser);

    let s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 15, 'Branch 1 stock should increase to 15 (10 + 5)');
    let b52Black = s1.sizes.find(s => s.size === '52' && s.color === 'Black');
    assert.strictEqual(b52Black.stock, 9, 'Size 52 Black should increase from 4 to 9');

    // Return 2 pieces to supplier
    await suppliersService.processSupplierReturn({
      supplier_id: testSupplierId,
      total_amount: 2000,
      notes: 'مرتجع تجريبي',
      items: [
        {
          inventory_id: multiColorProductId,
          branch_id: 1,
          quantity: 2,
          cost_price: 1000,
        },
      ],
    });

    s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 13, 'Branch 1 stock should decrease to 13 (15 - 2)');
  });

  // 6. WORN PRODUCTS & RENTAL CONVERSION
  await test('INV-06: Worn products and rental conversions deduct inventory_sizes', async () => {
    await wornService.createWornProduct({
      product_type: 'sales',
      product_id: multiColorProductId,
      branch_id: 1,
      quantity: 1,
      condition: 'تالف',
      reason: 'damaged zipper',
    }, adminUser);

    let s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 12, 'Branch 1 stock should be 12 (13 - 1)');

    await rentalsService.transferFromSales({
      inventory_id: multiColorProductId,
      from_branch: 1,
      to_branch: 1,
      quantity: 1,
    }, adminUser);

    s1 = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1.branchStock, 11, 'Branch 1 stock should be 11 (12 - 1)');
  });

  // 7. INTER-BRANCH STOCK TRANSFER REQUEST (is_request: true) & APPROVAL LIFECYCLE
  await test('INV-07: Cashier stock request creates requested record, source branch approves and target receives', async () => {
    // Cashier at Branch 2 requests 2 pieces from Branch 1
    const reqRes = await inventoryService.transferStock({
      inventory_id: multiColorProductId,
      from_branch_id: 1,
      to_branch_id: 2,
      quantity: 2,
      is_request: true,
      sizes: [{ size_name: '50', color_name: 'Navy', quantity: 2 }],
    }, branchUser2);

    assert.ok(reqRes.success, 'Request created successfully without self-transfer error');

    // Find the transfer ID
    const trRes = await db.query(
      'SELECT id, status, from_branch_id, to_branch_id, quantity FROM stock_transfers WHERE inventory_id = $1 AND status = $2 ORDER BY id DESC LIMIT 1',
      [multiColorProductId, 'requested']
    );
    assert.strictEqual(trRes.rows.length, 1);
    const transferId = trRes.rows[0].id;
    assert.strictEqual(trRes.rows[0].from_branch_id, 1);
    assert.strictEqual(trRes.rows[0].to_branch_id, 2);
    assert.strictEqual(Number(trRes.rows[0].quantity), 2);

    // Approve the transfer (from branch 1)
    await inventoryService.approveTransfer(transferId, adminUser);
    const appTr = await db.query('SELECT status FROM stock_transfers WHERE id = $1', [transferId]);
    assert.strictEqual(appTr.rows[0].status, 'pending', 'Transfer status should be pending');

    const s1AfterApprove = await getStock(multiColorProductId, 1);
    assert.strictEqual(s1AfterApprove.branchStock, 9, 'Branch 1 stock decremented upon approval (11 -> 9)');

    // Receive the transfer (at branch 2)
    await inventoryService.receiveTransfer(transferId, branchUser2);
    const recTr = await db.query('SELECT status FROM stock_transfers WHERE id = $1', [transferId]);
    assert.strictEqual(recTr.rows[0].status, 'received', 'Transfer status should be received');

    const s2AfterReceive = await getStock(multiColorProductId, 2);
    assert.strictEqual(s2AfterReceive.branchStock, 8, 'Branch 2 stock incremented upon receipt (6 -> 8)');
  });

  // 8. LIST INVENTORY WITH BRANCH & CATEGORY FILTERING
  await test('INV-08: listInventory handles simultaneous branch and category filters correctly', async () => {
    const listRes = await inventoryService.listInventory({
      query: {
        branch_id: '1',
        category: 'TUXEDO SUIT',
      },
    }, adminUser);

    assert.ok(Array.isArray(listRes.items || listRes), 'Returns items array');
    const items = listRes.items || listRes;
    const found = items.find(i => Number(i.id) === multiColorProductId);
    assert.ok(found, 'Multi-color product found in tuxedo suit category');
    assert.strictEqual(Number(found.stock_level), 9, 'Branch 1 stock level matches');
  });

  // 9. REPORTS INVENTORY LEFT JOIN & LOW STOCK ACCURACY
  await test('INV-09: getInventoryReport preserves 0-stock products with LEFT JOIN and calculates low stock accurately', async () => {
    // Create product with 0 stock at branch 2
    const zeroProd = await inventoryService.createProduct({
      name: 'منتج بدون مخزون فرع 2',
      category: 'FORMAL SUIT',
      price: 800,
      cost_price: 500,
      min_stock_level: 5,
      sizes: [{ size_name: '48', stock_level: 10, branch_id: 1 }],
    }, adminUser);

    const report = await reportsService.getInventoryReport({
      branch_id: '2',
      category: 'FORMAL SUIT',
    }, adminUser);

    assert.strictEqual(Number(report.branch_id), 2);
    const itemInBranch2 = report.items.find(i => Number(i.id) === zeroProd.id);
    assert.ok(itemInBranch2, '0-stock item at branch 2 is included thanks to LEFT JOIN');
    assert.strictEqual(itemInBranch2.stock_level, 0, 'Item stock level at branch 2 is 0');
    assert.strictEqual(itemInBranch2.is_low_stock, true, '0 stock is counted as low stock (0 <= 5)');

    // Verify summary matches items count
    assert.strictEqual(report.summary.total_items, report.items.length, 'Summary total_items matches items length');
    const lowStockItemsCount = report.items.filter(i => i.is_low_stock).length;
    assert.strictEqual(report.summary.low_stock_count, lowStockItemsCount, 'Summary low_stock_count matches item is_low_stock count');
  });

  // 10. SEARCH INVENTORY SECURITY RESTRICTION
  await test('INV-10: searchInventory restricts branch_user to their assigned branch', async () => {
    // branchUser2 (branch_id: 2) attempts to query branch_id 1
    const results = await inventoryService.searchInventory({
      query: testProductName,
      branch_id: '1',
    }, branchUser2);

    assert.ok(results.length > 0, 'Found search results');
    const p = results.find(r => Number(r.id) === multiColorProductId);
    assert.ok(p, 'Found test product');
    // Branch user 2 should see branch 2 stock (8), NOT branch 1 stock (9)!
    assert.strictEqual(Number(p.stock_level), 8, 'Branch user is forced to view their own branch stock (8)');

    // Admin can see branch 1 stock (9)
    const adminResults = await inventoryService.searchInventory({
      query: testProductName,
      branch_id: '1',
    }, adminUser);
    const adminP = adminResults.find(r => Number(r.id) === multiColorProductId);
    assert.strictEqual(Number(adminP.stock_level), 9, 'Admin can view requested branch stock (9)');
  });

  console.log(`\n==================================================`);
  console.log(`Inventory & Warehouse Suite: ${passed} passed, ${failed} failed.`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runInventorySuite()
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close().catch(() => {});
  });
