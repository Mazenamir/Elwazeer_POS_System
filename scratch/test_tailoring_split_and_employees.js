const { describe, it } = require('node:test');
const assert = require('node:assert');

const db = require('../src/server/database/connection');
const tailoringService = require('../src/server/modules/tailoring/tailoring.service');
const employeesService = require('../src/server/modules/hr/employees.service');

async function run() {
  console.log('=== VERIFYING TAILORING EMPLOYEES & SPLIT PAYMENTS ===');

  // Test 1: Verify Employee options
  console.log('\n--- 1. Employees List & Options Verification ---');
  const empOpts = await employeesService.getEmployeeOptions(1);
  assert(Array.isArray(empOpts), 'Employee options must be an array');
  assert(empOpts.length > 0, 'Must return at least 1 employee for branch 1');
  console.log(`✓ Loaded ${empOpts.length} employees from getEmployeeOptions successfully. First:`, empOpts[0].name);

  // Test 2: Create Tailoring Order with Split Payment (Cash 600 + Vodafone Cash 400)
  console.log('\n--- 2. Creating Tailoring Order with Split Deposit ---');
  const branch1Emp = empOpts.find(e => Number(e.branch_id) === 1) || empOpts[0];
  const targetBranchId = Number(branch1Emp.branch_id) || 1;
  const mockUser = { id: 1, role: 'admin', branch_id: targetBranchId, username: 'admin' };
  const orderBody = {
    customer_name: 'عميل تجربة الدفع المجزأ',
    customer_phone: '01099887766',
    product_description: 'بدلة سموكنج تفصيل خاص كحلي',
    measurements: 'طول 75 / كتف 48 / صدر 52 / بنطلون 104',
    total_amount: 2500,
    paid_amount: 1000,
    remaining_amount: 1500,
    payment_method: 'split',
    payment_splits: [
      { method: 'cash', amount: 600 },
      { method: 'wallet', amount: 400 },
    ],
    seller_id: branch1Emp.id,
    branch_id: targetBranchId,
  };

  const created = await tailoringService.createTailoringOrder(orderBody, mockUser);
  assert.strictEqual(created.payment_method, 'split', 'Order payment method must be split');
  assert.strictEqual(Number(created.paid_amount), 1000, 'Paid amount must be 1000');
  assert.strictEqual(Number(created.remaining_amount), 1500, 'Remaining must be 1500');
  assert.strictEqual(Number(created.total_amount), 2500, 'Total must be 2500');

  // Check child payments in database
  const childPayments = await db.query(
    'SELECT * FROM tailoring_payments WHERE tailoring_order_id = $1 ORDER BY id ASC',
    [created.id]
  );
  assert.strictEqual(childPayments.rows.length, 2, 'Must have 2 payment records for split deposit');
  assert.strictEqual(childPayments.rows[0].payment_method, 'cash', 'First payment method must be cash');
  assert.strictEqual(Number(childPayments.rows[0].amount), 600, 'First payment amount must be 600');
  assert.strictEqual(childPayments.rows[1].payment_method, 'wallet', 'Second payment method must be wallet');
  assert.strictEqual(Number(childPayments.rows[1].amount), 400, 'Second payment amount must be 400');
  console.log(`✓ Order #${created.invoice_number} created with 2 split deposit payments in database.`);

  // Test 3: Pay Remaining with Split Payment (InstaPay 800 + Visa 700)
  console.log('\n--- 3. Paying Remaining Amount with Split Payment ---');
  const payRes = await tailoringService.payRemainingTailoringOrder(created.id, mockUser, {
    payment_method: 'split',
    payment_splits: [
      { method: 'bank_transfer', amount: 800 },
      { method: 'card', amount: 700 },
    ],
  });

  assert.strictEqual(Number(payRes.remainingAmount), 0, 'Remaining amount must be 0 after settlement');
  assert.strictEqual(Number(payRes.newPaidAmount), 2500, 'Total paid amount must be 2500');
  assert.strictEqual(payRes.paymentMethod, 'split', 'Final payment method must be split');

  // Check all payments in database
  const allPayments = await db.query(
    'SELECT * FROM tailoring_payments WHERE tailoring_order_id = $1 ORDER BY id ASC',
    [created.id]
  );
  assert.strictEqual(allPayments.rows.length, 4, 'Must have 4 total payments (2 deposit + 2 remainder)');
  const methods = allPayments.rows.map(r => ({ method: r.payment_method, amount: Number(r.amount) }));
  console.log('✓ All payments stored in tailoring_payments:', methods);
  assert.deepStrictEqual(methods, [
    { method: 'cash', amount: 600 },
    { method: 'wallet', amount: 400 },
    { method: 'bank_transfer', amount: 800 },
    { method: 'card', amount: 700 },
  ]);

  // Clean up test order
  await db.query('DELETE FROM tailoring_payments WHERE tailoring_order_id = $1', [created.id]);
  await db.query('DELETE FROM tailoring_orders WHERE id = $1', [created.id]);
  await db.query('DELETE FROM customers WHERE phone = $1', ['01099887766']);
  console.log('✓ Cleaned up test records cleanly.');

  console.log('\n=== ALL TAILORING SPLIT & EMPLOYEE TESTS PASSED! ===\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
