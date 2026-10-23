const db = require('../src/server/database/connection');
const rentalsService = require('../src/server/modules/rentals/rentals.service');
const rentalsHelpers = require('../src/server/modules/rentals/rentals.helpers');
const inventoryHelpers = require('../src/server/modules/inventory/inventory.helpers');
const inventoryService = require('../src/server/modules/inventory/inventory.service');
const { getDatabaseCairoNow } = require('../src/shared/utils/date');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('Elwazeer POS: Rentals, Barcodes & Reservations Tests');
  console.log('====================================================\n');

  const cairoNow = await getDatabaseCairoNow(db);
  const todayStr = cairoNow.date;
  console.log(`Current Cairo Date: ${todayStr}\n`);

  // Ensure test branch exists
  const branchRes = await db.query('SELECT id FROM branches ORDER BY id LIMIT 1');
  const testBranchId = branchRes.rows[0]?.id || 1;

  // Ensure test supplier exists
  let supplierId = 1;
  const supRes = await db.query('SELECT id FROM suppliers LIMIT 1');
  if (supRes.rows.length) {
    supplierId = supRes.rows[0].id;
  } else {
    const newSup = await db.query("INSERT INTO suppliers (name, phone) VALUES ('Test Supplier', '01000000000') RETURNING id");
    supplierId = newSup.rows[0].id;
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Barcode Normalization, Storage & Scannability
  // --------------------------------------------------------------------------
  console.log('>>> TEST SUITE 1: Barcode Handling & Normalization');

  // 1.1 Leading zeros preservation
  const norm1 = inventoryHelpers.normalizeBarcodeInput('000123');
  assert(norm1 === '000123' && typeof norm1 === 'string', 'Preserves leading zeros as string ("000123")');

  // 1.2 Alphanumeric preservation
  const norm2 = inventoryHelpers.normalizeBarcodeInput('SKU-SUIT-48R');
  assert(norm2 === 'SKU-SUIT-48R', 'Preserves alphanumeric barcode ("SKU-SUIT-48R")');

  // 1.3 USB Scanner input handling (whitespace, CR/LF control chars)
  const norm3 = inventoryHelpers.normalizeBarcodeInput('  009988\r\n  ');
  assert(norm3 === '009988', 'Trims whitespace and control characters from hardware barcode scanner');

  // 1.4 Empty / Null inputs
  const norm4 = inventoryHelpers.normalizeBarcodeInput('   ');
  assert(norm4 === null, 'Whitespace-only barcode normalizes to null');
  assert(inventoryHelpers.normalizeBarcodeInput(null) === null, 'Null barcode returns null');
  assert(inventoryHelpers.normalizeBarcodeInput(undefined) === null, 'Undefined barcode returns null');

  // 1.5 Barcode uniqueness across sales inventory, sizes, and rental inventory
  const testBarcode = `TESTBC${Date.now()}`;
  let duplicateCaught = false;
  try {
    // Insert rental item with testBarcode
    const item = await rentalsService.createRentalInventory({
      name: 'Suit Test Barcode',
      category: 'بدل',
      barcode: testBarcode,
      branch_stocks: [{ branch_id: testBranchId, stock_level: 1 }],
    }, { role: 'admin' });

    // Try asserting barcode available for sales inventory
    try {
      await inventoryHelpers.assertBarcodeAvailable(db, testBarcode);
    } catch (e) {
      if (e.message.includes('مستخدم بالفعل')) {
        duplicateCaught = true;
      }
    }

    // Clean up test rental item
    await db.query('DELETE FROM rental_inventory_branches WHERE rental_inventory_id = $1', [item.id]);
    await db.query('DELETE FROM rental_inventory WHERE id = $1', [item.id]);
  } catch (err) {
    console.error('Setup error in 1.5:', err);
  }
  assert(duplicateCaught, 'Cross-catalog barcode duplicate rejected with arabic error');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Rental Date Validation
  // --------------------------------------------------------------------------
  console.log('\n>>> TEST SUITE 2: Rental Date Validation');

  // Create a dedicated test rental inventory item
  const testRentalItem = await rentalsService.createRentalInventory({
    name: 'Suit Test Rentals Suite',
    category: 'بدل تركي',
    size_cut: '50',
    color: 'كحلي',
    price: 300,
    deposit: 200,
    barcode: `RENT${Date.now()}`,
    branch_stocks: [{ branch_id: testBranchId, stock_level: 1 }],
  }, { role: 'admin' });

  // 2.1 Rejection of malformed date format
  let invalidFormatCaught = false;
  try {
    await rentalsService.checkAvailability(testRentalItem.id, testBranchId, 'not-a-date', '2026-11-05', { branch_id: testBranchId });
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('صيغة التاريخ غير صالحة')) {
      invalidFormatCaught = true;
    }
  }
  assert(invalidFormatCaught, 'Rejects invalid date format with HTTP 400');

  // 2.2 Rejection of return_date earlier than pickup_date
  let returnEarlierCaught = false;
  try {
    await rentalsService.createRental({
      customer_name: 'Test Customer A',
      customer_phone: '01011111111',
      rental_item_ids: [testRentalItem.id],
      pickup_date: '2026-11-10',
      return_date: '2026-11-08',
      total_price: 300,
      deposit: 200,
      paid_amount: 100,
      branch_id: testBranchId,
    }, { branch_id: testBranchId });
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('تاريخ الإرجاع')) {
      returnEarlierCaught = true;
    }
  }
  assert(returnEarlierCaught, 'Rejects return date earlier than pickup date with HTTP 400');

  // 2.3 Acceptance of same-day rental
  let sameDaySuccess = false;
  try {
    const avail = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-20', '2026-11-20', { branch_id: testBranchId });
    if (avail.available === 1 && avail.total === 1) {
      sameDaySuccess = true;
    }
  } catch (err) {
    console.error('Same day check failed:', err);
  }
  assert(sameDaySuccess, 'Supports same-day rental checking (pickup_date === return_date)');

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Rental Overlap & Availability Boundary Enforcement
  // --------------------------------------------------------------------------
  console.log('\n>>> TEST SUITE 3: Rental Overlap & Availability Boundary Rules');

  // Book the item for 2026-11-10 through 2026-11-14 (inclusive)
  const booking1 = await rentalsService.createRental({
    customer_name: 'Booking One Customer',
    customer_phone: '01022222222',
    rental_item_ids: [testRentalItem.id],
    pickup_date: '2026-11-10',
    return_date: '2026-11-14',
    total_price: 300,
    deposit: 200,
    paid_amount: 100,
    branch_id: testBranchId,
  }, { branch_id: testBranchId, role: 'admin' });

  assert(booking1 && booking1.id, 'Successfully created initial booking (Nov 10 - Nov 14)');

  // 3.1 Check availability during exact overlap
  const availExact = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-10', '2026-11-14');
  assert(availExact.available === 0 && availExact.reserved === 1, 'Availability is 0 for exact overlapping period (Nov 10 - Nov 14)');

  // 3.2 Check availability for sub-range (inside the booking)
  const availSub = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-11', '2026-11-12');
  assert(availSub.available === 0, 'Availability is 0 for period completely inside booking (Nov 11 - Nov 12)');

  // 3.3 Check boundary overlap on return date (Nov 14 - Nov 16)
  // Store policy: suit returned on Nov 14 cannot be simultaneously picked up on Nov 14
  const availBoundaryEnd = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-14', '2026-11-16');
  assert(availBoundaryEnd.available === 0, 'Boundary conflict on return date (Nov 14) is properly reserved (available: 0)');

  // 3.4 Check boundary overlap on pickup date (Nov 08 - Nov 10)
  const availBoundaryStart = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-08', '2026-11-10');
  assert(availBoundaryStart.available === 0, 'Boundary conflict on pickup date (Nov 10) is properly reserved (available: 0)');

  // 3.5 Check completely disjoint future range (Nov 15 - Nov 18)
  const availFuture = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-15', '2026-11-18');
  assert(availFuture.available === 1, 'Item is available starting the day after return (Nov 15 - Nov 18)');

  // 3.6 Check completely disjoint past range (Nov 01 - Nov 09)
  const availPast = await rentalsService.checkAvailability(testRentalItem.id, testBranchId, '2026-11-01', '2026-11-09');
  assert(availPast.available === 1, 'Item is available prior to booking pickup (Nov 01 - Nov 09)');

  // 3.7 Attempt to create an overlapping booking: must be rejected with 400
  let overlapRejected = false;
  try {
    await rentalsService.createRental({
      customer_name: 'Overlapping Customer',
      customer_phone: '01033333333',
      rental_item_ids: [testRentalItem.id],
      pickup_date: '2026-11-12',
      return_date: '2026-11-15',
      total_price: 300,
      deposit: 200,
      paid_amount: 100,
      branch_id: testBranchId,
    }, { branch_id: testBranchId });
  } catch (err) {
    if (err.statusCode === 400 && err.message.includes('غير متاح في الفترة المحددة')) {
      overlapRejected = true;
    }
  }
  assert(overlapRejected, 'Overlapping booking creation rejected with HTTP 400 and clear arabic explanation');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Concurrency & Transactional Lock
  // --------------------------------------------------------------------------
  console.log('\n>>> TEST SUITE 4: Concurrency Lock Safety');

  // Simulate two concurrent requests attempting to book the same item on Nov 20 - Nov 22
  const promiseA = rentalsService.createRental({
    customer_name: 'Concurrent User A',
    customer_phone: '01044444444',
    rental_item_ids: [testRentalItem.id],
    pickup_date: '2026-11-20',
    return_date: '2026-11-22',
    total_price: 300,
    deposit: 200,
    paid_amount: 100,
    branch_id: testBranchId,
  }, { branch_id: testBranchId, role: 'admin' });

  const promiseB = rentalsService.createRental({
    customer_name: 'Concurrent User B',
    customer_phone: '01055555555',
    rental_item_ids: [testRentalItem.id],
    pickup_date: '2026-11-20',
    return_date: '2026-11-22',
    total_price: 300,
    deposit: 200,
    paid_amount: 100,
    branch_id: testBranchId,
  }, { branch_id: testBranchId, role: 'admin' });

  const results = await Promise.allSettled([promiseA, promiseB]);
  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert(succeeded.length === 1, 'Exactly one concurrent booking succeeded');
  assert(rejected.length === 1 && rejected[0].reason.statusCode === 400, 'Second concurrent booking was serialized and safely rejected');

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Upcoming Reservations Filter
  // --------------------------------------------------------------------------
  console.log('\n>>> TEST SUITE 5: Reservations & Upcoming Filter');

  // Setup 3 bookings relative to today:
  // A) Future booked reservation (pickup = today + 5 days) -> MUST appear in upcoming
  // B) Past booked reservation (pickup = 2025-01-01) -> MUST NOT appear in upcoming
  // C) Cancelled future reservation (pickup = today + 5 days, status = cancelled) -> MUST NOT appear

  const d = new Date();
  d.setDate(d.getDate() + 5);
  const futurePickupStr = d.toISOString().split('T')[0];
  d.setDate(d.getDate() + 3);
  const futureReturnStr = d.toISOString().split('T')[0];

  // Booking A (Future upcoming)
  const upcomingBooking = await rentalsService.createRental({
    customer_name: 'Upcoming Test VIP',
    customer_phone: '01066666666',
    rental_item_ids: [testRentalItem.id],
    pickup_date: futurePickupStr,
    return_date: futureReturnStr,
    total_price: 500,
    deposit: 300,
    paid_amount: 200,
    branch_id: testBranchId,
  }, { branch_id: testBranchId, role: 'admin' });

  // Booking B (Past date, manually inserted as booked in past)
  const pastRes = await db.query(
    `INSERT INTO rentals (customer_id, rental_inventory_id, branch_id, pickup_date, return_date, total_price, deposit, paid_amount, remaining, status, rental_group_uuid)
     VALUES ($1, $2, $3, '2025-01-10', '2025-01-15', 300, 200, 100, 200, 'booked', gen_random_uuid())
     RETURNING id`,
    [upcomingBooking.customer_id, testRentalItem.id, testBranchId]
  );
  const pastBookingId = pastRes.rows[0].id;

  // Booking C (Cancelled)
  const cancelledRes = await db.query(
    `INSERT INTO rentals (customer_id, rental_inventory_id, branch_id, pickup_date, return_date, total_price, deposit, paid_amount, remaining, status, rental_group_uuid)
     VALUES ($1, $2, $3, $4, $5, 300, 200, 100, 200, 'cancelled', gen_random_uuid())
     RETURNING id`,
    [upcomingBooking.customer_id, testRentalItem.id, testBranchId, futurePickupStr, futureReturnStr]
  );
  const cancelledBookingId = cancelledRes.rows[0].id;

  // 5.1 Test summary API: upcoming count
  const summary = await rentalsService.getRentalsSummary(testBranchId, { role: 'admin' });
  assert(Number(summary.upcoming) >= 1, `Summary includes upcoming count (found: ${summary.upcoming})`);

  // 5.2 Test listRentals with status: 'upcoming'
  const upcomingList = await rentalsService.listRentals({ status: 'upcoming', branch_id: testBranchId }, { role: 'admin' });
  const upcomingRentals = Array.isArray(upcomingList) ? upcomingList : upcomingList.items;

  const hasFutureBooking = upcomingRentals.some((r) => Number(r.id) === Number(upcomingBooking.id));
  const hasPastBooking = upcomingRentals.some((r) => Number(r.id) === Number(pastBookingId));
  const hasCancelledBooking = upcomingRentals.some((r) => Number(r.id) === Number(cancelledBookingId));

  assert(hasFutureBooking, 'Upcoming filter contains active future reservation');
  assert(!hasPastBooking, 'Upcoming filter excludes past reservations');
  assert(!hasCancelledBooking, 'Upcoming filter excludes cancelled reservations');

  // 5.3 Test ordering: Upcoming reservations ordered soonest pickup date first (ASC)
  if (upcomingRentals.length >= 2) {
    const dates = upcomingRentals.map((r) => new Date(r.pickup_date).getTime());
    let isAscending = true;
    for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] > dates[i + 1]) isAscending = false;
    }
    assert(isAscending, 'Upcoming reservations are ordered ascending by pickup date (soonest first)');
  } else {
    assert(true, 'Upcoming reservations ordered ascending by pickup date');
  }

  // --------------------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------------------
  console.log('\n>>> Cleaning up test records...');
  await db.query('DELETE FROM rentals WHERE rental_inventory_id = $1 OR id IN ($2, $3)', [testRentalItem.id, pastBookingId, cancelledBookingId]);
  await db.query('DELETE FROM rental_inventory_branches WHERE rental_inventory_id = $1', [testRentalItem.id]);
  await db.query('DELETE FROM rental_inventory WHERE id = $1', [testRentalItem.id]);
  try {
    await db.query('DELETE FROM customers WHERE phone IN ($1, $2, $3, $4, $5, $6)', [
      '01011111111', '01022222222', '01033333333', '01044444444', '01055555555', '01066666666'
    ]);
  } catch {}
  console.log('Cleanup complete.');

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
  console.log(`PASSED: ${passedTests}`);
  console.log(`FAILED: ${failedTests}`);
  console.log('====================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
