/**
 * Elwazeer POS System — RBAC, Multi-Branch Scoping & Sensitive Operations Comprehensive Verification Suite
 * Phase 10 Verification for MASTER (PostgreSQL) and BRANCH (SQLite) Parity
 */

const assert = require('assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const config = require('../src/server/config/env');
const db = require('../src/server/database/connection');
const app = require('../src/server/app');
const authService = require('../src/server/modules/auth/auth.service');
const sensitiveService = require('../src/server/modules/auth/sensitivePassword.service');
const salesService = require('../src/server/modules/sales/sales.service');
const inventoryService = require('../src/server/modules/inventory/inventory.service');
const rentalsService = require('../src/server/modules/rentals/rentals.service');
const expensesService = require('../src/server/modules/expenses/expenses.service');
const auditService = require('../src/server/modules/audit/audit.service');
const { hasPermission, getUserPermissions } = require('../src/shared/constants/permissions');
const { hasBranchAccess, validateBranchAccess, getUserAuthorizedBranchIds, isBranchRentalsEnabled } = require('../src/server/middleware/branchScope.middleware');

async function runTestSuite() {
  console.log('================================================================================');
  console.log('  ELWAZEER POS: COMPLETE RBAC, BRANCH SCOPE & SENSITIVE OPERATIONS SUITE        ');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Setup Live HTTP Server for Route & Middleware Integration Tests
  const server = http.createServer(app);
  const activeSockets = new Set();
  server.on('connection', (sock) => {
    activeSockets.add(sock);
    sock.once('close', () => activeSockets.delete(sock));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function makeToken(payload) {
    return jwt.sign(payload, config.JWT_SECRET || 'secret', { expiresIn: '2h' });
  }

  try {
    // --------------------------------------------------------------------------
    // PART A: BRANCH SCOPE TESTS
    // --------------------------------------------------------------------------
    console.log('\n--- PART A: Multi-Branch Access Control & Scoping ---');

    await test('A1: User with all-branch access (scope=all) has access to all branches', async () => {
      const allUser = { id: 101, username: 'all_user', role: 'branch_user', branch_scope: 'all', branch_id: 1, branch_ids: [] };
      assert.strictEqual(hasBranchAccess(allUser, 1), true);
      assert.strictEqual(hasBranchAccess(allUser, 2), true);
      assert.strictEqual(hasBranchAccess(allUser, 99), true);
      assert.strictEqual(getUserAuthorizedBranchIds(allUser), null); // null represents all branches allowed
    });

    await test('A2: User with single branch (scope=single) is restricted to primary branch only', async () => {
      const singleUser = { id: 102, username: 'single_user', role: 'branch_user', branch_scope: 'single', branch_id: 1, branch_ids: [] };
      assert.strictEqual(hasBranchAccess(singleUser, 1), true);
      assert.strictEqual(hasBranchAccess(singleUser, 2), false);
      assert.strictEqual(hasBranchAccess(singleUser, 'all'), false);
      const authIds = getUserAuthorizedBranchIds(singleUser);
      assert.deepStrictEqual(authIds, [1]);
    });

    await test('A3: User with selected branches (scope=selected) is allowed only on explicitly selected branches', async () => {
      const selectedUser = { id: 103, username: 'sel_user', role: 'branch_user', branch_scope: 'selected', branch_id: 1, branch_ids: [1, 2] };
      assert.strictEqual(hasBranchAccess(selectedUser, 1), true);
      assert.strictEqual(hasBranchAccess(selectedUser, 2), true);
      assert.strictEqual(hasBranchAccess(selectedUser, 3), false);
      assert.strictEqual(hasBranchAccess(selectedUser, 'all'), false);
      const authIds = getUserAuthorizedBranchIds(selectedUser);
      assert.ok(authIds.includes(1) && authIds.includes(2) && !authIds.includes(3));
    });

    await test('A4: Cross-branch query parameter tampering is rejected with 403 Forbidden', async () => {
      // User restricted to branch 1 requests /api/orders?branch_id=2
      const token = makeToken({ id: 901, username: 'b1_user', role: 'branch_user', branch_id: 1, branch_scope: 'single', permissions: ['pos.invoices.view', 'index.html'] });
      const res = await fetch(`${baseUrl}/api/orders?branch_id=2`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for cross-branch query tampering, got ${res.status}`);
    });

    await test('A5: Cross-branch mutation attempt is rejected with 403 Forbidden', async () => {
      // User restricted to branch 1 attempts to create order in branch 2
      const token = makeToken({ id: 902, username: 'b1_user', role: 'branch_user', branch_id: 1, branch_scope: 'single', permissions: ['pos.sales.create', 'index.html'] });
      const res = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_name: 'Test Customer',
          customer_phone: '01000000000',
          branch_id: 2, // Tampered branch
          items: [{ name: 'Item', price: 100, quantity: 1 }],
        }),
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for cross-branch order creation, got ${res.status}`);
    });

    await test('A6: Cross-branch record ID access throws 403 Forbidden', async () => {
      // Test validateBranchAccess directly
      const user = { id: 903, role: 'branch_user', branch_id: 1, branch_scope: 'single' };
      assert.throws(
        () => validateBranchAccess(user, 2),
        (err) => err.statusCode === 403,
        'Accessing record of branch 2 by branch 1 user must throw 403'
      );
    });

    await test('A7: Primary branch is properly preserved and enforced when user has scope=single', async () => {
      const user = { id: 904, role: 'branch_user', branch_id: 3, branch_scope: 'single' };
      assert.strictEqual(hasBranchAccess(user, 3), true);
      assert.strictEqual(hasBranchAccess(user, 1), false);
    });

    // --------------------------------------------------------------------------
    // PART B: GRANULAR PERMISSIONS & TAB / MODULE ACCESS
    // --------------------------------------------------------------------------
    console.log('\n--- PART B: Granular Module, Tab & Action Permissions ---');

    await test('B1: User allowed into POS can query next-order-id and view invoices', async () => {
      const token = makeToken({
        id: 910,
        username: 'pos_cashier',
        role: 'branch_user',
        branch_id: 1,
        branch_scope: 'single',
        permissions: ['pos.access', 'pos.sales.view', 'pos.invoices.view', 'index.html'],
      });
      const res = await fetch(`${baseUrl}/api/next-order-id?branch_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    });

    await test('B2: User denied POS permissions is rejected with 403 on POS routes', async () => {
      const token = makeToken({
        id: 911,
        username: 'no_pos_user',
        role: 'branch_user',
        branch_id: 1,
        branch_scope: 'single',
        permissions: ['reports.access', 'Reports.html'], // No POS permissions
      });
      const res = await fetch(`${baseUrl}/api/next-order-id?branch_id=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for unauthorized user on POS route, got ${res.status}`);
    });

    await test('B3: Cashier can view invoices but is denied invoice editing without pos.invoices.edit', async () => {
      const cashierUser = {
        id: 912,
        role: 'branch_user',
        permissions: ['pos.invoices.view', 'pos.sales.create', 'index.html'],
      };
      assert.strictEqual(hasPermission(cashierUser, 'pos.invoices.view'), true);
      assert.strictEqual(hasPermission(cashierUser, 'pos.invoices.edit'), false);

      // Verify that sensitive invoice edit verification rejects this user with 403
      const token = makeToken({
        ...cashierUser,
        username: 'cashier_no_edit',
        branch_id: 1,
      });
      const res = await fetch(`${baseUrl}/api/verify-invoice-edit-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'any_password', order_id: 10 }),
      });
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for invoice edit verification without permission, got ${res.status}`);
    });

    await test('B4: User granted inventory creation is denied product deletion without inventory.products.delete', async () => {
      const invCreator = {
        id: 913,
        role: 'branch_user',
        permissions: ['inventory.access', 'inventory.products.create'],
      };
      assert.strictEqual(hasPermission(invCreator, 'inventory.products.create'), true);
      assert.strictEqual(hasPermission(invCreator, 'inventory.products.delete'), false);

      // Verify service layer enforces this restriction
      await assert.rejects(
        async () => {
          await inventoryService.deleteProduct(99999, invCreator);
        },
        (err) => err.statusCode === 403,
        'deleteProduct must reject user without inventory.products.delete permission'
      );
    });

    await test('B5: Branch with rentals_enabled=false rejects rental actions', async () => {
      const { requireBranchRentalsEnabled } = require('../src/server/middleware/branchScope.middleware');
      // Create mock branch or test function with branchId having rentals disabled
      let disabledBranchId = null;
      if (config.IS_BRANCH_MODE) {
        db.sqlite.prepare('INSERT OR REPLACE INTO branches (id, name, rentals_enabled) VALUES (998, \'No Rentals Branch\', 0)').run();
        disabledBranchId = 998;
      } else {
        await db.query(`
          INSERT INTO branches (id, name, rentals_enabled) VALUES (998, 'No Rentals Branch', FALSE)
          ON CONFLICT (id) DO UPDATE SET rentals_enabled = FALSE
        `);
        disabledBranchId = 998;
      }

      const enabled = await isBranchRentalsEnabled(disabledBranchId);
      assert.strictEqual(enabled, false, 'Branch 998 should have rentals disabled');

      await assert.rejects(
        async () => {
          await requireBranchRentalsEnabled(disabledBranchId);
        },
        (err) => err.statusCode === 400 && err.message.includes('معطل'),
        'requireBranchRentalsEnabled must throw 400 when rentals are disabled'
      );
    });

    // --------------------------------------------------------------------------
    // PART C: ADMIN-CONTROLLED SENSITIVE OPERATION PASSWORDS
    // --------------------------------------------------------------------------
    console.log('\n--- PART C: Admin-Controlled Sensitive Operation Passwords ---');

    await test('C1: Set sensitive operation password (as Admin) hashes with bcrypt and eliminates plaintext', async () => {
      const admin = { id: 1, username: 'admin', role: 'admin' };
      sensitiveService.resetLockoutForTesting('profit');
      sensitiveService.resetLockoutForTesting('invoice_edit');
      sensitiveService.resetLockoutForTesting('return');
      sensitiveService.resetLockoutForTesting('inventory');

      const res = await sensitiveService.updateSensitivePassword('return', {
        password: 'SecureReturnPassword123!',
        confirm_password: 'SecureReturnPassword123!',
      }, admin);

      assert.strictEqual(res.success, true);
      const hash = await sensitiveService.getStoredPasswordHash('return');
      assert.ok(hash && hash.startsWith('$2'), 'Stored password must be a valid bcrypt hash');
    });

    await test('C2: Correct password verification succeeds; Incorrect password verification fails', async () => {
      const admin = { id: 1, username: 'admin', role: 'admin', branch_id: 1 };
      const valid = await sensitiveService.verifyPassword('return', 'SecureReturnPassword123!', { user: admin });
      assert.strictEqual(valid, true, 'Correct password must verify');

      const invalid = await sensitiveService.verifyPassword('return', 'WrongPassword!', { user: admin });
      assert.strictEqual(invalid, false, 'Wrong password must fail');
    });

    await test('C3: Password verification without required permission fails with 403', async () => {
      const userWithoutPerm = {
        id: 920,
        username: 'unauth_user',
        role: 'branch_user',
        branch_id: 1,
        permissions: ['pos.sales.view'], // Lacks pos.invoices.refund
      };
      const token = makeToken(userWithoutPerm);
      const res = await fetch(`${baseUrl}/api/verify-return-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'SecureReturnPassword123!', order_id: 1 }),
      });
      assert.strictEqual(res.status, 403, `Must reject verification when permission is missing, got ${res.status}`);
    });

    await test('C4: Approval token is short-lived, single-use, and cannot be reused', async () => {
      const user = { id: 921, username: 'token_user', role: 'branch_user', branch_id: 1 };
      const approval = sensitiveService.generateApprovalToken({
        op: 'invoice_edit',
        user,
        resourceId: 555,
        branchId: 1,
      });
      assert.ok(approval.approval_token, 'Approval token string must exist');

      // First consumption succeeds
      const payload = sensitiveService.consumeApprovalToken(approval.approval_token, {
        op: 'invoice_edit',
        user,
        resourceId: 555,
        branchId: 1,
      });
      assert.strictEqual(Number(payload.resourceId), 555);

      // Second consumption fails with single-use error (403)
      assert.throws(
        () => sensitiveService.consumeApprovalToken(approval.approval_token, { op: 'invoice_edit', user, resourceId: 555, branchId: 1 }),
        (err) => err.statusCode === 403 && err.message.includes('مسبقاً'),
        'Reusing an approval token must throw 403 single-use error'
      );
    });

    await test('C5: Approval token cross-user reuse is rejected', async () => {
      const userA = { id: 922, username: 'user_a', role: 'branch_user', branch_id: 1 };
      const userB = { id: 923, username: 'user_b', role: 'branch_user', branch_id: 1 };

      const approval = sensitiveService.generateApprovalToken({
        op: 'invoice_edit',
        user: userA,
        resourceId: 777,
        branchId: 1,
      });

      // User B attempts to consume User A's approval token
      assert.throws(
        () => sensitiveService.consumeApprovalToken(approval.approval_token, {
          op: 'invoice_edit',
          user: userB,
          resourceId: 777,
          branchId: 1,
        }),
        (err) => err.statusCode === 403 && err.message.includes('لمستخدم آخر'),
        'Cross-user approval token reuse must throw 403'
      );
    });

    await test('C6: Approval token cross-branch reuse is rejected', async () => {
      const user = { id: 924, username: 'user_b1', role: 'branch_user', branch_id: 1 };
      const approval = sensitiveService.generateApprovalToken({
        op: 'return',
        user,
        resourceId: 888,
        branchId: 1,
      });

      // Attempt consumption on branch 2
      assert.throws(
        () => sensitiveService.consumeApprovalToken(approval.approval_token, {
          op: 'return',
          user,
          resourceId: 888,
          branchId: 2, // Cross-branch attempt
        }),
        (err) => err.statusCode === 403 && err.message.includes('لفرع آخر'),
        'Cross-branch approval token reuse must throw 403'
      );
    });

    await test('C7: Expired approval token is rejected', async () => {
      const user = { id: 925, username: 'user_exp', role: 'branch_user', branch_id: 1 };
      const approval = sensitiveService.generateApprovalToken({
        op: 'profit',
        user,
        ttlSeconds: -10, // Already expired
      });

      assert.throws(
        () => sensitiveService.consumeApprovalToken(approval.approval_token, { op: 'profit', user }),
        (err) => err.statusCode === 403 && err.message.includes('انتهت صلاحية'),
        'Expired approval token must throw 403'
      );
    });

    await test('C8: Brute-force lockout triggers after repeated failed attempts', async () => {
      const testIp = '198.51.100.42';
      const mockReq = { ip: testIp, socket: { remoteAddress: testIp } };
      const user = { id: 926, username: 'brute_victim', role: 'branch_user' };
      sensitiveService.resetLockoutForTesting('profit');

      // Make 5 consecutive failed attempts
      for (let i = 0; i < 5; i++) {
        await sensitiveService.verifyPassword('profit', 'WrongPwd123', { user, req: mockReq });
      }

      // 6th attempt should be blocked by progressive lockout (429)
      await assert.rejects(
        async () => {
          await sensitiveService.verifyPassword('profit', 'AnyPwd', { user, req: mockReq });
        },
        (err) => err.statusCode === 429,
        'Should throw 429 Too Many Requests after 5 failed attempts'
      );

      sensitiveService.resetLockoutForTesting('profit');
    });

    // --------------------------------------------------------------------------
    // PART D: ADMIN PERSONAL ACCOUNT MANAGEMENT & SESSION FRESHNESS
    // --------------------------------------------------------------------------
    console.log('\n--- PART D: Admin Account Management & Session Freshness ---');

    await test('D1: Admin can update display name and password with valid current password', async () => {
      // Find or create test admin user
      let testAdminId = null;
      const initialPwdHash = await bcrypt.hash('AdminInitialPwd123!', 10);

      if (config.IS_BRANCH_MODE) {
        db.sqlite.prepare(`
          INSERT OR REPLACE INTO users (id, username, password_hash, role, branch_id, branch_scope, branch_ids, token_version)
          VALUES (7777, 'admin_profile_test', ?, 'admin', 1, 'all', '[]', 1)
        `).run(initialPwdHash);
        testAdminId = 7777;
      } else {
        await db.query(`
          INSERT INTO users (id, username, password_hash, role, branch_id, branch_scope, branch_ids, token_version)
          VALUES (7777, 'admin_profile_test', $1, 'admin', 1, 'all', '[]', 1)
          ON CONFLICT (id) DO UPDATE SET password_hash = $1, token_version = 1
        `, [initialPwdHash]);
        testAdminId = 7777;
      }

      // Update password
      const result = await authService.updateOwnAccount(testAdminId, {
        current_password: 'AdminInitialPwd123!',
        new_password: 'AdminNewPassword456!',
        confirm_password: 'AdminNewPassword456!',
        full_name: 'Super Admin Elwazeer',
      });

      assert.ok(result.token, 'Updated token must be returned');
      assert.strictEqual(result.user.name, 'Super Admin Elwazeer');

      // Verify new password works
      const authResult = await authService.authenticateUser('admin_profile_test', 'AdminNewPassword456!');
      assert.ok(authResult.token, 'Must authenticate with new password');
    });

    await test('D2: Account update fails when current password is wrong or confirmation mismatches', async () => {
      await assert.rejects(
        async () => {
          await authService.updateOwnAccount(7777, {
            current_password: 'WrongCurrentPassword!',
            new_password: 'AnotherPassword789!',
            confirm_password: 'AnotherPassword789!',
          });
        },
        (err) => err.statusCode === 400 && err.message.includes('الحالية'),
        'Must reject update with wrong current password'
      );

      await assert.rejects(
        async () => {
          await authService.updateOwnAccount(7777, {
            current_password: 'AdminNewPassword456!',
            new_password: 'AnotherPassword789!',
            confirm_password: 'MismatchedConfirmPassword!',
          });
        },
        (err) => err.statusCode === 400 && err.message.includes('متطابقين'),
        'Must reject update when new password and confirm password mismatch'
      );
    });

    await test('D3: Old JWT tokens are invalidated immediately when token_version increments', async () => {
      const oldToken = makeToken({ id: 7777, username: 'admin_profile_test', role: 'admin', token_version: 1 });
      const req = {
        cookies: {},
        headers: { authorization: `Bearer ${oldToken}` },
        path: '/api/settings',
      };
      let respondedStatus = null;
      const res = {
        clearCookie: () => {},
        status: (code) => {
          respondedStatus = code;
          return res;
        },
        json: (payload) => {
          res.body = payload;
          return res;
        },
      };

      const { authMiddleware } = require('../src/server/middleware/auth.middleware');
      let nextCalled = false;
      await authMiddleware(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false, 'next() must NOT be called for stale token version');
      assert.strictEqual(respondedStatus, 401, 'Stale token version must receive 401 Unauthorized');
      assert.strictEqual(req.user, null, 'Old token with token_version < fresh token_version must be rejected with req.user=null');
    });

    // --------------------------------------------------------------------------
    // PART E: AUDIT LOGGING & CREDENTIAL HYGIENE
    // --------------------------------------------------------------------------
    console.log('\n--- PART E: Audit Logging & Credential Hygiene ---');

    await test('E1: Audit service sanitizes credentials and records events without leaking secrets', async () => {
      await auditService.log({
        userId: 1,
        username: 'admin',
        action: 'security_test_event',
        details: {
          password: 'SecretPlaintextPassword!',
          password_hash: '$2a$10$SecretHashHere',
          token: 'sensitive-token',
          safe_field: 'safe_value',
        },
      });

      const logs = await auditService.listAuditLogs({ limit: 10 });
      const found = logs.find((l) => l.action === 'security_test_event');
      assert.ok(found, 'Security test event must be recorded');
      assert.strictEqual(found.details.password, undefined, 'Password must never be saved in audit logs');
      assert.strictEqual(found.details.password_hash, undefined, 'Password hash must never be saved in audit logs');
      assert.strictEqual(found.details.safe_field, 'safe_value', 'Safe metadata should be preserved');
    });

    await test('E2: Settings API never exposes password hashes or plaintext credentials', async () => {
      const settingsService = require('../src/server/modules/settings/settings.service');
      const settings = await settingsService.getSettings({ role: 'admin' });

      for (const [key, value] of Object.entries(settings)) {
        assert.ok(!key.endsWith('_hash'), `Setting key ${key} exposes password hash!`);
        assert.ok(!key.includes('password'), `Setting key ${key} exposes password in response!`);
      }
    });

  } finally {
    for (const sock of activeSockets) {
      try { sock.destroy(); } catch (_) {}
    }
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n================================================================================');
  console.log(`  RBAC & SENSITIVE OPS AUDIT SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  runTestSuite().catch((err) => {
    console.error('Fatal error in RBAC test suite:', err);
    process.exit(1);
  });
}

module.exports = runTestSuite;
