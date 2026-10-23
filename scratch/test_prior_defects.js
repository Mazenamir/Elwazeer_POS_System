const crypto = require('crypto');
const db = require('../src/server/database/connection');
const config = require('../src/server/config/env');
const { adjustInventoryStock } = require('../src/server/modules/inventory/inventory.helpers');
const { searchInventory } = require('../src/server/modules/inventory/inventory.service');
const syncService = require('../src/server/modules/sync/sync.service');
const { runBranchSqliteMigrations } = require('../src/server/database/migrator');
const { DatabaseSync } = require('node:sqlite');

async function runDefectAuditTests() {
  console.log('🧪 Starting Deep Defect Audit & Verification Suite...\n');

  // TEST 1 & 2: Restock new variant creation and out-of-stock isolation in PostgreSQL
  await db.transaction(async (tx) => {
    const invRes = await tx.query(`
      INSERT INTO inventory (name, category, price, cost_price, stock_level)
      VALUES ('Test Restock Bug Product', 'SUIT', 100, 50, 15)
      RETURNING id
    `);
    const invId = invRes.rows[0].id;

    await tx.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
      VALUES ($1, 1, 15)
    `, [invId]);

    await tx.query(`
      INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id)
      VALUES ($1, '48', 'Black', 5, 1), ($1, '50', 'Black', 10, 1)
    `, [invId]);

    // Restock new size 52
    await adjustInventoryStock(tx, {
      inventoryId: invId,
      branchId: 1,
      quantityDelta: 3,
      size: '52',
      color: 'Black'
    });

    const afterSizes = await tx.query('SELECT size_name, color_name, stock_level FROM inventory_sizes WHERE inventory_id = $1 ORDER BY size_name', [invId]);
    const size52Row = afterSizes.rows.find(r => r.size_name === '52');
    const size50Row = afterSizes.rows.find(r => r.size_name === '50');

    if (!size52Row || Number(size52Row.stock_level) !== 3 || Number(size50Row.stock_level) !== 10) {
      throw new Error(`TEST 1 FAILED: Size 52 not created correctly or size 50 corrupted. Rows: ${JSON.stringify(afterSizes.rows)}`);
    }
    console.log('  ✅ [PASS] DEFECT-01: Restocking new variant creates new inventory_sizes row without dumping into sibling sizes');

    // Test sale of Size 48 when size 48 has 0 stock
    await tx.query("UPDATE inventory_sizes SET stock_level = 0 WHERE inventory_id = $1 AND size_name = '48'", [invId]);
    await tx.query("UPDATE inventory_sizes SET stock_level = 10 WHERE inventory_id = $1 AND size_name = '50'", [invId]);

    await adjustInventoryStock(tx, {
      inventoryId: invId,
      branchId: 1,
      quantityDelta: -1,
      size: '48',
      color: 'Black'
    });

    const afterSale = await tx.query('SELECT size_name, color_name, stock_level FROM inventory_sizes WHERE inventory_id = $1 ORDER BY size_name', [invId]);
    const after48 = afterSale.rows.find(r => r.size_name === '48');
    const after50 = afterSale.rows.find(r => r.size_name === '50');

    if (Number(after50.stock_level) !== 10 || Number(after48.stock_level) !== 0) {
      throw new Error(`TEST 2 FAILED: Selling size 48 stole from size 50! Size 50 stock: ${after50.stock_level}`);
    }
    console.log('  ✅ [PASS] DEFECT-02: Selling out-of-stock variant clamps to 0 and NEVER steals stock from other sizes');

    // Rollback so we don't pollute database
    throw new Error('ROLLBACK_TEST');
  }).catch((err) => {
    if (err.message !== 'ROLLBACK_TEST') throw err;
  });

  // TEST 3: Search by variant barcode in searchInventory (committed test product)
  let searchTestInvId = null;
  const testBarcode = `VBAR-${Date.now()}`;
  try {
    const invRes = await db.query(`
      INSERT INTO inventory (name, category, price, cost_price, stock_level)
      VALUES ('Test Barcode Search Product', 'SHIRT', 120, 60, 7)
      RETURNING id
    `);
    searchTestInvId = invRes.rows[0].id;

    await db.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
      VALUES ($1, 1, 7)
    `, [searchTestInvId]);

    await db.query(`
      INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id, barcode)
      VALUES ($1, '54', 'Navy', 7, 1, $2)
    `, [searchTestInvId, testBarcode]);

    const searchRes = await searchInventory({ query: testBarcode, branch_id: 1 }, { role: 'admin' });
    if (!searchRes.some(r => Number(r.id) === searchTestInvId)) {
      throw new Error(`TEST 3 FAILED: searchInventory failed to find product #${searchTestInvId} by variant barcode ${testBarcode}`);
    }
    console.log('  ✅ [PASS] DEFECT-03: searchInventory locates product via variant barcode in inventory_sizes');
  } finally {
    if (searchTestInvId) {
      await db.query('DELETE FROM inventory_sizes WHERE inventory_id = $1', [searchTestInvId]);
      await db.query('DELETE FROM inventory_branches WHERE inventory_id = $1', [searchTestInvId]);
      await db.query('DELETE FROM inventory WHERE id = $1', [searchTestInvId]);
    }
  }

  // TEST 4: SQLite branch mode adjustInventoryStock and branch table synchronization
  const origMode = config.IS_BRANCH_MODE;
  const origSqlite = db.sqlite;
  try {
    config.IS_BRANCH_MODE = true;
    if (!db.sqlite) {
      db.sqlite = new DatabaseSync(':memory:');
    }
    await runBranchSqliteMigrations(db.sqlite);

    // Setup a product in SQLite
    const sqliteId = 999901;
    db.sqlite.prepare('DELETE FROM inventory WHERE id = ?').run(sqliteId);
    db.sqlite.prepare('DELETE FROM inventory_branches WHERE inventory_id = ?').run(sqliteId);
    db.sqlite.prepare('DELETE FROM inventory_sizes WHERE inventory_id = ?').run(sqliteId);

    db.sqlite.prepare(`
      INSERT INTO inventory (id, name, category, price, cost_price, stock_level, is_deleted)
      VALUES (?, 'SQLite Test Suit', 'SUIT', 200, 100, 10, 0)
    `).run(sqliteId);

    db.sqlite.prepare(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
      VALUES (?, 1, 10)
    `).run(sqliteId);

    db.sqlite.prepare(`
      INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id)
      VALUES (?, '50', 'Black', 10, 1)
    `).run(sqliteId);

    // Test SQLite restock of new size 52
    await adjustInventoryStock(null, {
      inventoryId: sqliteId,
      branchId: 1,
      quantityDelta: 5,
      size: '52',
      color: 'Black'
    });

    const sqliteBranchRow = db.sqlite.prepare('SELECT stock_level FROM inventory_branches WHERE inventory_id = ? AND branch_id = 1').get(sqliteId);
    const sqliteInvRow = db.sqlite.prepare('SELECT stock_level FROM inventory WHERE id = ?').get(sqliteId);
    const sqliteSize52 = db.sqlite.prepare("SELECT stock_level FROM inventory_sizes WHERE inventory_id = ? AND size_name = '52'").get(sqliteId);

    if (Number(sqliteBranchRow?.stock_level) !== 15) {
      throw new Error(`TEST 4 FAILED: SQLite inventory_branches not updated! stock_level: ${sqliteBranchRow?.stock_level}`);
    }
    if (Number(sqliteInvRow?.stock_level) !== 15) {
      throw new Error(`TEST 4 FAILED: SQLite inventory.stock_level not updated! stock_level: ${sqliteInvRow?.stock_level}`);
    }
    if (Number(sqliteSize52?.stock_level) !== 5) {
      throw new Error(`TEST 4 FAILED: SQLite new size 52 not created with stock 5! stock_level: ${sqliteSize52?.stock_level}`);
    }

    // Test SQLite sale deduction
    await adjustInventoryStock(null, {
      inventoryId: sqliteId,
      branchId: 1,
      quantityDelta: -2,
      size: '50',
      color: 'Black'
    });

    const sqliteBranchAfterSale = db.sqlite.prepare('SELECT stock_level FROM inventory_branches WHERE inventory_id = ? AND branch_id = 1').get(sqliteId);
    const sqliteSize50AfterSale = db.sqlite.prepare("SELECT stock_level FROM inventory_sizes WHERE inventory_id = ? AND size_name = '50'").get(sqliteId);

    if (Number(sqliteBranchAfterSale?.stock_level) !== 13) {
      throw new Error(`TEST 4 FAILED: SQLite inventory_branches after sale expected 13, got ${sqliteBranchAfterSale?.stock_level}`);
    }
    if (Number(sqliteSize50AfterSale?.stock_level) !== 8) {
      throw new Error(`TEST 4 FAILED: SQLite size 50 after sale expected 8, got ${sqliteSize50AfterSale?.stock_level}`);
    }

    console.log('  ✅ [PASS] DEFECT-04: SQLite branch mode adjustInventoryStock synchronizes inventory_branches, inventory_sizes, and inventory.stock_level');

    // Clean up SQLite
    db.sqlite.prepare('DELETE FROM inventory WHERE id = ?').run(sqliteId);
    db.sqlite.prepare('DELETE FROM inventory_branches WHERE inventory_id = ?').run(sqliteId);
    db.sqlite.prepare('DELETE FROM inventory_sizes WHERE inventory_id = ?').run(sqliteId);
  } finally {
    config.IS_BRANCH_MODE = origMode;
    db.sqlite = origSqlite;
  }

  // TEST 5: Sync Catalog preserves color_name, barcode and multi-color variants in SQLite
  const testCatalog = {
    inventory_sizes: [
      { inventory_id: 888801, size_id: 1, size_name: '48', color_name: 'White', barcode: 'BAR-48-W', stock_level: 4, branch_id: 1 },
      { inventory_id: 888801, size_id: 1, size_name: '48', color_name: 'Navy', barcode: 'BAR-48-N', stock_level: 6, branch_id: 1 }
    ]
  };

  const syncSqlite = new DatabaseSync(':memory:');
  await runBranchSqliteMigrations(syncSqlite);

  const importRes = await syncService.importCatalogIntoBranch(testCatalog, syncSqlite);
  if (importRes && importRes.ok === false) {
    throw new Error(`TEST 5 FAILED: importCatalogIntoBranch returned error: ${importRes.message}`);
  }

  const syncedSizes = syncSqlite.prepare('SELECT size_name, color_name, barcode, stock_level FROM inventory_sizes WHERE inventory_id = 888801 ORDER BY color_name').all();
  if (syncedSizes.length !== 2) {
    throw new Error(`TEST 5 FAILED: importCatalogIntoBranch collapsed or dropped multi-color variant sizes! Count: ${syncedSizes.length}, Rows: ${JSON.stringify(syncedSizes)}`);
  }
  const whiteRow = syncedSizes.find(r => r.color_name === 'White');
  const navyRow = syncedSizes.find(r => r.color_name === 'Navy');

  if (!whiteRow || whiteRow.barcode !== 'BAR-48-W' || Number(whiteRow.stock_level) !== 4) {
    throw new Error(`TEST 5 FAILED: White variant missing or corrupted: ${JSON.stringify(whiteRow)}`);
  }
  if (!navyRow || navyRow.barcode !== 'BAR-48-N' || Number(navyRow.stock_level) !== 6) {
    throw new Error(`TEST 5 FAILED: Navy variant missing or corrupted: ${JSON.stringify(navyRow)}`);
  }

  console.log('  ✅ [PASS] DEFECT-05: importCatalogIntoBranch accurately syncs variant color_name, barcode and distinct color rows without clobbering');

  // TEST 6: Sync offline order replay updates inventory_sizes and inventory_branches atomically
  let replayInvId = null;
  let orderUuid = null;
  try {
    const replayInvRes = await db.query(`
      INSERT INTO inventory (name, category, price, cost_price, stock_level)
      VALUES ('Sync Replay Test Product', 'SUIT', 150, 75, 10)
      RETURNING id
    `);
    replayInvId = replayInvRes.rows[0].id;

    await db.query('INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, 1, 10)', [replayInvId]);
    await db.query('INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id) VALUES ($1, \'50\', \'Black\', 10, 1)', [replayInvId]);

    orderUuid = crypto.randomUUID();
    const mockOrderOp = {
      entity_type: 'order',
      action: 'create',
      branch_id: 1,
      payload: {
        offline_uuid: orderUuid,
        order: { total_amount: 150, branch_id: 1, payment_method: 'cash', paid_amount: 150 },
        items: [{ inventory_id: replayInvId, quantity: 2, price: 150, size: '50', color: 'Black' }]
      }
    };

    await syncService.applyOperation(mockOrderOp);

    const afterReplaySize = await db.query('SELECT stock_level FROM inventory_sizes WHERE inventory_id = $1 AND size_name = \'50\'', [replayInvId]);
    const afterReplayBranch = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [replayInvId]);

    if (Number(afterReplaySize.rows[0]?.stock_level) !== 8) {
      throw new Error(`TEST 6 FAILED: Offline order replay did not deduct inventory_sizes! stock: ${afterReplaySize.rows[0]?.stock_level}`);
    }
    if (Number(afterReplayBranch.rows[0]?.stock_level) !== 8) {
      throw new Error(`TEST 6 FAILED: Offline order replay did not deduct inventory_branches! stock: ${afterReplayBranch.rows[0]?.stock_level}`);
    }

    console.log('  ✅ [PASS] DEFECT-06: Sync offline order replay accurately deducts inventory_sizes and inventory_branches atomically');
  } finally {
    if (orderUuid) {
      const ord = await db.query('SELECT id FROM orders WHERE offline_uuid = $1', [orderUuid]);
      if (ord.rows.length) {
        await db.query('DELETE FROM order_items WHERE order_id = $1', [ord.rows[0].id]);
        await db.query('DELETE FROM orders WHERE id = $1', [ord.rows[0].id]);
      }
    }
    if (replayInvId) {
      await db.query('DELETE FROM inventory_sizes WHERE inventory_id = $1', [replayInvId]);
      await db.query('DELETE FROM inventory_branches WHERE inventory_id = $1', [replayInvId]);
      await db.query('DELETE FROM inventory WHERE id = $1', [replayInvId]);
    }
  }

  console.log('\n==================================================');
  console.log('Defect Audit Suite: 6 passed, 0 failed.');
  console.log('==================================================\n');
  process.exit(0);
}

runDefectAuditTests().catch((err) => {
  console.error('Audit suite error:', err);
  process.exit(1);
});
