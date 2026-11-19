process.env.APP_MODE = 'master';
process.env.NODE_ENV = 'test';

const assert = require('assert');
const crypto = require('crypto');
const db = require('../src/server/database/connection');
const syncService = require('../src/server/modules/sync/sync.service');

(async () => {
  console.log('=== INTER-BRANCH <-> CENTRAL PG SYNC E2E VERIFICATION ===');

  const cleanupIds = {
    supplierIds: [],
    inventoryIds: [],
    transferIds: [],
    alterationIds: [],
    branchIds: [],
    colorNames: [],
    sizeNames: [],
  };

  try {
    // Ensure clean seed branches 1 and 2 exist
    const bCheck = await db.query('SELECT id FROM branches WHERE id IN (1, 2) ORDER BY id');
    assert.strictEqual(bCheck.rows.length, 2, 'Expected branches 1 and 2 to exist in pos_db');

    // 1. Test color & size sync creation via applyOperation
    const testColorName = `لون-اختبار-${Date.now()}`;
    const testSizeName = `مقاس-${Date.now()}`;
    cleanupIds.colorNames.push(testColorName);
    cleanupIds.sizeNames.push(testSizeName);

    const colorRes = await syncService.applyOperation({
      entity_type: 'color',
      action: 'create',
      payload: { name: testColorName },
    });
    assert.ok(colorRes?.id, 'Color sync must return resolved central color id');

    const sizeRes = await syncService.applyOperation({
      entity_type: 'size',
      action: 'create',
      payload: { name: testSizeName },
    });
    assert.ok(sizeRes?.id, 'Size sync must return resolved central size id');
    console.log('✓ [1/7] Color & Size applyOperation verified');

    // 2. Test product create + supplier_transaction sharing purchase_batch_id (zero double-counting!)
    const supName = `مورد اختبار تزامن ${Date.now()}`;
    const supRes = await db.query(
      "INSERT INTO suppliers (name, initials, phone, status, is_active, balance, total_purchases) VALUES ($1, 'مت', $2, 'active', TRUE, 0, 0) RETURNING id",
      [supName, `019${String(Date.now()).slice(-8)}`]
    );
    const supId = supRes.rows[0].id;
    cleanupIds.supplierIds.push(supId);

    const batchId = crypto.randomUUID();
    const barcode = `SYNC-E2E-${Date.now()}`;
    await syncService.applyOperation({
      entity_type: 'product',
      action: 'create',
      branch_id: 1,
      payload: {
        id: 889901, // Deliberately non-matching local SQLite ID
        name: `بدلة مزامنة اختبار ${Date.now()}`,
        category: 'بدل',
        size_cut: testSizeName,
        color: testColorName,
        barcode,
        stock_level: 10,
        price: 2000,
        cost_price: 500,
        preferred_supplier_id: supId,
        supplier_ref: { id: supId, name: supName },
        branch_id: 1,
        purchase_batch_id: batchId,
        sizes: [{ size: testSizeName, color: testColorName, stock: 10 }],
      },
    });

    const prodRow = (await db.query('SELECT id, stock_level FROM inventory WHERE barcode = $1', [barcode])).rows[0];
    assert.ok(prodRow, 'Created product must exist in central PG by barcode');
    cleanupIds.inventoryIds.push(prodRow.id);

    // Replay matching supplier_transaction with SAME purchase_batch_id + paid_from_drawer: 1 (integer)
    const dupTxRes = await syncService.applyOperation({
      entity_type: 'supplier_transaction',
      action: 'create',
      branch_id: 1,
      payload: {
        supplier_id: supId,
        supplier_ref: { id: supId, name: supName },
        transaction_type: 'purchase',
        amount: 5000,
        branch_id: 1,
        paid_from_drawer: 1,
        purchase_batch_id: batchId,
        supply_items: [{ inventory_id: 889901, barcode, quantity: 10, cost_price: 500 }],
      },
    });
    assert.strictEqual(dupTxRes.deduplicated, true, 'Duplicate purchase_batch_id supplier_transaction must be deduplicated');

    const supAfterPurchase = (await db.query('SELECT balance, total_purchases FROM suppliers WHERE id = $1', [supId])).rows[0];
    assert.strictEqual(Number(supAfterPurchase.balance), -5000, 'Supplier balance must reflect single purchase (-5000), never doubled (-10000)');
    const b1StockAfterCreate = (await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [prodRow.id])).rows[0];
    assert.strictEqual(Number(b1StockAfterCreate.stock_level), 10, 'Branch 1 stock must remain 10 (never doubled to 20)');
    console.log('✓ [2/7] Product initial stock + supplier purchase_batch_id deduplication verified');

    // 3. Test supplier payment with integer paid_from_drawer (1 -> boolean TRUE) and supplier return stock deduction
    const payRes = await syncService.applyOperation({
      entity_type: 'supplier_transaction',
      action: 'create',
      branch_id: 1,
      payload: {
        supplier_id: supId,
        supplier_ref: { id: supId, name: supName },
        transaction_type: 'payment',
        amount: 1000,
        branch_id: 1,
        payment_method: 'cash',
        paid_from_drawer: 1,
      },
    });
    assert.ok(payRes?.id, 'Supplier payment with integer paid_from_drawer must succeed on PG boolean column');

    const retRes = await syncService.applyOperation({
      entity_type: 'supplier_transaction',
      action: 'create',
      branch_id: 1,
      payload: {
        supplier_id: supId,
        supplier_ref: { id: supId, name: supName },
        transaction_type: 'return',
        amount: 1000,
        return_items: [{ inventory_id: 889901, barcode, branch_id: 1, quantity: 2, cost_price: 500, size: testSizeName, color: testColorName }],
      },
    });
    assert.ok(retRes?.id, 'Supplier return sync must succeed');
    const b1StockAfterRet = (await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [prodRow.id])).rows[0];
    assert.strictEqual(Number(b1StockAfterRet.stock_level), 8, 'Supplier return must deduct returned qty (10 -> 8) on PG');
    console.log('✓ [3/7] Supplier boolean paid_from_drawer & return stock deduction verified');

    // 4. Test product update by barcode when local ID differs from central PG ID
    await syncService.applyOperation({
      entity_type: 'product',
      action: 'update',
      branch_id: 1,
      payload: {
        id: 889901,
        barcode,
        price: 2250,
      },
    });
    const updatedPrice = (await db.query('SELECT price FROM inventory WHERE id = $1', [prodRow.id])).rows[0];
    assert.strictEqual(Number(updatedPrice.price), 2250, 'Product update must resolve central PG row via barcode when local ID differs');
    console.log('✓ [4/7] Barcode-based product update resolution verified');

    // 5. Test full inter-branch stock_transfer workflow: request -> approve -> receive, plus request -> reject
    const reqSync = await syncService.applyOperation({
      entity_type: 'stock_transfer',
      action: 'request',
      branch_id: 2,
      payload: {
        inventory_id: 889901,
        barcode,
        from_branch_id: 1,
        to_branch_id: 2,
        quantity: 3,
        status: 'requested',
        sizes: [{ size_name: testSizeName, color_name: testColorName, quantity: 3 }],
        created_by_name: 'فرع 2',
      },
    });
    assert.ok(reqSync?.id, 'Stock transfer request must create requested record on PG');
    cleanupIds.transferIds.push(reqSync.id);

    await syncService.applyOperation({
      entity_type: 'stock_transfer',
      action: 'approve',
      branch_id: 1,
      payload: {
        id: reqSync.id,
        inventory_id: 889901,
        barcode,
        from_branch_id: 1,
        to_branch_id: 2,
        quantity: 3,
        sender_name: 'فرع 1',
      },
    });
    const afterApprove = (await db.query('SELECT status FROM stock_transfers WHERE id = $1', [reqSync.id])).rows[0];
    assert.strictEqual(afterApprove.status, 'pending', 'Approved transfer must transition to pending on PG');
    const b1AfterApprove = (await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [prodRow.id])).rows[0];
    assert.strictEqual(Number(b1AfterApprove.stock_level), 5, 'Branch 1 stock must decrease from 8 to 5 on approval');

    await syncService.applyOperation({
      entity_type: 'stock_transfer',
      action: 'receive',
      branch_id: 2,
      payload: {
        id: reqSync.id,
        inventory_id: 889901,
        barcode,
        from_branch_id: 1,
        to_branch_id: 2,
        quantity: 3,
        status: 'received',
        sizes: [{ size_name: testSizeName, color_name: testColorName, quantity: 3 }],
        received_by_name: 'فرع 2',
      },
    });
    const afterReceive = (await db.query('SELECT status FROM stock_transfers WHERE id = $1', [reqSync.id])).rows[0];
    assert.strictEqual(afterReceive.status, 'received', 'Received transfer must transition to received on PG');
    const b2AfterReceive = (await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 2', [prodRow.id])).rows[0];
    assert.strictEqual(Number(b2AfterReceive.stock_level), 3, 'Branch 2 stock must increase to 3 on receive');

    // Also test reject
    const reqReject = await syncService.applyOperation({
      entity_type: 'stock_transfer',
      action: 'request',
      branch_id: 2,
      payload: { inventory_id: prodRow.id, from_branch_id: 1, to_branch_id: 2, quantity: 1, status: 'requested' },
    });
    cleanupIds.transferIds.push(reqReject.id);
    await syncService.applyOperation({
      entity_type: 'stock_transfer',
      action: 'reject',
      branch_id: 1,
      payload: { id: reqReject.id, status: 'rejected' },
    });
    assert.strictEqual((await db.query('SELECT status FROM stock_transfers WHERE id = $1', [reqReject.id])).rows[0].status, 'rejected', 'Rejected transfer must become rejected');
    console.log('✓ [5/7] Inter-branch transfer request -> approve -> receive & reject verified');

    // 6. Test cross-branch alteration ID collision resolution on PG
    const sharedLocalAltId = 990123;
    cleanupIds.alterationIds.push(sharedLocalAltId);
    await syncService.applyOperation({
      entity_type: 'alteration',
      action: 'create',
      branch_id: 1,
      payload: { id: sharedLocalAltId, branch_id: 1, description: 'تعديل فرع 1 تصادم اختبار', due_date: '2026-11-20' },
    });
    await syncService.applyOperation({
      entity_type: 'alteration',
      action: 'create',
      branch_id: 2,
      payload: { id: sharedLocalAltId, branch_id: 2, description: 'تعديل فرع 2 تصادم اختبار', due_date: '2026-11-20' },
    });
    const altRows = (await db.query("SELECT id, branch_id, description FROM alterations WHERE description IN ('تعديل فرع 1 تصادم اختبار', 'تعديل فرع 2 تصادم اختبار') ORDER BY branch_id")).rows;
    assert.strictEqual(altRows.length, 2, 'Both cross-branch alterations with colliding local IDs must be stored on PG');
    altRows.forEach((r) => cleanupIds.alterationIds.push(r.id));
    console.log('✓ [6/7] Cross-branch alteration ID collision resolution verified');

    // 7. Test exportCatalogForBranch contains updated records and sync status exposes activity timestamp
    const exported = await syncService.exportCatalogForBranch(2);
    assert.ok(exported.stock_transfers.some((st) => Number(st.id) === Number(reqSync.id) && st.status === 'received'), 'Catalog export must include received stock_transfer');
    assert.ok(exported.alterations.some((a) => a.description === 'تعديل فرع 2 تصادم اختبار'), 'Catalog export must include branch 2 alteration');
    const status = await syncService.getSyncStatus();
    assert.ok(status.last_server_activity_at, 'Server sync status must expose last_server_activity_at after applyOperation');
    console.log('✓ [7/7] Server catalog export & live server activity timestamp verified');

    console.log('=== ALL INTER-BRANCH <-> SERVER E2E SYNC CHECKS PASSED (7/7) ===');
  } finally {
    // Clean up test rows in reverse dependency order
    try {
      if (cleanupIds.transferIds.length) {
        await db.query('DELETE FROM stock_transfers WHERE id = ANY($1::int[])', [cleanupIds.transferIds]);
      }
      if (cleanupIds.alterationIds.length) {
        await db.query('DELETE FROM alterations WHERE id = ANY($1::int[])', [cleanupIds.alterationIds]);
        await db.query("SELECT setval('alterations_id_seq', (SELECT GREATEST(COALESCE(MAX(id), 0), 1) FROM alterations), true)");
      }
      if (cleanupIds.inventoryIds.length) {
        await db.query('DELETE FROM supply_records WHERE inventory_id = ANY($1::int[])', [cleanupIds.inventoryIds]);
        await db.query('DELETE FROM inventory_sizes WHERE inventory_id = ANY($1::int[])', [cleanupIds.inventoryIds]);
        await db.query('DELETE FROM inventory_branches WHERE inventory_id = ANY($1::int[])', [cleanupIds.inventoryIds]);
        await db.query('DELETE FROM inventory WHERE id = ANY($1::int[])', [cleanupIds.inventoryIds]);
      }
      if (cleanupIds.supplierIds.length) {
        await db.query('DELETE FROM supplier_transactions WHERE supplier_id = ANY($1::int[])', [cleanupIds.supplierIds]);
        await db.query('DELETE FROM suppliers WHERE id = ANY($1::int[])', [cleanupIds.supplierIds]);
      }
      if (cleanupIds.colorNames.length) {
        await db.query('DELETE FROM colors WHERE name = ANY($1::text[])', [cleanupIds.colorNames]);
      }
      if (cleanupIds.sizeNames.length) {
        await db.query('DELETE FROM sizes WHERE name = ANY($1::text[])', [cleanupIds.sizeNames]);
      }
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
    await db.close();
  }
})().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
