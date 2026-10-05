const http = require('http');
const app = require('../src/server/app');

const testPort = 6299;
const server = app.listen(testPort, '127.0.0.1', async () => {
  console.log(`Test server running on port ${testPort}`);

  function fetchUrl(path) {
    return new Promise((resolve) => {
      http.get(`http://127.0.0.1:${testPort}${path}`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      });
    });
  }

  let failures = 0;

  async function check(desc, path, expectedStatus, expectedContent = null, expectedLocation = null) {
    const res = await fetchUrl(path);
    let ok = res.status === expectedStatus;
    if (expectedContent && !res.body.includes(expectedContent)) ok = false;
    if (expectedLocation && res.headers.location !== expectedLocation) ok = false;

    if (ok) {
      console.log(`✅ [PASS] ${desc} (${path}) -> Status: ${res.status}${expectedLocation ? ` -> ${res.headers.location}` : ''}`);
    } else {
      failures++;
      console.error(`❌ [FAIL] ${desc} (${path}) -> Got: ${res.status}, Location: ${res.headers.location}, Body preview: ${res.body.substring(0, 100)}`);
    }
  }

  try {
    await check('Root serves React SPA', '/', 200, '<div id="root"></div>');
    await check('SPA Route /dashboard fallback', '/dashboard', 200, '<div id="root"></div>');
    await check('SPA Route /pos fallback', '/pos', 200, '<div id="root"></div>');
    await check('SPA Route /login fallback', '/login', 200, '<div id="root"></div>');
    await check('SPA Route /setup fallback', '/setup', 200, '<div id="root"></div>');
    await check('Legacy /Dashboard.html redirects to /dashboard', '/Dashboard.html', 302, null, '/dashboard');
    await check('Legacy /login.html redirects to /login', '/login.html', 302, null, '/login');
    await check('Legacy /setup.html redirects to /setup', '/setup.html', 302, null, '/setup');
    await check('Legacy /index.html redirects to /pos', '/index.html', 302, null, '/pos');
    await check('Logout redirects to /login', '/logout', 302, null, '/login');
  } catch (err) {
    console.error('Test error:', err);
    failures++;
  } finally {
    server.close(() => {
      console.log(`\nServing verification completed. Total failures: ${failures}`);
      process.exit(failures > 0 ? 1 : 0);
    });
  }
});
