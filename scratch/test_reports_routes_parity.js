/**
 * Elwazeer POS System — Reports Routes & Master Sheet Parity Test Suite
 * 
 * Verifies that all Master Sheet routes, aliases, extended report routes,
 * and export endpoints are properly mounted, authorized, and respond with
 * valid 200 HTTP status (never 404).
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const config = require('../src/server/config/env');
const app = require('../src/server/app');
const reportsRoutes = require('../src/server/modules/reports/reports.routes');

async function runReportsRouteTests() {
  console.log('================================================================');
  console.log('    ELWAZEER POS: REPORTS ROUTES & MASTER SHEET VERIFICATION    ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Generate valid test JWT token for admin
  const token = jwt.sign(
    { id: 1, username: 'admin', role: 'admin', branch_id: 1, permissions: ['*'] },
    config.JWT_SECRET || 'secret',
    { expiresIn: '1h' }
  );

  // 1. Static Route Definition & Aliases Verification
  console.log('--- 1. Router Stack Route Definitions & Aliases ---');
  const allRoutes = [];
  for (const layer of reportsRoutes.stack) {
    if (layer.route?.path) {
      if (Array.isArray(layer.route.path)) {
        allRoutes.push(...layer.route.path);
      } else {
        allRoutes.push(layer.route.path);
      }
    }
  }

  const expectedMasterRoutes = [
    '/reports/master-sheet',
    '/reports/monthly-master',
    '/reports/master',
    '/master-sheet',
    '/monthly-master',
    '/master',
  ];
  for (const r of expectedMasterRoutes) {
    test(`Master route alias '${r}' is registered in router`, () => {
      assert.ok(allRoutes.includes(r), `Route '${r}' should be registered`);
    });
  }

  const expectedExportRoutes = [
    '/reports/export/excel',
    '/export/excel',
    '/reports/export/consolidated-excel',
    '/reports/export/master-excel',
    '/export/consolidated-excel',
    '/export/master-excel',
    '/reports/export/pdf-html',
    '/export/pdf-html',
    '/reports/export/master-pdf',
    '/export/master-pdf',
    '/reports/export/consolidated-pdf',
    '/export/consolidated-pdf',
  ];
  for (const r of expectedExportRoutes) {
    test(`Export route alias '${r}' is registered in router`, () => {
      assert.ok(allRoutes.includes(r), `Route '${r}' should be registered`);
    });
  }

  // 2. HTTP Server End-to-End Route Matching
  console.log('\n--- 2. Live HTTP Route Matching Against Express App ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2.1 Unauthenticated requests return 401 (never 404)
    for (const r of expectedMasterRoutes) {
      await asyncTest(`Unauthenticated GET /api${r} returns 401 (not 404)`, async () => {
        const res = await fetch(`${baseUrl}/api${r}?month=2026-10`);
        assert.strictEqual(res.status, 401, `Expected 401 Unauthorized for /api${r}, got ${res.status}`);
      });
    }

    // 2.2 Authenticated requests return 200 OK (never 404)
    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const r of expectedMasterRoutes) {
      await asyncTest(`Authenticated GET /api${r} returns 200 OK with valid report structure`, async () => {
        const res = await fetch(`${baseUrl}/api${r}?month=${currentMonth}&branch_id=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        assert.strictEqual(res.status, 200, `Expected 200 OK for /api${r}, got ${res.status}`);
        const data = await res.json();
        assert.ok(data, 'Response data must exist');
        assert.strictEqual(data.month, currentMonth, 'Report month must match query month');
        assert.ok(Array.isArray(data.days), 'Report must contain days array');
        assert.ok(data.summary, 'Report must contain monthly summary object');
      });
    }

    // 2.3 Consolidated Excel Exports
    const excelExportRoutes = [
      '/reports/export/consolidated-excel',
      '/reports/export/master-excel',
      '/export/consolidated-excel',
      '/export/master-excel',
    ];
    for (const r of excelExportRoutes) {
      await asyncTest(`Authenticated GET /api${r} returns 200 with Excel content-type`, async () => {
        const res = await fetch(`${baseUrl}/api${r}?month=${currentMonth}&branch_id=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        assert.strictEqual(res.status, 200, `Expected 200 OK for /api${r}, got ${res.status}`);
        const contentType = res.headers.get('content-type');
        assert.ok(
          contentType.includes('spreadsheetml') || contentType.includes('octet-stream'),
          `Expected Excel content type, got ${contentType}`
        );
        const arrayBuf = await res.arrayBuffer();
        assert.ok(arrayBuf.byteLength > 1000, `Excel file size must be non-empty (>1000 bytes, got ${arrayBuf.byteLength})`);
      });
    }

    // 2.4 Master PDF Exports
    const pdfExportRoutes = [
      '/reports/export/pdf-html?type=master',
      '/reports/export/master-pdf',
      '/export/master-pdf',
      '/reports/export/consolidated-pdf',
      '/export/consolidated-pdf',
    ];
    for (const r of pdfExportRoutes) {
      await asyncTest(`Authenticated GET /api${r} returns 200 with HTML printable report`, async () => {
        const separator = r.includes('?') ? '&' : '?';
        const res = await fetch(`${baseUrl}/api${r}${separator}month=${currentMonth}&branch_id=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        assert.strictEqual(res.status, 200, `Expected 200 OK for /api${r}, got ${res.status}`);
        const text = await res.text();
        assert.ok(text.includes('<!DOCTYPE html>') || text.includes('<html'), 'PDF-HTML export must return HTML document');
        assert.ok(text.includes('MASTER SHEET'), 'PDF-HTML export must contain MASTER SHEET section');
      });
    }

    // 2.5 Extended Daily, OHDA, Salary Sheet, KPI routes with and without /reports prefix
    const extendedSubReports = [
      { path: '/reports/ohda', alt: '/ohda' },
      { path: '/reports/salary-sheet', alt: '/salary-sheet' },
      { path: '/reports/kpi', alt: '/kpi' },
      { path: '/reports/extended-daily', alt: '/extended-daily', query: `date=${currentMonth}-01` },
    ];
    for (const item of extendedSubReports) {
      const q = item.query ? `&${item.query}` : `&month=${currentMonth}`;
      await asyncTest(`GET /api${item.path} and /api${item.alt} both return 200 OK`, async () => {
        const res1 = await fetch(`${baseUrl}/api${item.path}?branch_id=1${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const res2 = await fetch(`${baseUrl}/api${item.alt}?branch_id=1${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.strictEqual(res1.status, 200, `${item.path} should return 200, got ${res1.status}`);
        assert.strictEqual(res2.status, 200, `${item.alt} should return 200, got ${res2.status}`);
      });
    }

    // 2.6 Edge Case: Invalid month query strings safely fall back to current Cairo month (never 500 crash)
    const invalidMonths = ['2026-13', '2026-00', '2026-99', 'invalid-month'];
    for (const badMonth of invalidMonths) {
      await asyncTest(`GET /api/reports/master-sheet?month=${badMonth} falls back gracefully and returns 200`, async () => {
        const res = await fetch(`${baseUrl}/api/reports/master-sheet?month=${badMonth}&branch_id=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.strictEqual(res.status, 200, `Expected 200 for month=${badMonth}, got ${res.status}`);
        const data = await res.json();
        assert.ok(data.month, 'Response must contain fallback month string');
        assert.strictEqual(data.month, currentMonth, `Expected fallback month ${currentMonth}, got ${data.month}`);
        assert.ok(Array.isArray(data.days), 'Response must contain days array');
      });
    }

    // 2.7 Branch User RBAC Scoping: Branch user cannot access branch_id=all
    const branchUserToken = jwt.sign(
      { id: 2, username: 'cashier1', role: 'cashier', branch_id: 1, permissions: ['Reports.html'] },
      config.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    await asyncTest('Branch user requesting branch_id=all is rejected with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/reports/master-sheet?branch_id=all&month=${currentMonth}`, {
        headers: { Authorization: `Bearer ${branchUserToken}` },
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    });

    await asyncTest('Branch user can successfully access own branch report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/master-sheet?month=${currentMonth}`, {
        headers: { Authorization: `Bearer ${branchUserToken}` },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK for own branch, got ${res.status}`);
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // 3. Frontend reportsService API Contract Verification
  console.log('\n--- 3. Frontend reportsService API Contract ---');
  const fs = require('fs');
  const reportsServiceSrc = fs.readFileSync('src/renderer/services/api/reports.service.js', 'utf8');

  test('reportsService defines getMonthlyMaster', () => {
    assert.ok(reportsServiceSrc.includes('getMonthlyMaster:'), 'getMonthlyMaster must exist');
    assert.ok(reportsServiceSrc.includes('/reports/master-sheet'), 'getMonthlyMaster must call /reports/master-sheet');
  });

  test('reportsService defines getMasterSheet alias', () => {
    assert.ok(reportsServiceSrc.includes('getMasterSheet:'), 'getMasterSheet alias must exist');
  });

  test('reportsService defines getMonthlyMasterReport alias', () => {
    assert.ok(reportsServiceSrc.includes('getMonthlyMasterReport:'), 'getMonthlyMasterReport alias must exist');
  });

  test('reportsService defines exportMasterPdf', () => {
    assert.ok(reportsServiceSrc.includes('exportMasterPdf:'), 'exportMasterPdf must exist');
    assert.ok(reportsServiceSrc.includes("type: 'master'"), 'exportMasterPdf must specify type: master');
  });

  test('reportsService defines exportConsolidatedExcel and exportMasterExcel', () => {
    assert.ok(reportsServiceSrc.includes('exportConsolidatedExcel:'), 'exportConsolidatedExcel must exist');
    assert.ok(reportsServiceSrc.includes('exportMasterExcel:'), 'exportMasterExcel must exist');
    assert.ok(reportsServiceSrc.includes('/reports/export/consolidated-excel'), 'Must call /reports/export/consolidated-excel');
  });

  console.log('\n================================================================');
  console.log(`REPORTS ROUTE AUDIT SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  runReportsRouteTests().catch((err) => {
    console.error('Fatal error running reports route tests:', err);
    process.exit(1);
  });
}

module.exports = runReportsRouteTests;
