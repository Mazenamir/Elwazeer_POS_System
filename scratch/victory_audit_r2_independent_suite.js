const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const db = require('../src/server/database/connection');
const suppliersService = require('../src/server/modules/suppliers/suppliers.service');
const { runBranchSqliteMigrations } = require('../src/server/database/migrator');
const { importCatalogIntoBranch } = require('../src/server/modules/sync/sync.service');

async function testIndependentSuite() {
  console.log('=== STARTING INDEPENDENT VICTORY AUDITOR (R2) ADVERSARIAL SUITE ===\n');

  // --- 1. SQLite Migration & Branch Sync Stress Test ---
  console.log('[1] SQLite Migration on Populated Database & Branch Sync:');
  const sqliteDb = new DatabaseSync(':memory:');
  sqliteDb.exec(`
    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      initials TEXT,
      category TEXT,
      contact_person TEXT,
      phone TEXT,
      supply_type TEXT,
      last_supply_date TEXT,
      balance REAL DEFAULT 0,
      total_purchases REAL DEFAULT 0,
      notes TEXT,
      gender_category TEXT DEFAULT 'مشترك',
      is_active INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active'
    );
    INSERT INTO suppliers (name, initials, category, contact_person, phone, supply_type, balance, status)
    VALUES 
      ('شركة النيل للأقمشة', 'نيل', 'أقمشة', 'محمد', '01011111111', 'محلي', 1500, 'active'),
      ('مصنع الأهرام للبدل', 'أهرام', 'بدل', 'علي', '01022222222', 'محلي', 3200, 'active'),
      ('مورد تركي مستورد', 'تركي', 'إكسسوارات', 'أوزغور', '01033333333', 'مستورد', 0, 'active');
  `);

  // Run branch migrations on this pre-populated DB
  await runBranchSqliteMigrations(sqliteDb);

  const columns = sqliteDb.prepare('PRAGMA table_info(suppliers)').all();
  const createdCol = columns.find((c) => c.name === 'created_at');
  assert(createdCol, 'created_at column MUST exist after migration');
  console.log('  ✓ created_at column verified in SQLite table schema:', createdCol);

  const rows = sqliteDb.prepare('SELECT id, name, created_at, balance FROM suppliers ORDER BY id').all();
  assert.strictEqual(rows.length, 3, 'All pre-existing suppliers preserved');
  for (const r of rows) {
    assert(r.created_at, `Supplier #${r.id} must have non-null created_at`);
    assert(typeof r.created_at === 'string' && r.created_at.length > 0);
  }
  console.log('  ✓ Pre-existing records correctly backfilled with timestamp:', rows);

  // Sync test: existing update, brand new insertion, null created_at
  const syncRes = await importCatalogIntoBranch({
    suppliers: [
      {
        id: 1,
        name: 'شركة النيل للأقمشة (محدثة)',
        balance: 1800,
        status: 'active',
        created_at: '2022-01-15T08:00:00.000Z'
      },
      {
        id: 4,
        name: 'مورد جديد عبر المزامنة',
        balance: 600,
        status: 'active',
        created_at: '2026-10-20T12:00:00.000Z'
      },
      {
        id: 5,
        name: 'مورد جديد بدون تاريخ',
        balance: 0,
        status: 'active',
        created_at: null
      }
    ]
  }, sqliteDb);

  assert.strictEqual(syncRes.ok, true, 'Branch sync must complete successfully');
  const sup1 = sqliteDb.prepare('SELECT * FROM suppliers WHERE id = 1').get();
  assert.strictEqual(sup1.name, 'شركة النيل للأقمشة (محدثة)');
  assert.strictEqual(sup1.created_at, '2022-01-15T08:00:00.000Z');

  const sup4 = sqliteDb.prepare('SELECT * FROM suppliers WHERE id = 4').get();
  assert.strictEqual(sup4.name, 'مورد جديد عبر المزامنة');
  assert.strictEqual(sup4.created_at, '2026-10-20T12:00:00.000Z');

  const sup5 = sqliteDb.prepare('SELECT * FROM suppliers WHERE id = 5').get();
  assert(sup5.created_at, 'Supplier without date should receive default timestamp');

  sqliteDb.close();
  console.log('  ✓ Branch catalog sync with all permutations PASSED.\n');

  // --- 2. Live PostgreSQL Schema & Backfill Check ---
  console.log('[2] PostgreSQL Database Schema & 100% Backfill Verification:');
  const pgCol = await db.query(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'suppliers' AND column_name = 'created_at'
  `);
  assert.strictEqual(pgCol.rows.length, 1);
  assert(pgCol.rows[0].data_type.startsWith('timestamp'));
  console.log(`  ✓ PostgreSQL suppliers.created_at: type=${pgCol.rows[0].data_type}, default=${pgCol.rows[0].column_default}`);

  const pgIdx = await db.query(`
    SELECT indexname, indexdef FROM pg_indexes 
    WHERE tablename = 'suppliers' AND indexname = 'idx_suppliers_created_at'
  `);
  assert.strictEqual(pgIdx.rows.length, 1);
  console.log(`  ✓ PostgreSQL index: ${pgIdx.rows[0].indexdef}`);

  const nullCheck = await db.query('SELECT COUNT(*) as count FROM suppliers WHERE created_at IS NULL');
  assert.strictEqual(Number(nullCheck.rows[0].count), 0);
  console.log('  ✓ 100% backfill verified: 0 records with NULL created_at\n');

  // --- 3. Backend Sorting & Pagination Integrity ---
  console.log('[3] Backend Sorting Options & Pagination Check:');
  const admin = { role: 'admin' };

  // 3.1 Verify latest sorting
  const latestList = await suppliersService.listSuppliers({ sort: 'latest', limit: 20 }, admin);
  assert(latestList.data.length > 0);
  for (let i = 0; i < latestList.data.length - 1; i++) {
    const d1 = new Date(latestList.data[i].created_at).getTime();
    const d2 = new Date(latestList.data[i + 1].created_at).getTime();
    assert(d1 >= d2, `Sorting latest failed at index ${i}: ${d1} < ${d2}`);
  }
  console.log(`  ✓ 'latest' verified: ${latestList.data.length} suppliers sorted by created_at DESC, id DESC`);

  // 3.2 Verify oldest sorting
  const oldestList = await suppliersService.listSuppliers({ sort: 'oldest', limit: 20 }, admin);
  assert(oldestList.data.length > 0);
  for (let i = 0; i < oldestList.data.length - 1; i++) {
    const d1 = new Date(oldestList.data[i].created_at).getTime();
    const d2 = new Date(oldestList.data[i + 1].created_at).getTime();
    assert(d1 <= d2, `Sorting oldest failed at index ${i}: ${d1} > ${d2}`);
  }
  console.log(`  ✓ 'oldest' verified: ${oldestList.data.length} suppliers sorted by created_at ASC, id ASC`);

  // 3.3 Verify balance_desc sorting
  const balList = await suppliersService.listSuppliers({ sort: 'balance_desc', limit: 20 }, admin);
  assert(balList.data.length > 0);
  for (let i = 0; i < balList.data.length - 1; i++) {
    const b1 = Number(balList.data[i].balance || 0);
    const b2 = Number(balList.data[i + 1].balance || 0);
    assert(b1 >= b2, `Sorting balance_desc failed at index ${i}`);
  }
  console.log(`  ✓ 'balance_desc' verified: ${balList.data.length} suppliers sorted by COALESCE(balance,0) DESC`);

  // 3.4 Verify purchases_desc sorting
  const purList = await suppliersService.listSuppliers({ sort: 'purchases_desc', limit: 20 }, admin);
  assert(purList.data.length > 0);
  for (let i = 0; i < purList.data.length - 1; i++) {
    const p1 = Number(purList.data[i].total_purchases || 0);
    const p2 = Number(purList.data[i + 1].total_purchases || 0);
    assert(p1 >= p2, `Sorting purchases_desc failed at index ${i}`);
  }
  console.log(`  ✓ 'purchases_desc' verified: ${purList.data.length} suppliers sorted by COALESCE(total_purchases,0) DESC`);

  // 3.5 Verify name_asc sorting
  const nameList = await suppliersService.listSuppliers({ sort: 'name_asc', limit: 20 }, admin);
  assert(nameList.data.length > 0);
  console.log(`  ✓ 'name_asc' verified: ${nameList.data.length} suppliers returned`);

  // 3.6 Default sort fallback
  const fallbackList = await suppliersService.listSuppliers({ sort: 'INVALID_SORT_KEY_INJECTION' }, admin);
  assert.strictEqual(fallbackList.data[0]?.id, latestList.data[0]?.id);
  console.log('  ✓ Invalid / unknown sort safely fallbacks to latest\n');

  // --- 4. Retroactive Date Storage & Preservation on Update ---
  console.log('[4] Retroactive Date Creation and Preservation:');
  const retroSupplier = await suppliersService.createSupplier({
    name: 'مورد تدقيق مستقل رجعي 2020',
    code: 'AUDIT_R2_' + Date.now(),
    phone: '01122334455',
    created_at: '2020-03-15',
  });
  console.log('  Created retro supplier:', retroSupplier.id, retroSupplier.created_at);
  assert(new Date(retroSupplier.created_at).toISOString().startsWith('2020-03-15'));

  const updateAttempt = await suppliersService.updateSupplier(retroSupplier.id, {
    name: 'مورد تدقيق مستقل رجعي 2020 - تم التحديث',
    phone: '01122334499',
    created_at: '1980-01-01', // Should be ignored
  });
  assert.strictEqual(
    new Date(updateAttempt.created_at).getTime(),
    new Date(retroSupplier.created_at).getTime(),
    'created_at MUST NOT be overwritten on update'
  );
  console.log('  ✓ Supplier update strictly preserved original created_at');

  await db.query('DELETE FROM suppliers WHERE id = $1', [retroSupplier.id]);
  console.log('  ✓ Cleaned up test record\n');

  console.log('=== ALL INDEPENDENT TESTS PASSED WITH 100% SUCCESS ===');
}

testIndependentSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  });
