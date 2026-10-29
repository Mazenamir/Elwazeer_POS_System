/**
 * Test Suite: Branch Transfer Logs & Scoping Invariants
 * Verifies that stock transfer logs strictly isolate branch data,
 * support from/to directions, status tracking, search, pagination, and excel export.
 */

const assert = require('assert');
const db = require('../src/server/database/connection');
const inventoryService = require('../src/server/modules/inventory/inventory.service');
const reportsExcel = require('../src/server/modules/reports/reports.excel');

async function run() {
  console.log('🧪 Starting Branch Transfer Logs & Scoping Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error(err);
      failed++;
    }
  }

  const adminUser = { id: 1, role: 'admin', branch_id: 1, username: 'admin' };
  const branchUser2 = { id: 2, role: 'cashier', branch_id: 2, username: 'cashier_b2' };
  const branchUser3 = { id: 3, role: 'cashier', branch_id: 3, username: 'cashier_b3' };

  // Setup sample test transfer data if needed
  let testTransferId1, testTransferId2, testTransferId3;

  await test('SETUP: Seed distinct transfers between branches', async () => {
    // 1. Transfer from branch 1 to branch 2 (completed)
    const ins1 = await db.query(`
      INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, sizes_data, transfer_date)
      VALUES (1, 1, 2, 5, 'completed', '[{"size_name":"50","color_name":"Black","quantity":5}]', '2026-10-25 10:00:00')
      RETURNING id
    `);
    testTransferId1 = ins1.rows[0].id;

    // 2. Transfer from branch 2 to branch 3 (pending)
    const ins2 = await db.query(`
      INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, sizes_data, transfer_date)
      VALUES (1, 2, 3, 3, 'pending', '[{"size_name":"52","color_name":"Navy","quantity":3}]', '2026-10-26 12:00:00')
      RETURNING id
    `);
    testTransferId2 = ins2.rows[0].id;

    // 3. Transfer from branch 1 to branch 3 (requested)
    const ins3 = await db.query(`
      INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, sizes_data, transfer_date)
      VALUES (1, 1, 3, 4, 'requested', '[{"size_name":"54","color_name":"Grey","quantity":4}]', '2026-10-26 14:00:00')
      RETURNING id
    `);
    testTransferId3 = ins3.rows[0].id;

    assert.ok(testTransferId1 && testTransferId2 && testTransferId3, 'Sample transfers created');
  });

  // TEST 1: Branch Scoping ("و تظهر لكل فرع حاجته")
  await test('TR-01: Branch-scoped user only sees transfers involving their branch', async () => {
    const resB2 = await inventoryService.listTransferLogs({ limit: 'all' }, branchUser2);
    
    // Check that every transfer returned involves branch 2 as either from or to
    for (const item of resB2.items) {
      const involvesB2 = Number(item.from_branch_id) === 2 || Number(item.to_branch_id) === 2;
      assert.strictEqual(involvesB2, true, `Transfer #${item.id} must involve Branch 2`);
    }

    // Branch 2 must NOT see Transfer 3 (which is strictly Branch 1 -> Branch 3)
    const hasTr3 = resB2.items.some((i) => i.id === testTransferId3);
    assert.strictEqual(hasTr3, false, 'Branch 2 user must not see transfer between Branch 1 and Branch 3');

    // Branch 2 MUST see Transfer 1 (1 -> 2) and Transfer 2 (2 -> 3)
    const hasTr1 = resB2.items.some((i) => i.id === testTransferId1);
    const hasTr2 = resB2.items.some((i) => i.id === testTransferId2);
    assert.strictEqual(hasTr1, true, 'Branch 2 must see incoming transfer 1');
    assert.strictEqual(hasTr2, true, 'Branch 2 must see outgoing transfer 2');
  });

  // TEST 1B: Strict Isolation when branch_id is null / undefined
  await test('TR-01B: Scoped cashier without branch_id sees 0 transfers (zero-leakage)', async () => {
    const unassignedCashier = { id: 99, role: 'cashier', branch_id: null, username: 'orphan_cashier' };
    const resOrphan = await inventoryService.listTransferLogs({ limit: 'all' }, unassignedCashier);
    assert.strictEqual(resOrphan.items.length, 0, 'Orphan cashier must see zero transfers');
    assert.strictEqual(resOrphan.summary.total, 0, 'Summary total for orphan cashier must be 0');
  });

  // TEST 2: Direction Filtering (صادر من الفرع vs وارد إلى الفرع)
  await test('TR-02: Direction filter separates outgoing and incoming transfers', async () => {
    // Outgoing from Branch 2
    const resOutgoing = await inventoryService.listTransferLogs({ direction: 'outgoing', limit: 'all' }, branchUser2);
    for (const item of resOutgoing.items) {
      assert.strictEqual(Number(item.from_branch_id), 2, 'Outgoing transfers must originate from branch 2');
      assert.strictEqual(item.is_outgoing, true, 'is_outgoing flag must be true');
    }
    const hasTr2Out = resOutgoing.items.some((i) => i.id === testTransferId2);
    assert.strictEqual(hasTr2Out, true, 'Transfer 2 (from 2 to 3) must be in outgoing');
    const hasTr1Out = resOutgoing.items.some((i) => i.id === testTransferId1);
    assert.strictEqual(hasTr1Out, false, 'Transfer 1 (from 1 to 2) must NOT be in outgoing');

    // Incoming to Branch 2
    const resIncoming = await inventoryService.listTransferLogs({ direction: 'incoming', limit: 'all' }, branchUser2);
    for (const item of resIncoming.items) {
      assert.strictEqual(Number(item.to_branch_id), 2, 'Incoming transfers must be destined to branch 2');
      assert.strictEqual(item.is_incoming, true, 'is_incoming flag must be true');
    }
    const hasTr1In = resIncoming.items.some((i) => i.id === testTransferId1);
    assert.strictEqual(hasTr1In, true, 'Transfer 1 (from 1 to 2) must be in incoming');
    const hasTr2In = resIncoming.items.some((i) => i.id === testTransferId2);
    assert.strictEqual(hasTr2In, false, 'Transfer 2 (from 2 to 3) must NOT be in incoming');
  });

  // TEST 3: Admin access and branch filtering
  await test('TR-03: Admin can see all transfers or filter by specific branch', async () => {
    // All
    const resAll = await inventoryService.listTransferLogs({ limit: 'all' }, adminUser);
    const hasTr1 = resAll.items.some((i) => i.id === testTransferId1);
    const hasTr2 = resAll.items.some((i) => i.id === testTransferId2);
    const hasTr3 = resAll.items.some((i) => i.id === testTransferId3);
    assert.strictEqual(hasTr1 && hasTr2 && hasTr3, true, 'Admin sees all transfers');

    // Admin scopes to Branch 3
    const resB3 = await inventoryService.listTransferLogs({ branch_id: '3', limit: 'all' }, adminUser);
    const b3HasTr2 = resB3.items.some((i) => i.id === testTransferId2);
    const b3HasTr3 = resB3.items.some((i) => i.id === testTransferId3);
    const b3HasTr1 = resB3.items.some((i) => i.id === testTransferId1);
    assert.strictEqual(b3HasTr2, true, 'Branch 3 view includes Transfer 2');
    assert.strictEqual(b3HasTr3, true, 'Branch 3 view includes Transfer 3');
    assert.strictEqual(b3HasTr1, false, 'Branch 3 view excludes Transfer 1 (1->2)');
  });

  // TEST 4: Status filter
  await test('TR-04: Status filter correctly isolates requested, pending, completed, received, rejected', async () => {
    const resPending = await inventoryService.listTransferLogs({ status: 'pending', limit: 'all' }, adminUser);
    for (const item of resPending.items) {
      assert.strictEqual(item.status, 'pending');
    }
    assert.strictEqual(resPending.items.some((i) => i.id === testTransferId2), true);

    const resCompleted = await inventoryService.listTransferLogs({ status: 'completed', limit: 'all' }, adminUser);
    for (const item of resCompleted.items) {
      assert.strictEqual(item.status, 'completed');
    }
    assert.strictEqual(resCompleted.items.some((i) => i.id === testTransferId1), true);

    const resReq = await inventoryService.listTransferLogs({ status: 'requested', limit: 'all' }, adminUser);
    for (const item of resReq.items) {
      assert.strictEqual(item.status, 'requested');
    }
    assert.strictEqual(resReq.items.some((i) => i.id === testTransferId3), true);
  });

  // TEST 5: Action permissions calculation (can_approve, can_receive, can_reject)
  await test('TR-05: Action permissions match user role and branch assignment', async () => {
    // Transfer 2 is status 'pending' (from 2 to 3)
    // Branch 3 is destination -> can_receive = true
    const resB3 = await inventoryService.listTransferLogs({ limit: 'all' }, branchUser3);
    const tr2ForB3 = resB3.items.find((i) => i.id === testTransferId2);
    assert.strictEqual(tr2ForB3.can_receive, true, 'Branch 3 (recipient) can receive pending shipment');

    // Branch 2 is sender -> can_receive = false
    const resB2 = await inventoryService.listTransferLogs({ limit: 'all' }, branchUser2);
    const tr2ForB2 = resB2.items.find((i) => i.id === testTransferId2);
    assert.strictEqual(tr2ForB2.can_receive, false, 'Branch 2 (sender) cannot receive pending shipment');

    // Transfer 3 is status 'requested' (from 1 to 3)
    // Admin (or branch 1) can approve/reject
    const resAdmin = await inventoryService.listTransferLogs({ limit: 'all' }, adminUser);
    const tr3ForAdmin = resAdmin.items.find((i) => i.id === testTransferId3);
    assert.strictEqual(tr3ForAdmin.can_approve, true, 'Admin can approve requested transfer');
    assert.strictEqual(tr3ForAdmin.can_reject, true, 'Admin can reject requested transfer');

    // Branch 3 (requesting branch) cannot approve its own request
    const tr3ForB3 = resB3.items.find((i) => i.id === testTransferId3);
    assert.strictEqual(tr3ForB3.can_approve, false, 'Requesting branch cannot approve its own request');
  });

  // TEST 6: Search by ID and Search by branch
  await test('TR-06: Search filter supports #ID and text matching', async () => {
    // Search by #testTransferId1
    const resSearchId = await inventoryService.listTransferLogs({ search: `#${testTransferId1}` }, adminUser);
    assert.strictEqual(resSearchId.items.length, 1);
    assert.strictEqual(resSearchId.items[0].id, testTransferId1);

    // Search by branch name (e.g. ANTALYA)
    const resSearchBranch = await inventoryService.listTransferLogs({ search: 'ANTALYA' }, adminUser);
    assert.ok(resSearchBranch.items.length >= 1, 'Search finds branch name ANTALYA');

    // Search by color/size from sizes_data (e.g. 'Navy')
    const resSearchColor = await inventoryService.listTransferLogs({ search: 'Navy', limit: 'all' }, adminUser);
    assert.ok(resSearchColor.items.length >= 1, 'Search matches variant color Navy in sizes_data');
    assert.strictEqual(resSearchColor.items.some((i) => i.id === testTransferId2), true);
  });

  // TEST 7: Excel Export generation
  await test('TR-07: generateTransferLogsExcel creates valid styled workbook buffer', async () => {
    const data = await inventoryService.listTransferLogs({ limit: 'all' }, adminUser);
    const buffer = await reportsExcel.generateTransferLogsExcel(data, {
      branchName: 'كافة الفروع',
      period: '2026-10-01 إلى 2026-10-31',
    });

    assert.ok(Buffer.isBuffer(buffer), 'Excel export must return a Buffer');
    assert.ok(buffer.length > 5000, `Buffer should have valid size (${buffer.length} bytes)`);
  });

  // TEST 8: Concurrency & Double-action race safety
  await test('TR-08: Concurrent approvals on requested transfer ensure single winner', async () => {
    // Ensure sufficient stock in from_branch (branch 1) for the transfer
    await db.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
      VALUES (1, 1, 10)
      ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = inventory_branches.stock_level + 10
    `);

    // Seed a specific requested transfer
    const insRace = await db.query(`
      INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, transfer_date)
      VALUES (1, 1, 2, 1, 'requested', CURRENT_TIMESTAMP)
      RETURNING id
    `);
    const raceId = insRace.rows[0].id;

    // Run 2 simultaneous approvals
    const results = await Promise.allSettled([
      inventoryService.approveTransfer(raceId, adminUser),
      inventoryService.approveTransfer(raceId, adminUser),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Exactly one approval must succeed');
    assert.strictEqual(failures.length, 1, 'The other approval must fail safely without corruption');

    // Clean up race row
    await db.query('DELETE FROM stock_transfers WHERE id = $1', [raceId]);
  });

  // Cleanup sample rows
  await test('TEARDOWN: Clean up test transfers', async () => {
    await db.query('DELETE FROM stock_transfers WHERE id IN ($1, $2, $3)', [testTransferId1, testTransferId2, testTransferId3]);
    console.log('  Cleaned up sample test transfers.');
  });

  console.log('\n==================================================');
  console.log(`Branch Transfer Logs Suite: ${passed} passed, ${failed} failed.`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
