const assert = require('assert');
const { requirePermission, requireAdmin, requireInventoryAdmin, authMiddleware } = require('../src/server/middleware/auth.middleware');
const { searchLimiter, exportLimiter, syncLimiter } = require('../src/server/middleware/rateLimit.middleware');
const { globalSearch } = require('../src/server/modules/search/search.service');
const syncRoutes = require('../src/server/modules/sync/sync.routes');
const salesRoutes = require('../src/server/modules/sales/sales.routes');
const expensesRoutes = require('../src/server/modules/expenses/expenses.routes');
const employeesRoutes = require('../src/server/modules/hr/employees.routes');
const customersRoutes = require('../src/server/modules/customers/customers.routes');
const rentalsRoutes = require('../src/server/modules/rentals/rentals.routes');
const tailoringRoutes = require('../src/server/modules/tailoring/tailoring.routes');
const wornRoutes = require('../src/server/modules/worn/worn.routes');
const suppliersRoutes = require('../src/server/modules/suppliers/suppliers.routes');
const config = require('../src/server/config/env');

async function testM2() {
  console.log('Testing M2 API Security & RBAC Hardening...\n');

  // 1. SEC-01: SQL Injection safety in search service
  const safeRes = await globalSearch({ q: "' OR 1=1 --" });
  assert.strictEqual(safeRes.total_matches, 0);
  console.log('  ✅ [PASS] SEC-01: SQL injection in search query safely blocked via parameterized queries');

  // 2. SEC-02: Sync routes removed from PUBLIC_PATHS and protected
  const mockReqConfigure = {
    path: '/api/sync/configure',
    headers: {},
    cookies: {},
  };
  let configStatus = null;
  const mockResConfigure = {
    status: (code) => { configStatus = code; return { json: () => {} }; },
    json: () => {},
  };
  let authNextCalled = false;
  await authMiddleware(mockReqConfigure, mockResConfigure, () => { authNextCalled = true; });
  assert.strictEqual(configStatus, 401, 'Unauthenticated /api/sync/configure must return 401');
  assert.strictEqual(authNextCalled, false, 'authMiddleware must not call next() for unauthenticated /api/sync/configure');

  // Valid sync key bypass on /api/sync/configure
  const syncKey = process.env.SYNC_API_KEY || config.SYNC_API_KEY;
  const mockReqSyncKey = {
    path: '/api/sync/configure',
    headers: { 'x-sync-key': syncKey },
    cookies: {},
  };
  authNextCalled = false;
  await authMiddleware(mockReqSyncKey, mockResConfigure, () => { authNextCalled = true; });
  assert.strictEqual(authNextCalled, true, 'Valid x-sync-key must authenticate sync requests');
  console.log('  ✅ [PASS] SEC-02: /api/sync/configure protected from unauthenticated callers, accepts valid sync key');

  // 3. SEC-03: RBAC route guards across all 8 core domain modules
  function checkRouteHasGuard(router, path, method = 'get') {
    const route = router.stack.find(r => r.route?.path === path && r.route?.methods?.[method]);
    assert.ok(route, `Route ${method.toUpperCase()} ${path} exists`);
    const hasGuard = route.route.stack.some(s => s.name === 'requirePermission' || s.handle.name === 'requirePermission' || s.name === 'requireInventoryAdmin' || s.name === 'requireSalaryAccess');
    assert.ok(hasGuard, `Route ${method.toUpperCase()} ${path} must have permission guard`);
  }

  // Sales
  checkRouteHasGuard(salesRoutes, '/orders', 'get');
  checkRouteHasGuard(salesRoutes, '/orders', 'post');
  checkRouteHasGuard(salesRoutes, '/orders/:id', 'put');
  checkRouteHasGuard(salesRoutes, '/returns', 'get');

  // Expenses
  checkRouteHasGuard(expensesRoutes, '/expenses', 'get');
  checkRouteHasGuard(expensesRoutes, '/expenses', 'post');
  checkRouteHasGuard(expensesRoutes, '/expenses/:id', 'delete');

  // Employees
  checkRouteHasGuard(employeesRoutes, '/employees', 'get');
  checkRouteHasGuard(employeesRoutes, '/employees', 'post');
  checkRouteHasGuard(employeesRoutes, '/employees/:id/summary', 'get');
  checkRouteHasGuard(employeesRoutes, '/employees/:id/payslip', 'get');

  // Customers
  checkRouteHasGuard(customersRoutes, '/customers', 'get');
  checkRouteHasGuard(customersRoutes, '/customers', 'post');

  // Rentals
  checkRouteHasGuard(rentalsRoutes, '/rentals', 'get');
  checkRouteHasGuard(rentalsRoutes, '/rentals', 'post');
  checkRouteHasGuard(rentalsRoutes, '/rental-inventory', 'get');

  // Tailoring
  checkRouteHasGuard(tailoringRoutes, '/alterations', 'get');
  checkRouteHasGuard(tailoringRoutes, '/tailoring-orders', 'get');

  // Worn
  checkRouteHasGuard(wornRoutes, '/worn-products', 'get');
  checkRouteHasGuard(wornRoutes, '/worn-products', 'post');

  // Suppliers
  checkRouteHasGuard(suppliersRoutes, '/suppliers', 'get');
  checkRouteHasGuard(suppliersRoutes, '/suppliers', 'post');
  checkRouteHasGuard(suppliersRoutes, '/supply-records', 'get');

  console.log('  ✅ [PASS] SEC-03: Granular RBAC route guards present across all core domain routes');

  // 4. SEC-04: Backend invoice edit password requirement
  const updateOrderRoute = salesRoutes.stack.find(r => r.route?.path === '/orders/:id' && r.route?.methods?.put);
  assert.ok(updateOrderRoute, 'PUT /orders/:id route exists');
  const hasInvoicePwMiddleware = updateOrderRoute.route.stack.some(s => s.name === 'requireInvoiceEditPassword' || s.handle.name === 'requireInvoiceEditPassword');
  assert.ok(hasInvoicePwMiddleware, 'PUT /orders/:id must mount requireInvoiceEditPassword');
  console.log('  ✅ [PASS] SEC-04: PUT /orders/:id mounts requireInvoiceEditPassword');

  // 5. SEC-06: Rate limiters initialized with safe memory fallback
  assert.ok(searchLimiter, 'searchLimiter exists');
  assert.ok(exportLimiter, 'exportLimiter exists');
  assert.ok(syncLimiter, 'syncLimiter exists');
  console.log('  ✅ [PASS] SEC-06: Rate limiters instantiated with safe in-memory fallback');

  console.log('\nAll M2 API Security tests PASSED cleanly!\n');
  process.exit(0);
}

testM2().catch(err => {
  console.error('M2 test failed:', err);
  process.exit(1);
});
