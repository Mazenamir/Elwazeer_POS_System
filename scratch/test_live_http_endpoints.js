const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/server/app');
const config = require('../src/server/config/env');
const db = require('../src/server/database/connection');

// Generate valid admin token for أحمد (admin user id 1, branch 1)
const adminToken = jwt.sign(
  {
    id: 1,
    username: 'احمد',
    role: 'admin',
    branch_id: 1,
    permissions: [
      'Dashboard.html', 'index.html', 'Rentals.html', 'Barcodes.html',
      'Customers.html', 'Suppliers.html', 'RentalInventory.html',
      'WornProducts.html', 'Employees.html', 'Expenses.html',
      'Reports.html', 'Settings.html', 'Alterations.html', 'Tailoring.html'
    ]
  },
  config.JWT_SECRET,
  { expiresIn: '2h' }
);

function request(serverPort, options, postData = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const reqOptions = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json, text/html, */*',
        ...(options.headers || {}),
      },
    };

    if (postData) {
      const dataStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          duration,
          body,
          json,
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runLiveEndpointTests() {
  console.log('🚀 Launching In-Process Live HTTP Server & Smoke Test Suite...\n');

  // Use test port 6254 to avoid interfering with any potential background listeners
  const TEST_PORT = 6254;
  let server;

  await new Promise((resolve, reject) => {
    server = app.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`📡 In-process test server listening on http://127.0.0.1:${TEST_PORT}\n`);
      resolve();
    });
    server.on('error', reject);
  });

  const authHeader = { 'Authorization': `Bearer ${adminToken}` };
  let passed = 0;
  let failed = 0;

  async function check(name, testFn) {
    try {
      await testFn();
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Static and Public Endpoints
  console.log('--- 1. Static and Public Endpoints ---');
  await check('GET /api/public/settings (no auth)', async () => {
    const res = await request(TEST_PORT, { path: '/api/public/settings' });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.json || typeof res.json.store_name === 'undefined') throw new Error('store_name missing');
    if (res.json.db_password || res.json.jwt_secret) throw new Error('Sensitive credentials leaked');
    console.log(`  ✅ GET /api/public/settings -> 200 OK (${res.duration}ms, store: "${res.json.store_name}")`);
  });

  await check('GET /api/server-time', async () => {
    const res = await request(TEST_PORT, { path: '/api/server-time' });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.json || !res.json.timezone) throw new Error('Timezone missing');
    console.log(`  ✅ GET /api/server-time -> 200 OK (${res.duration}ms, tz: ${res.json.timezone})`);
  });

  await check('GET / (serves SPA index.html or renderer)', async () => {
    const res = await request(TEST_PORT, { path: '/' });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.body.includes('html') && !res.body.includes('Bebyoon')) throw new Error('HTML response invalid');
    console.log(`  ✅ GET / -> 200 OK (${res.duration}ms, ${res.body.length} bytes)`);
  });

  await check('GET /login.html', async () => {
    const res = await request(TEST_PORT, { path: '/login.html' });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /login.html -> 200 OK (${res.duration}ms)`);
  });

  await check('GET /assets/index-DKOfMkHJ.js (bundled Vite assets)', async () => {
    const res = await request(TEST_PORT, { path: '/assets/index-DKOfMkHJ.js' });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /assets/index-DKOfMkHJ.js -> 200 OK (${res.duration}ms, ${res.body.length} bytes)`);
  });

  // 2. Authenticated Endpoints
  console.log('\n--- 2. Authenticated API Endpoints ---');
  await check('GET /api/me (current user profile)', async () => {
    const res = await request(TEST_PORT, { path: '/api/me', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (res.json.user.username !== 'احمد' || res.json.user.role !== 'admin') throw new Error('User data mismatch');
    console.log(`  ✅ GET /api/me -> 200 OK (${res.duration}ms, user: ${res.json.user.username}, role: ${res.json.user.role})`);
  });

  await check('GET /api/branches (branch listings)', async () => {
    const res = await request(TEST_PORT, { path: '/api/branches', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    const list = Array.isArray(res.json) ? res.json : res.json.data;
    if (!list || list.length === 0) throw new Error('No branches returned');
    console.log(`  ✅ GET /api/branches -> 200 OK (${res.duration}ms, ${list.length} branches)`);
  });

  await check('GET /api/inventory?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/inventory?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.json.data || !Array.isArray(res.json.data)) throw new Error('Data array missing');
    console.log(`  ✅ GET /api/inventory -> 200 OK (${res.duration}ms, returned ${res.json.data.length} items, total: ${res.json.pagination?.total})`);
  });

  await check('GET /api/customers?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/customers?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    const items = res.json.customers || res.json.data;
    if (!items || !Array.isArray(items)) throw new Error('Customers array missing');
    console.log(`  ✅ GET /api/customers -> 200 OK (${res.duration}ms, returned ${items.length} customers, total: ${res.json.pagination?.total})`);
  });

  await check('GET /api/orders?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/orders?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.json.data || !Array.isArray(res.json.data)) throw new Error('Orders array missing');
    console.log(`  ✅ GET /api/orders -> 200 OK (${res.duration}ms, returned ${res.json.data.length} orders, total: ${res.json.pagination?.total})`);
  });

  await check('GET /api/rentals?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/rentals?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.json.data || !Array.isArray(res.json.data)) throw new Error('Rentals array missing');
    console.log(`  ✅ GET /api/rentals -> 200 OK (${res.duration}ms, returned ${res.json.data.length} rentals, total: ${res.json.pagination?.total})`);
  });

  await check('GET /api/tailoring-orders?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/tailoring-orders?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    if (!res.json.data || !Array.isArray(res.json.data)) throw new Error('Tailoring data array missing');
    console.log(`  ✅ GET /api/tailoring-orders -> 200 OK (${res.duration}ms, returned ${res.json.data.length} tailoring orders)`);
  });

  await check('GET /api/employees?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/employees?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    const data = res.json.data || res.json;
    console.log(`  ✅ GET /api/employees -> 200 OK (${res.duration}ms, returned ${Array.isArray(data) ? data.length : data?.data?.length || 0} employees)`);
  });

  await check('GET /api/expenses?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/expenses?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /api/expenses -> 200 OK (${res.duration}ms, total expenses: ${res.json.pagination?.total || res.json.data?.length || 0})`);
  });

  await check('GET /api/dashboard', async () => {
    const res = await request(TEST_PORT, { path: '/api/dashboard', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /api/dashboard -> 200 OK (${res.duration}ms, totalSales: ${res.json.totalSales})`);
  });

  await check('GET /api/reports/daily', async () => {
    const res = await request(TEST_PORT, { path: '/api/reports/daily', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /api/reports/daily -> 200 OK (${res.duration}ms)`);
  });

  await check('GET /api/sync/status', async () => {
    const res = await request(TEST_PORT, { path: '/api/sync/status', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /api/sync/status -> 200 OK (${res.duration}ms, configured: ${res.json.configured}, pending: ${res.json.pending})`);
  });

  await check('GET /api/worn-products?page=1&limit=10', async () => {
    const res = await request(TEST_PORT, { path: '/api/worn-products?page=1&limit=10', headers: authHeader });
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
    console.log(`  ✅ GET /api/worn-products -> 200 OK (${res.duration}ms, count: ${res.json.data?.length || 0})`);
  });

  // 3. Complete E2E Sales Transaction via HTTP
  console.log('\n--- 3. Full E2E Sales, Payment & Return Lifecycle via HTTP ---');
  let testOrderId = null;
  let testItemId = null;

  await check('POST /api/orders (create sale with partial payment & discount)', async () => {
    // Find an inventory item with sufficient stock in branch 1
    const { rows } = await db.query(`
      SELECT i.id, i.price, ib.stock_level
      FROM inventory i
      JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = 1
      WHERE ib.stock_level >= 5 AND i.price > 0
      LIMIT 1
    `);
    if (!rows.length) throw new Error('No inventory item found in branch 1');
    testItemId = rows[0].id;
    const itemPrice = Number(rows[0].price);

    const orderPayload = {
      branch_id: 1,
      seller_id: 24,
      customer_id: null,
      customer_name: 'عميل تجريبي HTTP',
      customer_phone: '01099998888',
      discount_amount: 10,
      paid_amount: 50,
      payment_method: 'cash',
      items: [
        { inventory_id: testItemId, quantity: 2, price: itemPrice }
      ]
    };

    const res = await request(TEST_PORT, {
      path: '/api/orders',
      method: 'POST',
      headers: authHeader,
    }, orderPayload);

    if (res.statusCode !== 201 && res.statusCode !== 200) {
      throw new Error(`Order creation failed with status ${res.statusCode}: ${res.body}`);
    }

    testOrderId = res.json.id || res.json.order?.id;
    console.log(`  ✅ POST /api/orders -> Success! Order ID: ${testOrderId}, total: ${res.json.total_amount || res.json.order?.total_amount}`);
  });

  await check('POST /api/orders/:id/pay-remaining (complete remaining balance)', async () => {
    if (!testOrderId) throw new Error('Missing testOrderId');
    const res = await request(TEST_PORT, {
      path: `/api/orders/${testOrderId}/pay-remaining`,
      method: 'POST',
      headers: authHeader,
    }, { amount: 1000, payment_method: 'cash' }); // Send sufficient to settle

    if (res.statusCode !== 200) {
      throw new Error(`pay-remaining failed with status ${res.statusCode}: ${res.body}`);
    }
    console.log(`  ✅ POST /api/orders/${testOrderId}/pay-remaining -> Settled successfully`);
  });

  await check('POST /api/returns (return purchased item & restore stock)', async () => {
    if (!testOrderId || !testItemId) throw new Error('Missing order/item');
    const returnPayload = {
      order_id: testOrderId,
      branch_id: 1,
      reason: 'تجربة الإرجاع الآلي عبر HTTP',
      items: [
        { inventory_id: testItemId, quantity: 1 }
      ]
    };

    const res = await request(TEST_PORT, {
      path: '/api/returns',
      method: 'POST',
      headers: authHeader,
    }, returnPayload);

    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`return failed with status ${res.statusCode}: ${res.body}`);
    }
    console.log(`  ✅ POST /api/returns -> Return processed. Refund: ${res.json.total_refund_amount || res.json.refund_amount || 'OK'}`);
  });

  // 4. Tailoring Order Lifecycle via HTTP
  console.log('\n--- 4. Full Tailoring Order Lifecycle via HTTP ---');
  let testTailorId = null;
  await check('POST /api/tailoring-orders (create tailoring order)', async () => {
    const tailorPayload = {
      branch_id: 1,
      seller_id: 24,
      customer_name: 'عميل تفصيل HTTP',
      customer_phone: '01122334455',
      product_description: 'بدلة رجالي كحلي تفصيل خاص',
      measurements: 'طول 100، صدر 95، خصر 80',
      paid_amount: 150,
      remaining_amount: 100,
      payment_method: 'cash'
    };

    const res = await request(TEST_PORT, {
      path: '/api/tailoring-orders',
      method: 'POST',
      headers: authHeader,
    }, tailorPayload);

    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`Tailoring create failed with ${res.statusCode}: ${res.body}`);
    }
    testTailorId = res.json.id || res.json.order?.id;
    console.log(`  ✅ POST /api/tailoring-orders -> Success! Tailor Order #${testTailorId}`);
  });

  await check('PUT /api/tailoring-orders/:id/pay-remaining (tailoring balance pay)', async () => {
    if (!testTailorId) throw new Error('Missing testTailorId');
    const res = await request(TEST_PORT, {
      path: `/api/tailoring-orders/${testTailorId}/pay-remaining`,
      method: 'PUT',
      headers: authHeader,
    }, { amount: 100, payment_method: 'cash' });

    if (res.statusCode !== 200) {
      throw new Error(`Tailoring pay failed with ${res.statusCode}: ${res.body}`);
    }
    console.log(`  ✅ PUT /api/tailoring-orders/${testTailorId}/pay-remaining -> Settled`);
  });

  // 5. Rentals Lifecycle via HTTP
  console.log('\n--- 5. Full Rentals Lifecycle via HTTP ---');
  let testRentalId = null;
  await check('POST /api/rentals (book a rental suit)', async () => {
    // Find rental inventory item
    const { rows: rentItems } = await db.query(`
      SELECT ri.id
      FROM rental_inventory ri
      JOIN rental_inventory_branches rib ON rib.rental_inventory_id = ri.id AND rib.branch_id = 1
      WHERE rib.stock_level >= 2
      LIMIT 1
    `);
    if (!rentItems.length) throw new Error('No rental inventory item available in branch 1');
    const rentalInvId = rentItems[0].id;

    const rentalPayload = {
      customer_name: 'عميل حجز HTTP',
      customer_phone: '01233445566',
      branch_id: 1,
      rental_inventory_id: rentalInvId,
      pickup_date: '2026-10-05',
      return_date: '2026-10-07',
      total_price: 250,
      deposit: 100,
      remaining: 150,
      seller_id: 24,
      payment_method: 'cash'
    };

    const res = await request(TEST_PORT, {
      path: '/api/rentals',
      method: 'POST',
      headers: authHeader,
    }, rentalPayload);

    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`Rental create failed with ${res.statusCode}: ${res.body}`);
    }
    testRentalId = res.json.id || res.json.rental?.id || (Array.isArray(res.json) && res.json[0]?.id);
    console.log(`  ✅ POST /api/rentals -> Success! Rental #${testRentalId}`);
  });

  await check('PUT /api/rentals/:id/pickup (pickup rental suit)', async () => {
    if (!testRentalId) throw new Error('Missing testRentalId');
    const res = await request(TEST_PORT, {
      path: `/api/rentals/${testRentalId}/pickup`,
      method: 'PUT',
      headers: authHeader,
    }, {});

    if (res.statusCode !== 200) {
      throw new Error(`Rental pickup failed with ${res.statusCode}: ${res.body}`);
    }
    console.log(`  ✅ PUT /api/rentals/${testRentalId}/pickup -> Picked up successfully`);
  });

  await check('PUT /api/rentals/:id/return (return rental suit)', async () => {
    if (!testRentalId) throw new Error('Missing testRentalId');
    const res = await request(TEST_PORT, {
      path: `/api/rentals/${testRentalId}/return`,
      method: 'PUT',
      headers: authHeader,
    }, { damage_fine: 0, deposit_action: 'refund' });

    if (res.statusCode !== 200) {
      throw new Error(`Rental return failed with ${res.statusCode}: ${res.body}`);
    }
    console.log(`  ✅ PUT /api/rentals/${testRentalId}/return -> Returned successfully`);
  });

  // 6. Worn Product Reporting via HTTP
  console.log('\n--- 6. Worn Product Report via HTTP ---');
  let testWornId = null;
  await check('POST /api/worn-products (report damaged inventory)', async () => {
    const wornPayload = {
      product_type: 'sales',
      product_id: testItemId,
      branch_id: 1,
      quantity: 1,
      condition: 'تالف بالكامل',
      reason: 'عيوب تصنيع - اختبار آلي',
      estimated_loss: 50,
      deduct_stock: true
    };

    const res = await request(TEST_PORT, {
      path: '/api/worn-products',
      method: 'POST',
      headers: authHeader,
    }, wornPayload);

    if (res.statusCode !== 200 && res.statusCode !== 201) {
      throw new Error(`Worn product failed with ${res.statusCode}: ${res.body}`);
    }
    testWornId = res.json.id;
    console.log(`  ✅ POST /api/worn-products -> Recorded worn item #${testWornId}`);
  });

  // 7. Cleanup All Test Artifacts
  console.log('\n--- 7. Cleaning Up Test Artifacts ---');
  if (testOrderId) {
    try {
      await db.query('DELETE FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE order_id = $1)', [testOrderId]);
      await db.query('DELETE FROM returns WHERE order_id = $1', [testOrderId]);
      await db.query('DELETE FROM order_items WHERE order_id = $1', [testOrderId]);
      await db.query('DELETE FROM orders WHERE id = $1', [testOrderId]);
      console.log(`  ✅ Cleaned up temporary test order #${testOrderId}`);
    } catch (e) {
      console.warn(`  ⚠️ Order cleanup: ${e.message}`);
    }
  }

  if (testTailorId) {
    try {
      await db.query('DELETE FROM tailoring_orders WHERE id = $1', [testTailorId]);
      console.log(`  ✅ Cleaned up temporary tailoring order #${testTailorId}`);
    } catch (e) {
      console.warn(`  ⚠️ Tailoring cleanup: ${e.message}`);
    }
  }

  if (testRentalId) {
    try {
      await db.query('DELETE FROM rentals WHERE id = $1', [testRentalId]);
      console.log(`  ✅ Cleaned up temporary rental #${testRentalId}`);
    } catch (e) {
      console.warn(`  ⚠️ Rental cleanup: ${e.message}`);
    }
  }

  if (testWornId) {
    try {
      await db.query('DELETE FROM worn_products WHERE id = $1', [testWornId]);
      // restore the 1 item stock
      await db.query('UPDATE inventory SET stock_level = stock_level + 1 WHERE id = $1', [testItemId]);
      await db.query('UPDATE inventory_branches SET stock_level = stock_level + 1 WHERE inventory_id = $1 AND branch_id = 1', [testItemId]);
      console.log(`  ✅ Cleaned up temporary worn product #${testWornId}`);
    } catch (e) {
      console.warn(`  ⚠️ Worn product cleanup: ${e.message}`);
    }
  }

  // Close server and database pool
  await new Promise((resolve) => server.close(resolve));
  await db.close();

  console.log(`\n======================================================`);
  console.log(`🏁 Live HTTP Smoke & Integration Results: ${passed} passed, ${failed} failed.`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runLiveEndpointTests().catch((err) => {
  console.error('Fatal in live endpoint tests:', err);
  process.exit(1);
});
