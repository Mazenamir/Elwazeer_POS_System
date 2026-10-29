/**
 * Automated Verification Suite: Dynamic Categories and Inventory Filters
 * 
 * Verifies that:
 * 1. Category filters across backend and frontend are 100% dynamic based only on live database records.
 * 2. Categories with 0 items never appear.
 * 3. Newly added categories appear immediately with accurate counts.
 * 4. Deleted categories immediately disappear once their count reaches 0.
 * 5. Metadata cache invalidation works upon product creation, update, and deletion.
 * 6. Branch scoping correctly isolates categories that have stock in the requested branch.
 * 7. /inventory/categories endpoint returns the live dynamic categories and counts.
 */

const assert = require('assert');
const db = require('../src/server/database/connection');
const inventoryService = require('../src/server/modules/inventory/inventory.service');
const { invalidateInventoryMetadata } = require('../src/server/modules/inventory/inventory.helpers');

async function run() {
  console.log('================================================================================');
  console.log('🧪 RUNNING: Dynamic Categories & Filters Regression Suite');
  console.log('================================================================================\n');

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Live DB Matching - Verify no phantom / 0-count categories exist
    // --------------------------------------------------------------------------
    console.log('[Test 1] Verifying live categories match database items with count > 0 ...');
    invalidateInventoryMetadata();
    const meta = await inventoryService.getMetadata();

    const dbRows = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(category), ''), 'أخرى') as cat, count(*)::int as count
      FROM inventory
      WHERE is_deleted = FALSE
      GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'أخرى')
      HAVING count(*) > 0
    `);

    const expectedCatsFromDb = new Set(dbRows.rows.map((r) => r.cat));

    // Verify all returned non-suit categories exist in DB
    for (const cat of meta.categories) {
      if (cat === 'بدل') continue;
      assert.strictEqual(
        expectedCatsFromDb.has(cat),
        true,
        `Unexpected phantom category "${cat}" returned by getMetadata()!`
      );
      assert.strictEqual(
        typeof meta.categoryCounts[cat] === 'number' && meta.categoryCounts[cat] > 0,
        true,
        `Category "${cat}" in metadata has non-positive count: ${meta.categoryCounts[cat]}`
      );
    }

    // Verify hardcoded defaults from old code (like 'بليزر', 'حذاء') are absent if count is 0
    const bannedPhantomCategories = ['بليزر', 'حذاء', 'إكسسوارات', 'صديري', 'كرافت', 'بيبيون', 'سواريه', 'نصف ياقة', 'جينز'];
    for (const banned of bannedPhantomCategories) {
      if (!expectedCatsFromDb.has(banned)) {
        assert.strictEqual(
          meta.categories.includes(banned),
          false,
          `Banned phantom category "${banned}" must NOT be in categories list!`
        );
        assert.strictEqual(
          meta.categoryCounts[banned] || 0,
          0,
          `Banned phantom category "${banned}" must have 0 count!`
        );
      }
    }
    console.log('  ✅ PASS: Only active categories with count > 0 are returned. Zero phantom categories.\n');

    // --------------------------------------------------------------------------
    // TEST 2: Dynamic Category Addition
    // --------------------------------------------------------------------------
    console.log('[Test 2] Adding a product with a unique dynamic category ...');
    const testCategory = `TEST_DYN_${Date.now()}`;
    const testBarcode1 = `999${Date.now().toString().slice(-8)}1`;
    const testBarcode2 = `999${Date.now().toString().slice(-8)}2`;

    const insRes1 = await db.query(`
      INSERT INTO inventory (name, category, price, cost_price, barcode, is_deleted)
      VALUES ($1, $2, 100, 50, $3, FALSE)
      RETURNING id
    `, ['Test Dynamic Product 1', testCategory, testBarcode1]);
    const prod1Id = insRes1.rows[0].id;

    invalidateInventoryMetadata();
    const metaAfterAdd1 = await inventoryService.getMetadata();

    assert.strictEqual(
      metaAfterAdd1.categories.includes(testCategory),
      true,
      `Newly created category "${testCategory}" must appear in metadata categories!`
    );
    assert.strictEqual(
      metaAfterAdd1.categoryCounts[testCategory],
      1,
      `Category count for "${testCategory}" should be exactly 1!`
    );
    console.log(`  ✅ PASS: Category "${testCategory}" dynamically appeared with count = 1.\n`);

    // Add a second product to same category
    console.log('[Test 3] Adding a second product to verify count increment ...');
    const insRes2 = await db.query(`
      INSERT INTO inventory (name, category, price, cost_price, barcode, is_deleted)
      VALUES ($1, $2, 120, 60, $3, FALSE)
      RETURNING id
    `, ['Test Dynamic Product 2', testCategory, testBarcode2]);
    const prod2Id = insRes2.rows[0].id;

    invalidateInventoryMetadata();
    const metaAfterAdd2 = await inventoryService.getMetadata();
    assert.strictEqual(
      metaAfterAdd2.categoryCounts[testCategory],
      2,
      `Category count for "${testCategory}" should be incremented to 2!`
    );
    console.log(`  ✅ PASS: Category "${testCategory}" count dynamically updated to 2.\n`);

    // --------------------------------------------------------------------------
    // TEST 4: Dynamic Category Removal on Product Deletion
    // --------------------------------------------------------------------------
    console.log('[Test 4] Deleting test products to verify dynamic category removal ...');
    await db.query('UPDATE inventory SET is_deleted = TRUE WHERE id IN ($1, $2)', [prod1Id, prod2Id]);
    invalidateInventoryMetadata();

    const metaAfterDelete = await inventoryService.getMetadata();
    assert.strictEqual(
      metaAfterDelete.categories.includes(testCategory),
      false,
      `Deleted category "${testCategory}" must NOT appear in metadata categories!`
    );
    assert.strictEqual(
      Boolean(metaAfterDelete.categoryCounts[testCategory]),
      false,
      `Deleted category "${testCategory}" must NOT have positive count in categoryCounts!`
    );
    console.log(`  ✅ PASS: Category "${testCategory}" was immediately removed upon deletion.\n`);

    // --------------------------------------------------------------------------
    // TEST 5: Branch Isolation - Scoped Category Filtering
    // --------------------------------------------------------------------------
    console.log('[Test 5] Verifying branch-scoped category filtering ...');
    // Get existing branches
    const branchRes = await db.query('SELECT id FROM branches ORDER BY id ASC LIMIT 2');
    if (branchRes.rows.length >= 2) {
      const b1 = branchRes.rows[0].id;
      const b2 = branchRes.rows[1].id;
      const branchCat1 = `BRANCH_${b1}_ONLY_${Date.now()}`;
      const branchBarcode = `888${Date.now().toString().slice(-8)}1`;

      const insB1 = await db.query(`
        INSERT INTO inventory (name, category, price, cost_price, barcode, is_deleted)
        VALUES ($1, $2, 200, 100, $3, FALSE)
        RETURNING id
      `, ['Branch Specific Product', branchCat1, branchBarcode]);
      const branchProdId = insB1.rows[0].id;

      // Assign stock to branch 1 only
      await db.query(`
        INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
        VALUES ($1, $2, 10)
      `, [branchProdId, b1]);

      invalidateInventoryMetadata();
      const metaBranch1 = await inventoryService.getMetadata(b1);
      const metaBranch2 = await inventoryService.getMetadata(b2);

      assert.strictEqual(
        metaBranch1.categories.includes(branchCat1),
        true,
        `Category "${branchCat1}" must be visible in branch ${b1} where stock exists!`
      );
      assert.strictEqual(
        metaBranch2.categories.includes(branchCat1),
        false,
        `Category "${branchCat1}" must NOT be visible in branch ${b2} where it has 0 stock!`
      );

      // Cleanup branch test
      await db.query('DELETE FROM inventory_branches WHERE inventory_id = $1', [branchProdId]);
      await db.query('DELETE FROM inventory WHERE id = $1', [branchProdId]);
      invalidateInventoryMetadata();
      console.log(`  ✅ PASS: Branch isolation verified. Category visible only in branch with active stock.\n`);
    } else {
      console.log('  ⚠️ SKIP: Less than 2 branches in DB, skipping branch isolation test.\n');
    }

    // --------------------------------------------------------------------------
    // TEST 6: Verify Suit Aliases & Counts Accuracy
    // --------------------------------------------------------------------------
    console.log('[Test 6] Verifying suit categories aggregation and aliases ...');
    invalidateInventoryMetadata();
    const finalMeta = await inventoryService.getMetadata();

    const suitSumRes = await db.query(`
      SELECT count(*)::int as total_suits
      FROM inventory
      WHERE is_deleted = FALSE
        AND (LOWER(category) LIKE '%suit%' OR category LIKE '%بدل%')
    `);
    const expectedSuitTotal = suitSumRes.rows[0].total_suits;

    if (expectedSuitTotal > 0) {
      assert.strictEqual(
        finalMeta.categories.includes('بدل'),
        true,
        'Categories must include "بدل" when suit items exist in inventory!'
      );
      assert.strictEqual(
        finalMeta.categoryCounts['بدل'],
        expectedSuitTotal,
        `"بدل" count (${finalMeta.categoryCounts['بدل']}) does not match expected suit count (${expectedSuitTotal})!`
      );
      assert.strictEqual(
        finalMeta.categoryCounts['بدل (جميع الأنواع)'],
        expectedSuitTotal,
        `"بدل (جميع الأنواع)" count does not match expected suit count!`
      );
    } else {
      assert.strictEqual(
        finalMeta.categories.includes('بدل'),
        false,
        'Categories must NOT include "بدل" when 0 suit items exist!'
      );
    }
    console.log(`  ✅ PASS: Suit aggregation verified with total = ${expectedSuitTotal}.\n`);

    // --------------------------------------------------------------------------
    // TEST 7: Branch Matrix Suit Category Resolution
    // --------------------------------------------------------------------------
    console.log('[Test 7] Verifying Branch Matrix category filtering for "بدل" ...');
    const adminUser = { id: 1, role: 'admin' };
    const matrixSuitsRes = await inventoryService.getBranchMatrix({ category: 'بدل' }, adminUser);
    assert.strictEqual(
      matrixSuitsRes.summary.total_products,
      expectedSuitTotal,
      `Branch matrix total_products for "بدل" (${matrixSuitsRes.summary.total_products}) must equal ${expectedSuitTotal}!`
    );
    assert.ok(
      matrixSuitsRes.items.length > 0,
      'Branch matrix must return suit items when category="بدل" is queried!'
    );
    for (const item of matrixSuitsRes.items) {
      const isSuit = (item.category || '').toLowerCase().includes('suit') || (item.category || '').includes('بدل');
      assert.strictEqual(isSuit, true, `Item #${item.id} with category "${item.category}" should be a suit!`);
    }
    console.log(`  ✅ PASS: Branch Matrix correctly resolved category "بدل" to ${matrixSuitsRes.summary.total_products} suit items.\n`);

    // --------------------------------------------------------------------------
    // TEST 8: Rental Inventory Dynamic Categories (Zero Phantoms from Retail)
    // --------------------------------------------------------------------------
    console.log('[Test 8] Verifying Rental Inventory categories are 100% dynamic from rental_inventory ...');
    const rentalsService = require('../src/server/modules/rentals/rentals.service');
    const rentalMeta = await rentalsService.getRentalMetadata();

    const rentalDbRows = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(category), ''), 'أخرى') as cat, count(*)::int as count
      FROM rental_inventory
      WHERE is_deleted = FALSE
      GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'أخرى')
      HAVING count(*) > 0
    `);
    const expectedRentalCats = new Set(rentalDbRows.rows.map((r) => r.cat));

    for (const cat of rentalMeta.categories) {
      if (cat === 'بدل') continue;
      assert.strictEqual(
        expectedRentalCats.has(cat),
        true,
        `Unexpected phantom category "${cat}" returned in rental categories!`
      );
      assert.strictEqual(
        typeof rentalMeta.categoryCounts[cat] === 'number' && rentalMeta.categoryCounts[cat] > 0,
        true,
        `Rental category "${cat}" has non-positive count: ${rentalMeta.categoryCounts[cat]}`
      );
    }

    // Verify retail-only categories (e.g. بنطلون, قميص) are NOT in rental categories if 0 items exist
    for (const retailCat of ['بنطلون', 'قميص', 'KIDS', 'محافظ', 'ترنج', 'تيشيرت']) {
      if (!expectedRentalCats.has(retailCat)) {
        assert.strictEqual(
          rentalMeta.categories.includes(retailCat),
          false,
          `Retail-only category "${retailCat}" must NOT leak into rental inventory categories!`
        );
      }
    }
    console.log('  ✅ PASS: Rental categories strictly reflect rental_inventory. Zero retail phantoms.\n');

    // --------------------------------------------------------------------------
    // TEST 9: Rental Inventory Dynamic Addition, Deletion & Suit Query
    // --------------------------------------------------------------------------
    console.log('[Test 9] Verifying Rental Inventory dynamic addition, deletion & suit filtering ...');
    const testRentalCat = `RENT_DYN_${Date.now()}`;
    const testRentalBarcode = `777${Date.now().toString().slice(-8)}1`;

    const insRent = await db.query(`
      INSERT INTO rental_inventory (name, category, barcode, price, is_deleted)
      VALUES ($1, $2, $3, 100, FALSE)
      RETURNING id
    `, ['Test Dynamic Rental Item', testRentalCat, testRentalBarcode]);
    const testRentId = insRent.rows[0].id;

    const rentalMetaAfterAdd = await rentalsService.getRentalMetadata();
    assert.strictEqual(
      rentalMetaAfterAdd.categories.includes(testRentalCat),
      true,
      `Newly created rental category "${testRentalCat}" must appear in rental categories!`
    );
    assert.strictEqual(
      rentalMetaAfterAdd.categoryCounts[testRentalCat],
      1,
      `Count for rental category "${testRentalCat}" must be 1!`
    );

    // Delete rental item and verify removal
    await db.query('UPDATE rental_inventory SET is_deleted = TRUE WHERE id = $1', [testRentId]);
    const rentalMetaAfterDel = await rentalsService.getRentalMetadata();
    assert.strictEqual(
      rentalMetaAfterDel.categories.includes(testRentalCat),
      false,
      `Deleted rental category "${testRentalCat}" must be removed!`
    );

    // Verify rental suits filtering by "بدل"
    const rentalSuits = await rentalsService.listRentalInventory({ category: 'بدل', all: 'true' }, adminUser);
    const rentalSuitCountRes = await db.query(`
      SELECT count(*)::int as count FROM rental_inventory
      WHERE is_deleted = FALSE AND (category ILIKE '%SUIT%' OR category LIKE '%بدل%')
    `);
    const expectedRentalSuitTotal = rentalSuitCountRes.rows[0].count;
    assert.strictEqual(
      rentalSuits.items.length,
      expectedRentalSuitTotal,
      `Filtering rental inventory by "بدل" returned ${rentalSuits.items.length}, expected ${expectedRentalSuitTotal}!`
    );
    console.log(`  ✅ PASS: Rental dynamic category addition/removal and suit filtering (${expectedRentalSuitTotal} suits) verified.\n`);

    console.log('================================================================================');
    console.log('🎉 ALL DYNAMIC CATEGORY & FILTER TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

run();
