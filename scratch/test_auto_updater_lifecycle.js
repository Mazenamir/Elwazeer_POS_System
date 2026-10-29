const assert = require('assert');
const { EventEmitter } = require('events');
const { AutoUpdateManager } = require('../src/main/updater');

class MockUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = false;
    this.autoInstallOnAppQuit = false;
    this.checkCount = 0;
    this.quitAndInstallCalled = false;
    this.simulateCheckDelayMs = 10;
    this.nextCheckResult = null;
    this.nextCheckError = null;
  }

  async checkForUpdates() {
    this.checkCount++;
    this.emit('checking-for-update');
    
    if (this.simulateCheckDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.simulateCheckDelayMs));
    }

    if (this.nextCheckError) {
      const err = this.nextCheckError;
      this.emit('error', err);
      throw err;
    }

    if (this.nextCheckResult && this.nextCheckResult.hasUpdate) {
      this.emit('update-available', { version: this.nextCheckResult.version });
    } else {
      this.emit('update-not-available', { version: '1.0.7' });
    }

    return this.nextCheckResult;
  }

  quitAndInstall() {
    this.quitAndInstallCalled = true;
  }
}

async function runAutoUpdaterTests() {
  console.log('================================================================');
  console.log('       ELWAZEER POS — ELECTRON AUTO-UPDATER TEST SUITE          ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passed++;
      } catch (err) {
        console.log(`  ❌ [FAIL] ${name}: ${err.message}`);
        failed++;
      }
    })();
  }

  // 1. Initial configuration and packaging safety
  await test('UPDATER-01: Disables checking in unpackaged mode by default', async () => {
    const mock = new MockUpdater();
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: false,
      log: (m) => logs.push(m),
    });

    manager.init();
    assert.strictEqual(manager.timer, null, 'No timer should be scheduled when unpackaged');
    assert.strictEqual(mock.checkCount, 0, 'No update check should execute');
    assert.ok(logs.some(l => l.includes('unpackaged')), 'Should log unpackaged skip notice');
  });

  // 2. Startup with no newer release
  await test('UPDATER-02: Handles check when no update is available', async () => {
    const mock = new MockUpdater();
    mock.nextCheckResult = { hasUpdate: false, version: '1.0.7' };
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      initialDelayMs: 5,
      checkIntervalMinutes: 5,
      maxJitterMs: 0,
      log: (m) => logs.push(m),
    });

    manager.init();
    // Wait for initial check to execute
    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(mock.checkCount, 1, 'Initial check must execute');
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'up-to-date');
    assert.strictEqual(manager.isChecking, false);
    manager.stop();
  });

  // 3. Startup when newer release is published
  await test('UPDATER-03: Detects available update and transitions state to downloading', async () => {
    const mock = new MockUpdater();
    mock.nextCheckResult = { hasUpdate: true, version: '1.0.8' };
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      initialDelayMs: 5,
      checkIntervalMinutes: 5,
      maxJitterMs: 0,
      log: (m) => logs.push(m),
    });

    manager.init();
    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(mock.checkCount, 1);
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'available');
    assert.strictEqual(manager.isDownloading, true, 'isDownloading flag must be active');
    manager.stop();
  });

  // 4. Overlapping check prevention
  await test('UPDATER-04: Concurrency lock prevents overlapping update checks', async () => {
    const mock = new MockUpdater();
    mock.simulateCheckDelayMs = 80;
    mock.nextCheckResult = { hasUpdate: false };
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      initialDelayMs: 1000,
      log: (m) => logs.push(m),
    });

    manager.init();
    // Trigger simultaneous check requests
    const p1 = manager.performCheck();
    const p2 = manager.performCheck();
    await Promise.all([p1, p2]);

    assert.strictEqual(mock.checkCount, 1, 'Only one check should be dispatched; second must be skipped');
    assert.ok(logs.some(l => l.includes('already in progress')), 'Must log skip message');
    manager.stop();
  });

  // 5. Download in-progress blocks redundant checks
  await test('UPDATER-05: Redundant checks skipped while download is active', async () => {
    const mock = new MockUpdater();
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      log: (m) => logs.push(m),
    });

    manager.init();
    manager.isDownloading = true;
    await manager.performCheck();

    assert.strictEqual(mock.checkCount, 0, 'No check allowed while downloading');
    assert.ok(logs.some(l => l.includes('currently downloading')), 'Must log download-in-progress notice');
    manager.stop();
  });

  // 6. Network failure & bounded retry backoff
  await test('UPDATER-06: Backs off gracefully after network failures and resets on recovery', async () => {
    const mock = new MockUpdater();
    mock.nextCheckError = new Error('getaddrinfo ENOTFOUND github.com');
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      initialDelayMs: 1000,
      log: (m) => logs.push(m),
    });

    manager.init();
    // Simulate first failure
    await manager.performCheck();
    assert.strictEqual(manager.consecutiveFailures, 1);
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'error');

    // Simulate second failure
    await manager.performCheck();
    assert.strictEqual(manager.consecutiveFailures, 2);

    // Simulate recovery
    mock.nextCheckError = null;
    mock.nextCheckResult = { hasUpdate: false };
    await manager.performCheck();
    assert.strictEqual(manager.consecutiveFailures, 0, 'Consecutive failures must reset to 0 upon success');
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'up-to-date');

    manager.stop();
  });

  // 7. Sanitizes tokens and credentials in error logs
  await test('UPDATER-07: Redacts GitHub tokens and Bearer credentials from logs', () => {
    const manager = new AutoUpdateManager({ isPackaged: true });
    const rawError = 'Request failed: Bearer ghp_ABC123456789SecretTokenWithKey?token=Secret123';
    const sanitized = manager.sanitizeErrorMessage(rawError);
    assert.ok(!sanitized.includes('ghp_ABC123456789'), 'Raw token must be removed');
    assert.ok(!sanitized.includes('Secret123'), 'URL query token must be removed');
    assert.ok(sanitized.includes('[REDACTED]'), 'Must contain REDACTED placeholders');
  });

  // 8. Clean timer cancellation on stop
  await test('UPDATER-08: Stops cleanly and cancels pending timers on app shutdown', async () => {
    const mock = new MockUpdater();
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      initialDelayMs: 50,
      log: () => {},
    });

    manager.init();
    assert.ok(manager.timer !== null, 'Timer must be active');
    manager.stop();
    assert.strictEqual(manager.timer, null, 'Timer must be cleared after stop()');
    assert.strictEqual(manager.isStopped, true);

    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(mock.checkCount, 0, 'No check should have executed after stop()');
  });

  // 9. Download progress and completion events
  await test('UPDATER-09: Emits progress and handles update-downloaded event', async () => {
    const mock = new MockUpdater();
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      log: (m) => logs.push(m),
    });

    manager.init();
    mock.emit('download-progress', { percent: 45.6 });
    assert.ok(logs.some(l => l.includes('progress: 46%')));

    mock.emit('update-downloaded', { version: '1.0.8' });
    assert.strictEqual(manager.isDownloading, false);
    assert.strictEqual(manager.updateDownloaded, true);
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'downloaded');
    manager.stop();
  });

  // 10. Enforces sensible minimum interval
  await test('UPDATER-10: Enforces minimum interval of at least 5 minutes', () => {
    const manager = new AutoUpdateManager({
      isPackaged: true,
      checkIntervalMinutes: 1, // Attempted 1 minute
    });

    assert.strictEqual(manager.checkIntervalMs, 5 * 60 * 1000, 'Must be clamped to 5 minutes minimum');
  });

  console.log('\n================================================================');
  console.log(`AUTO-UPDATER AUDIT SUMMARY: ${passed}/${passed + failed} Tests Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runAutoUpdaterTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
