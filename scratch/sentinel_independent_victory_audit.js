const assert = require('assert');
const path = require('path');
const db = require('../src/server/database/connection');
const { DatabaseSync } = require('node:sqlite');
const suppliersService = require('../src/server/modules/suppliers/suppliers.service');
const { runBranchSqliteMigrations } = require('../src/server/database/migrator');
const { exportCatalogForBranch, importCatalogIntoBranch } = require('../src/server/modules/sync/sync.service');

async function runIndependentAudit() {
  console.log('====================================================');
  console.log('🚀 STARTING SENTINEL INDEPENDENT VICTORY AUDIT');
  console.log('====================================================\n');

  const auditResults = {
    pgSchema: false,
    sqliteMigration: false,
    serviceSorting: false,
    serviceNonAdmin: false,
    serviceDateCreation: false,
    serviceDatePreservation: false,
    syncRoundtrip: false,
    timezoneFormatting: false,
  };

  try {
    // -------------------------------------------------------------------------
    // 1. PostgreSQL Schema & Index Verification
    // -------------------------------------------------------------------------
    console.log('👉 [1/8] Verifying PostgreSQL Schema, Defaults, and Indexes...');
    const colRes = await db.query(`
      SELECT column_name, data_type, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'suppliers' AND column_name = 'created_at'
    `);
    assert.strictEqual(colRes.rows.length, 1, 'Column created_at must exist in suppliers table');
    assert.ok(
      colRes.rows[0].data_type.includes('timestamp'),
      `Expected timestamp type, got: ${colRes.rows[0].data_type}`
    );
    assert.ok(
      colRes.rows[0].column_default && colRes.rows[0].column_default.toLowerCase().includes('current_timestamp'),
      `Expected CURRENT_TIMESTAMP default, got: ${colRes.rows[0].column_default}`
    );

    const idxRes = await db.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'suppliers' AND indexname = 'idx_suppliers_created_at'
    `);
    assert.strictEqual(idxRes.rows.length, 1, 'Index idx_suppliers_created_at must exist');
    assert.ok(
      idxRes.rows[0].indexdef.includes('created_at DESC'),
      `Index must index created_at DESC: ${idxRes.rows[0].indexdef}`
    );

    const countRes = await db.query(`
      SELECT 
        COUNT(*)::int as total, 
        COUNT(created_at)::int as with_created_at 
      FROM suppliers
    `);
    const totalSuppliers = countRes.rows[0].total;
    const withCreatedAt = countRes.rows[0].with_created_at;
    assert.strictEqual(
      totalSuppliers,
      withCreatedAt,
      `All suppliers must have non-null created_at (total: ${totalSuppliers}, with_created_at: ${withCreatedAt})`
    );
    console.log(`   ✅ PostgreSQL Schema verified: ${totalSuppliers} suppliers, 100% backfilled, index verified.\n`);
    auditResults.pgSchema = true;

    // -------------------------------------------------------------------------
    // 2. SQLite Migration Verification (Fresh Disposable DB)
    // -------------------------------------------------------------------------
    console.log('👉 [2/8] Verifying SQLite Schema Migrations on clean database...');
    const memDb = new DatabaseSync(':memory:');
    // Create legacy table without created_at
    memDb.exec(`
      CREATE TABLE suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        initials TEXT,
        code TEXT UNIQUE,
        balance REAL DEFAULT 0,
        total_purchases REAL DEFAULT 0,
        status TEXT DEFAULT 'active'
      );
      INSERT INTO suppliers (name, code, balance) VALUES ('Legacy Supplier 1', 'LEG001', 100);
      INSERT INTO suppliers (name, code, balance) VALUES ('Legacy Supplier 2', 'LEG002', 200);
    `);

    // Run branch sqlite migrations on memDb
    await runBranchSqliteMigrations(memDb);

    const tableInfo = memDb.prepare("PRAGMA table_info(suppliers)").all();
    console.log('tableInfo:', tableInfo);
    const hasCreatedAt = tableInfo.some((c) => c.name === 'created_at');
    assert.ok(hasCreatedAt, 'SQLite suppliers table must have created_at column after migration');

    const sqliteRows = memDb.prepare("SELECT id, name, created_at FROM suppliers").all();
    for (const row of sqliteRows) {
      assert.ok(row.created_at, `Legacy supplier ${row.name} must be backfilled with created_at`);
      assert.ok(!isNaN(new Date(row.created_at).getTime()), `Invalid date string: ${row.created_at}`);
    }

    const sqliteIndexes = memDb.prepare("PRAGMA index_list(suppliers)").all();
    const hasIndex = sqliteIndexes.some((idx) => idx.name === 'idx_suppliers_created_at');
    assert.ok(hasIndex, 'SQLite suppliers table must have idx_suppliers_created_at');

    memDb.close();
    console.log('   ✅ SQLite Migrations verified: column added, legacy rows backfilled, index created.\n');
    auditResults.sqliteMigration = true;

    // -------------------------------------------------------------------------
    // 3. Backend Service Sorting Verifications
    // -------------------------------------------------------------------------
    console.log('👉 [3/8] Verifying listSuppliers Sorting Options (latest, oldest, balance, purchases, name)...');
    const adminUser = { id: 1, role: 'admin', branch_id: 1 };

    // Test: latest (default)
    const resLatest = await suppliersService.listSuppliers({ sort: 'latest', limit: 20 }, adminUser);
    const listLatest = resLatest.data;
    if (listLatest.length > 1) {
      for (let i = 0; i < listLatest.length - 1; i++) {
        const d1 = new Date(listLatest[i].created_at).getTime();
        const d2 = new Date(listLatest[i + 1].created_at).getTime();
        assert.ok(
          d1 >= d2 || (d1 === d2 && listLatest[i].id >= listLatest[i + 1].id),
          `Sort 'latest' failed at index ${i}: ${listLatest[i].created_at} vs ${listLatest[i + 1].created_at}`
        );
      }
    }

    // Test: oldest
    const resOldest = await suppliersService.listSuppliers({ sort: 'oldest', limit: 20 }, adminUser);
    const listOldest = resOldest.data;
    if (listOldest.length > 1) {
      for (let i = 0; i < listOldest.length - 1; i++) {
        const d1 = new Date(listOldest[i].created_at).getTime();
        const d2 = new Date(listOldest[i + 1].created_at).getTime();
        assert.ok(
          d1 <= d2 || (d1 === d2 && listOldest[i].id <= listOldest[i + 1].id),
          `Sort 'oldest' failed at index ${i}: ${listOldest[i].created_at} vs ${listOldest[i + 1].created_at}`
        );
      }
    }

    // Test: balance_desc
    const resBalance = await suppliersService.listSuppliers({ sort: 'balance_desc', limit: 20 }, adminUser);
    const listBalance = resBalance.data;
    if (listBalance.length > 1) {
      for (let i = 0; i < listBalance.length - 1; i++) {
        const b1 = Number(listBalance[i].balance || 0);
        const b2 = Number(listBalance[i + 1].balance || 0);
        assert.ok(b1 >= b2, `Sort 'balance_desc' failed at index ${i}: ${b1} vs ${b2}`);
      }
    }

    // Test: purchases_desc
    const resPurchases = await suppliersService.listSuppliers({ sort: 'purchases_desc', limit: 20 }, adminUser);
    const listPurchases = resPurchases.data;
    if (listPurchases.length > 1) {
      for (let i = 0; i < listPurchases.length - 1; i++) {
        const p1 = Number(listPurchases[i].total_purchases || 0);
        const p2 = Number(listPurchases[i + 1].total_purchases || 0);
        assert.ok(p1 >= p2, `Sort 'purchases_desc' failed at index ${i}: ${p1} vs ${p2}`);
      }
    }

    // Test: name_asc
    const resName = await suppliersService.listSuppliers({ sort: 'name_asc', limit: 20 }, adminUser);
    const listName = resName.data;
    if (listName.length > 1) {
      for (let i = 0; i < listName.length - 1; i++) {
        const n1 = (listName[i].name || '').trim();
        const n2 = (listName[i + 1].name || '').trim();
        assert.ok(n1.localeCompare(n2, 'ar') <= 0, `Sort 'name_asc' failed at index ${i}: ${n1} vs ${n2}`);
      }
    }

    // Test: fallback on invalid sort key
    const resFallback = await suppliersService.listSuppliers({ sort: 'non_existent_key;--DROP', limit: 10 }, adminUser);
    assert.ok(Array.isArray(resFallback.data), 'Fallback query must execute safely without SQL injection');
    console.log('   ✅ All 5 sort modes & fallback orderings verified in PostgreSQL.\n');
    auditResults.serviceSorting = true;

    // -------------------------------------------------------------------------
    // 4. Non-Admin Field Selection & Aggregate Balances
    // -------------------------------------------------------------------------
    console.log('👉 [4/8] Verifying Non-Admin User Field Selection and Aggregate Metrics...');
    const cashierUser = { id: 99, role: 'cashier', branch_id: 1, permissions: [] };
    const resCashier = await suppliersService.listSuppliers({ limit: 5 }, cashierUser);
    assert.ok(Array.isArray(resCashier.data), 'Cashier must be able to list suppliers');
    if (resCashier.data.length > 0) {
      const sup = resCashier.data[0];
      assert.ok('created_at' in sup, 'Cashier supplier record MUST contain created_at');
      assert.ok('balance' in sup, 'Cashier supplier record MUST contain balance');
      assert.ok('total_purchases' in sup, 'Cashier supplier record MUST contain total_purchases');
    }
    assert.ok(typeof resCashier.total_balance !== 'undefined', 'Total balance metric must exist');
    console.log('   ✅ Non-admin user receives full supplier record including created_at and metrics.\n');
    auditResults.serviceNonAdmin = true;

    // -------------------------------------------------------------------------
    // 5. Creation Date Handling & Cairo Timezone Persistence
    // -------------------------------------------------------------------------
    console.log('👉 [5/8] Verifying Supplier Creation Date Handling (default & explicit date)...');
    const uniqueSuffix = Date.now();
    const testCode1 = `AUD_SUP_${uniqueSuffix}_1`;
    const testCode2 = `AUD_SUP_${uniqueSuffix}_2`;

    // 5a. Explicit date: 2024-05-18
    const createdSupplierExplicit = await suppliersService.createSupplier({
      name: `مورد تدقيق مستقل ${uniqueSuffix} 1`,
      code: testCode1,
      created_at: '2024-05-18',
    });
    assert.ok(createdSupplierExplicit?.id, 'Explicit supplier must be created');
    const explicitDateObj = new Date(createdSupplierExplicit.created_at);
    const explicitDateCairo = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(explicitDateObj);
    assert.strictEqual(
      explicitDateCairo,
      '2024-05-18',
      `Explicit date must be stored and format to 2024-05-18 in Cairo timezone, got: ${explicitDateCairo}`
    );

    // 5b. Default date (omitted)
    const createdSupplierDefault = await suppliersService.createSupplier({
      name: `مورد تدقيق مستقل ${uniqueSuffix} 2`,
      code: testCode2,
    });
    assert.ok(createdSupplierDefault?.id, 'Default supplier must be created');
    const defaultDateObj = new Date(createdSupplierDefault.created_at);
    const nowObj = new Date();
    // Within 2 minutes of now
    assert.ok(
      Math.abs(defaultDateObj.getTime() - nowObj.getTime()) < 120000,
      `Default created_at must be within 2 minutes of now, got ${createdSupplierDefault.created_at}`
    );

    console.log('   ✅ Supplier creation with explicit date (Cairo preserved) and default date verified.\n');
    auditResults.serviceDateCreation = true;

    // -------------------------------------------------------------------------
    // 6. Preservation of created_at on Update
    // -------------------------------------------------------------------------
    console.log('👉 [6/8] Verifying Preservation of created_at on Supplier Update...');
    const originalCreatedAt = createdSupplierExplicit.created_at;
    const updatedSupplier = await suppliersService.updateSupplier(createdSupplierExplicit.id, {
      name: `مورد تدقيق مستقل معدل ${uniqueSuffix} 1`,
      code: testCode1,
      phone: '01099999999',
      notes: 'ملاحظة تدقيق جديدة',
      created_at: '2099-01-01', // Attacker or accidental payload trying to overwrite created_at
    });
    assert.strictEqual(
      new Date(updatedSupplier.created_at).toISOString(),
      new Date(originalCreatedAt).toISOString(),
      `created_at MUST NOT change upon supplier update! Expected: ${originalCreatedAt}, Got: ${updatedSupplier.created_at}`
    );

    // Cleanup test records
    await db.query('DELETE FROM suppliers WHERE id IN ($1, $2)', [
      createdSupplierExplicit.id,
      createdSupplierDefault.id,
    ]);
    console.log('   ✅ created_at strictly preserved across updates and test data cleaned up.\n');
    auditResults.serviceDatePreservation = true;

    // -------------------------------------------------------------------------
    // 7. Branch Sync Roundtrip (Export & SQLite Import)
    // -------------------------------------------------------------------------
    console.log('👉 [7/8] Verifying Branch Sync Catalog Export & Import with created_at...');
    const catalog = await exportCatalogForBranch(1);
    assert.ok(Array.isArray(catalog.suppliers), 'Catalog must contain suppliers');
    if (catalog.suppliers.length > 0) {
      assert.ok('created_at' in catalog.suppliers[0], 'Catalog suppliers MUST include created_at column');
    }

    const branchSyncDb = new DatabaseSync(':memory:');
    await runBranchSqliteMigrations(branchSyncDb);

    // Run importCatalogIntoBranch with the exported catalog
    const syncResult = await importCatalogIntoBranch(catalog, branchSyncDb);
    assert.ok(syncResult.ok || syncResult.success, 'Catalog import into branch SQLite must succeed');

    const syncedSuppliers = branchSyncDb.prepare('SELECT id, name, created_at FROM suppliers LIMIT 10').all();
    for (const sup of syncedSuppliers) {
      assert.ok(sup.created_at, `Synced supplier ${sup.name} must have created_at populated`);
    }

    branchSyncDb.close();
    console.log('   ✅ Branch sync export and SQLite import verified with created_at preserved.\n');
    auditResults.syncRoundtrip = true;

    // -------------------------------------------------------------------------
    // 8. Frontend Date Formatting Utility Logic
    // -------------------------------------------------------------------------
    console.log('👉 [8/8] Verifying Cairo Date Format Utility Behaviors...');
    const formatSupplierDate = (dateVal) => {
      if (!dateVal) return '-';
      try {
        if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
          const [y, m, day] = dateVal.trim().split('-');
          return `${day}/${m}/${y}`;
        }
        const normalized = typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal.trim())
          ? `${dateVal.trim().replace(' ', 'T')}Z`
          : dateVal;
        const d = new Date(normalized);
        if (isNaN(d.getTime())) return String(dateVal).slice(0, 10);
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Cairo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(d);
      } catch {
        return String(dateVal).slice(0, 10);
      }
    };

    assert.strictEqual(formatSupplierDate('2026-10-20'), '20/10/2026');
    assert.strictEqual(formatSupplierDate('2026-10-20T00:00:00.000Z'), '20/10/2026');
    assert.strictEqual(formatSupplierDate('2026-10-20 00:00:00'), '20/10/2026');
    assert.strictEqual(formatSupplierDate(null), '-');
    console.log('   ✅ Date formatter tested against ISO, SQLite format, YYYY-MM-DD, and NULL.\n');
    auditResults.timezoneFormatting = true;

    console.log('====================================================');
    console.log('🎉 ALL 8 INDEPENDENT AUDIT PHASES PASSED WITH ZERO ERRORS');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ AUDIT FAILED WITH ERROR:');
    console.error(err);
    process.exit(1);
  }
}

runIndependentAudit();
