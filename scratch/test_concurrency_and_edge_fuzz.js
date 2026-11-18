/**
 * Concurrency Race-Condition, Idempotency & Edge-Case Fuzzing Suite
 * Tests real Express HTTP endpoints against PostgreSQL Master & SQLite Branch.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.APP_MODE = 'master';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-fuzz-jwt-secret';

const config = require('../src/server/config/env');
const db = require('../src/server/database/connection');
const app = require('../src/server/app');
const { getCairoDateTimeParts } = require('../src/shared/utils/date');

function startHttpServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function reqJson(baseUrl, method, urlPath, token, body = null, extraHeaders = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
    if (!headers['x-idempotency-key']) {
      headers['x-idempotency-key'] = `fuzz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
  }
  const res = await fetch(`${baseUrl}/api${urlPath}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

(async () => {
  console.log('=== CONCURRENCY, IDEMPOTENCY & EDGE-CASE FUZZ AUDIT ===');
  const { server, port } = await startHttpServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { date: todayDate } = getCairoDateTimeParts();
  const stamp = Date.now();
  const custPhone = `01066${String(stamp).slice(-6)}`;

  let empId = null;
  let invId = null;
  const orderIds = [];

  try {
    const adminUser = (await db.query("SELECT id, username, branch_id, token_version FROM users WHERE role = 'admin' LIMIT 1")).rows[0];
    const token = jwt.sign({
      id: adminUser.id,
      username: adminUser.username,
      role: 'admin',
      branch_id: adminUser.branch_id || 1,
      branch_scope: 'all',
      token_version: adminUser.token_version || 1,
      permissions: ['*'],
    }, config.JWT_SECRET, { expiresIn: '1h' });

    const empRes = await db.query(
      "INSERT INTO employees (name, position, branch_id, basic_salary, status, join_date) VALUES ($1, 'بائع', 1, 3000, 'active', CURRENT_DATE) RETURNING id",
      [`موظف تحمل ${stamp}`]
    );
    empId = empRes.rows[0].id;
    await db.query("INSERT INTO attendance (employee_id, date, check_in) VALUES ($1, $2, '09:00') ON CONFLICT DO NOTHING", [empId, todayDate]);

    // Product with ONLY 1 unit in branch 1
    const invRes = await db.query(
      "INSERT INTO inventory (name, category, color, price, cost_price, stock_level, gender, is_deleted) VALUES ($1, 'SUIT', 'أسود', 900, 400, 1, 'men', FALSE) RETURNING id",
      [`بدلة تحمل ${stamp}`]
    );
    invId = invRes.rows[0].id;
    await db.query('INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, 1, 1)', [invId]);
    await db.query("INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id) VALUES ($1, '48', 'أسود', 1, 1)", [invId]);

    // 1. Concurrency race: 5 simultaneous checkout requests for 1 unit
    const raceRequests = Array.from({ length: 5 }, (_, idx) =>
      reqJson(baseUrl, 'POST', '/orders', token, {
        customer_name: `عميل سباق ${idx}`,
        customer_phone: custPhone,
        branch_id: 1,
        seller_id: empId,
        payment_method: 'cash',
        paid_amount: 900,
        items: [{ id: invId, quantity: 1, price: 900, size: '48', color: 'أسود' }],
      })
    );
    const raceResults = await Promise.all(raceRequests);
    const successes = raceResults.filter((r) => r.ok);
    const failures = raceResults.filter((r) => !r.ok);
    successes.forEach((s) => orderIds.push(s.data.orderId || s.data.id));
    assert.strictEqual(successes.length, 1, `Expected strictly 1 winner in 5x concurrency race, got ${successes.length}`);
    assert.strictEqual(failures.length, 4, `Expected 4 rejections in 5x concurrency race, got ${failures.length}`);
    const branchStockAfter = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [invId])).rows[0].stock_level);
    assert.strictEqual(branchStockAfter, 0, 'Branch stock must never go negative under concurrency');
    console.log('✓ [1/5] 5x Concurrent last-unit checkout race prevented overselling (1 won, 4 rejected, stock=0)');

    // 2. Price anti-tampering + Idempotency key deduplication
    await db.query('UPDATE inventory SET stock_level = 2 WHERE id = $1', [invId]);
    await db.query('UPDATE inventory_branches SET stock_level = 2 WHERE inventory_id = $1 AND branch_id = 1', [invId]);
    await db.query('UPDATE inventory_sizes SET stock_level = 2 WHERE inventory_id = $1 AND branch_id = 1', [invId]);

    const sharedKey = `idem-${stamp}`;
    const tamperBody = {
      customer_name: 'عميل تسعير',
      customer_phone: custPhone,
      branch_id: 1,
      seller_id: empId,
      payment_method: 'cash',
      paid_amount: 1, // tampered paid amount / tampered price below
      items: [{ id: invId, quantity: 1, price: 1, size: '48', color: 'أسود' }],
    };
    const r1 = await reqJson(baseUrl, 'POST', '/orders', token, tamperBody, { 'x-idempotency-key': sharedKey });
    assert.ok(r1.ok, `First order with idempotency key should succeed (${r1.status})`);
    const tamperOrderId = r1.data.orderId || r1.data.id;
    orderIds.push(tamperOrderId);
    const dbOrd = (await db.query('SELECT total_amount FROM orders WHERE id = $1', [tamperOrderId])).rows[0];
    assert.strictEqual(Number(dbOrd.total_amount), 900, 'Server must ignore client-tampered price=1 and use DB price=900');

    const r2 = await reqJson(baseUrl, 'POST', '/orders', token, tamperBody, { 'x-idempotency-key': sharedKey });
    assert.ok(r2.status === 200 || r2.status === 201 || r2.status === 409, `Duplicate key replay handled safely (status=${r2.status})`);
    const stockAfterIdem = Number((await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = 1', [invId])).rows[0].stock_level);
    assert.strictEqual(stockAfterIdem, 1, 'Duplicate idempotency replay must NOT double-deduct stock');
    console.log('✓ [2/5] Anti-tampering price enforcement & x-idempotency-key replay protection verified');

    // 3. Edge fuzz: negative qty, non-cash change > 0, missing alteration description -> must return 400 (never 500!)
    const fuzzCases = [
      { method: 'POST', url: '/orders', body: { customer_name: 'A', customer_phone: '01000000000', branch_id: 1, seller_id: empId, payment_method: 'cash', paid_amount: 900, items: [{ id: invId, quantity: -2 }] } },
      { method: 'POST', url: '/orders', body: { customer_name: 'A', customer_phone: '01000000000', branch_id: 1, seller_id: empId, payment_method: 'card', paid_amount: 1200, items: [{ id: invId, quantity: 1 }] } },
      { method: 'POST', url: '/alterations', body: { order_id: tamperOrderId, branch_id: 1 } },
      { method: 'POST', url: '/expenses', body: { title: 'x', amount: -50, branch_id: 1 } },
      { method: 'POST', url: '/worn-products', body: { product_type: 'sales', product_id: invId, quantity: 0, branch_id: 1 } },
    ];
    for (const fc of fuzzCases) {
      const fr = await reqJson(baseUrl, fc.method, fc.url, token, fc.body);
      assert.ok(fr.status >= 400 && fr.status < 500, `Expected 4xx validation error for fuzz ${fc.url}, got ${fr.status}: ${JSON.stringify(fr.data)}`);
    }
    console.log('✓ [3/5] Edge fuzz validation cases return clean 4xx (zero 500 crashes)');

    // 4. Non-numeric / OFF-* order ID handling
    const offRes = await reqJson(baseUrl, 'GET', '/orders/OFF-nonexistent-id/details', token);
    assert.strictEqual(offRes.status, 404, `Expected 404 for unknown OFF- ID, got ${offRes.status}`);
    console.log('✓ [4/5] Non-numeric / OFF-* lookup cleanly returns 404 without PG integer cast 500');

    // 5. Unauthorized / malformed JWT rejection
    const badJwt = await reqJson(baseUrl, 'GET', '/orders', 'not-a-valid-jwt');
    assert.strictEqual(badJwt.status, 401);
    console.log('✓ [5/5] Invalid Bearer JWT strictly returns 401');
  } finally {
    try {
      if (orderIds.length) {
        await db.query('DELETE FROM order_payments WHERE order_id = ANY($1::int[])', [orderIds]);
        await db.query('DELETE FROM order_items WHERE order_id = ANY($1::int[])', [orderIds]);
        await db.query('DELETE FROM orders WHERE id = ANY($1::int[])', [orderIds]);
      }
      await db.query('DELETE FROM customers WHERE phone = $1', [custPhone]);
      if (invId) {
        await db.query('DELETE FROM inventory_sizes WHERE inventory_id = $1', [invId]);
        await db.query('DELETE FROM inventory_branches WHERE inventory_id = $1', [invId]);
        await db.query('DELETE FROM inventory WHERE id = $1', [invId]);
      }
      if (empId) {
        await db.query('DELETE FROM attendance WHERE employee_id = $1', [empId]);
        await db.query('DELETE FROM employees WHERE id = $1', [empId]);
      }
      await db.closePool();
    } catch {}
    server.close();
  }
  console.log('=== CONCURRENCY & EDGE-CASE FUZZ AUDIT PASSED 100% ===');
})();
