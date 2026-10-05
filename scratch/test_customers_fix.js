const assert = require('assert');
const customersService = require('../src/server/modules/customers/customers.service');
const { paginatedPayload, parsePagination } = require('../src/shared/utils/pagination');

async function runTests() {
  console.log('🧪 Starting Customers Section Verification Tests...');

  // 1. Verify paginatedPayload has customers alias
  const pObj = parsePagination({ query: {} });
  const pPayload = paginatedPayload([{ id: 1, name: 'Test' }], 1, pObj);
  assert(Array.isArray(pPayload.data), 'pPayload.data should be an array');
  assert(Array.isArray(pPayload.customers), 'pPayload.customers should be an array');
  assert(Array.isArray(pPayload.items), 'pPayload.items should be an array');
  assert.strictEqual(pPayload.customers.length, 1);
  console.log('  ✅ [PASS] 1. paginatedPayload provides customers, data, and items aliases');

  // 2. Test listCustomers as admin
  const listResult = await customersService.listCustomers({ query: {} }, { role: 'admin', branch_id: 1 });
  assert(listResult.customers && Array.isArray(listResult.customers), 'listResult.customers must be an array');
  assert(listResult.data && Array.isArray(listResult.data), 'listResult.data must be an array');
  assert(listResult.customers.length > 0, 'Customers list should have records from DB');
  console.log(`  ✅ [PASS] 2. listCustomers returns ${listResult.customers.length} customers with valid .customers and .data properties`);

  // 3. Test listCustomers search
  const firstCustomer = listResult.customers[0];
  const searchResult = await customersService.listCustomers(
    { query: { search: firstCustomer.phone } },
    { role: 'branch_user', branch_id: 999 } // different branch user searching by phone
  );
  assert(searchResult.customers.length > 0, 'Cross-branch search by phone must find the customer');
  assert(searchResult.customers.some(c => c.phone === firstCustomer.phone), 'Search result must include first customer');
  console.log(`  ✅ [PASS] 3. Cross-branch search by phone successfully found customer: ${firstCustomer.name}`);

  // 4. Test createCustomer with custom status and branch_id
  const testPhone = '01999999999';
  const newCust = await customersService.createCustomer(
    {
      name: 'عميل اختبار النظام',
      phone: testPhone,
      national_id: '12345678901234',
      status: 'مميز',
      branch_id: 2,
    },
    { role: 'admin', branch_id: 1 }
  );
  assert(newCust && newCust.id, 'New customer must have an ID');
  assert.strictEqual(newCust.name, 'عميل اختبار النظام');
  assert.strictEqual(newCust.phone, testPhone);
  assert.strictEqual(newCust.status, 'مميز');
  assert.strictEqual(Number(newCust.branch_id), 2);
  console.log(`  ✅ [PASS] 4. createCustomer succeeded with id: ${newCust.id}, status: ${newCust.status}, branch_id: ${newCust.branch_id}`);

  // 5. Test updateCustomer including status
  const updatedCust = await customersService.updateCustomer(
    newCust.id,
    {
      name: 'عميل اختبار النظام المحدث',
      phone: testPhone,
      national_id: '12345678901234',
      status: 'محظور',
    },
    { role: 'admin', branch_id: 1 }
  );
  assert.strictEqual(updatedCust.name, 'عميل اختبار النظام المحدث');
  assert.strictEqual(updatedCust.status, 'محظور');
  console.log(`  ✅ [PASS] 5. updateCustomer successfully updated name and status to: ${updatedCust.status}`);

  // 6. Test getCustomerHistory
  const history = await customersService.getCustomerHistory(newCust.id, { role: 'admin' });
  assert(history && typeof history === 'object', 'History should be an object');
  assert(Array.isArray(history.orders), 'History should have orders array');
  assert(Array.isArray(history.rentals), 'History should have rentals array');
  assert(Array.isArray(history.alterations), 'History should have alterations array');
  console.log('  ✅ [PASS] 6. getCustomerHistory returned valid structure with orders, rentals, alterations');

  // 7. Test deleteCustomer
  const delRes = await customersService.deleteCustomer(newCust.id, { role: 'admin', branch_id: 1 });
  assert(delRes && delRes.success, 'deleteCustomer should return success');
  console.log('  ✅ [PASS] 7. deleteCustomer successfully cleaned up test customer');

  console.log('\n🎉 ALL 7 CUSTOMERS VERIFICATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
