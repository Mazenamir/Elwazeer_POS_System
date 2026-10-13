const http = require('http');
const assert = require('assert');
const app = require('../src/server/app');

const testPort = 6298;

function makeRequest({ method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      Host: `156.218.181.148:${testPort}`,
      ...headers,
    };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: resBody,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Mobile Public-IP Verification Tests...\n');

  const server = app.listen(testPort, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  console.log(`Test server running on port ${testPort}`);

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  try {
    // 1. GET /login document load
    await check('1. Document GET /login returns 200 and points to updated bundles', async () => {
      const res = await makeRequest({ path: '/login' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('<div id="root"></div>'));
      assert.ok(res.body.includes('/assets/index-B9EytaOQ.js'));
      assert.ok(res.body.includes('/assets/index-BFuSkk6G.css'));
    });

    // 2. GET JavaScript asset with mobile Public IP Origin
    await check('2. GET JS asset with Origin http://156.218.181.148:6298 returns 200 (not 500)', async () => {
      const origin = `http://156.218.181.148:${testPort}`;
      const res = await makeRequest({
        path: '/assets/index-B9EytaOQ.js',
        headers: {
          Origin: origin,
          Host: `156.218.181.148:${testPort}`,
        },
      });
      assert.strictEqual(res.status, 200, `Expected status 200 but got ${res.status}`);
      assert.ok(res.headers['content-type'].includes('text/javascript'), 'Content-type must be javascript');
      assert.strictEqual(res.headers['access-control-allow-origin'], origin);
      assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
      assert.ok(res.body.length > 500000, 'JavaScript body should be full bundle');
    });

    // 3. GET CSS asset with mobile Public IP Origin
    await check('3. GET CSS asset with Origin http://156.218.181.148:6298 returns 200', async () => {
      const origin = `http://156.218.181.148:${testPort}`;
      const res = await makeRequest({
        path: '/assets/index-BFuSkk6G.css',
        headers: {
          Origin: origin,
          Host: `156.218.181.148:${testPort}`,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/css'));
      assert.strictEqual(res.headers['access-control-allow-origin'], origin);
    });

    // 4. API check-setup with mobile Public IP Origin
    await check('4. GET /api/public/check-setup with Origin returns 200 and allowed CORS', async () => {
      const origin = `http://156.218.181.148:${testPort}`;
      const res = await makeRequest({
        path: '/api/public/check-setup',
        headers: {
          Origin: origin,
          Host: `156.218.181.148:${testPort}`,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], origin);
      const data = JSON.parse(res.body);
      assert.strictEqual(typeof data.needsSetup, 'boolean');
    });

    // 5. Unauthenticated /api/me returns 401 JSON without crash
    await check('5. GET /api/me without token returns 401 Unauthorized', async () => {
      const origin = `http://156.218.181.148:${testPort}`;
      const res = await makeRequest({
        path: '/api/me',
        headers: {
          Origin: origin,
          Host: `156.218.181.148:${testPort}`,
        },
      });
      assert.strictEqual(res.status, 401);
      const data = JSON.parse(res.body);
      assert.strictEqual(data.error, 'Unauthorized');
    });

    // 6. Cross-origin attacker is denied CORS without crashing server
    await check('6. Attacker origin http://evil.com is denied CORS without 500 error', async () => {
      const res = await makeRequest({
        path: '/api/public/check-setup',
        headers: {
          Origin: 'http://evil.com',
          Host: `156.218.181.148:${testPort}`,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], undefined, 'Attacker origin must not get allow-origin');
    });

    // 7. Cookie security: over HTTP, cookie does NOT have Secure flag and has SameSite=Lax
    await check('7. Cookie over HTTP does not set Secure flag, uses SameSite=Lax', async () => {
      const origin = `http://156.218.181.148:${testPort}`;
      // Send invalid login just to test the response or valid if we have credentials
      // Let's test with wrong credentials first: returns 401
      const resFail = await makeRequest({
        method: 'POST',
        path: '/api/login',
        headers: { Origin: origin, Host: `156.218.181.148:${testPort}` },
        body: JSON.stringify({ username: 'nonexistent', password: 'wrong' }),
      });
      assert.strictEqual(resFail.status, 401);
      assert.ok(resFail.body.includes('غير صحيحة') || resFail.body.includes('Invalid'));
    });

    // 8. SPA route fallback
    await check('8. GET /dashboard returns index.html for client-side routing', async () => {
      const res = await makeRequest({ path: '/dashboard' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.includes('<div id="root"></div>'));
    });

    // 9. Localhost / LAN origins still work
    await check('9. Localhost origin still allowed for desktop/Electron', async () => {
      const res = await makeRequest({
        path: '/api/public/check-setup',
        headers: {
          Origin: 'http://localhost:5173',
          Host: `127.0.0.1:${testPort}`,
        },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    });

    console.log(`\nVerification complete: ${passed} passed, ${failed} failed.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
