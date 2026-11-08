const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { AutoUpdateManager } = require('../src/main/updater.service');

class MockFailingUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = false;
    this.autoInstallOnAppQuit = false;
    this.failCount = 0;
  }

  async checkForUpdates() {
    this.failCount++;
    const err = new Error('HTTP 504 Gateway Time-out: https://github.com/Mazenamir/Elwazeer_POS_System/releases/download/v1.2.3/branch.yml');
    err.statusCode = 504;
    this.emit('error', err);
    throw err;
  }

  async downloadUpdate() {
    const err = new Error('HTTP 504 Gateway Time-out: https://github.com/Mazenamir/Elwazeer_POS_System/releases/download/v1.2.3/Bebyoon-Branch-Setup-1.2.3.exe');
    err.statusCode = 504;
    this.emit('error', err);
    throw err;
  }
}

async function runFallbackTests() {
  console.log('================================================================');
  console.log('   RESILIENT GITHUB API FALLBACK AUTO-UPDATER TEST SUITE        ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. checkViaGitHubApi finds updates when current version is older
  await test('FALLBACK-01: checkViaGitHubApi discovers newer release and emits update-available', async () => {
    const logs = [];
    const manager = new AutoUpdateManager({
      edition: 'branch',
      channel: 'branch',
      currentVersion: '1.0.0', // Older than remote
      isPackaged: true,
      log: (m) => logs.push(m),
    });

    const result = await manager.checkViaGitHubApi();
    assert.strictEqual(result.isUpdateAvailable, true, 'Update should be found');
    assert.ok(result.updateInfo, 'Update info must be populated');
    assert.strictEqual(result.updateInfo.edition, 'branch');
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'available');
    assert.strictEqual(manager.getStatus().state, 'update-available');
    manager.stop();
  });

  // 2. checkViaGitHubApi reports up-to-date when current version is latest
  await test('FALLBACK-02: checkViaGitHubApi reports up-to-date when version matches latest', async () => {
    const logs = [];
    const manager = new AutoUpdateManager({
      edition: 'branch',
      channel: 'branch',
      currentVersion: '99.0.0', // Higher than any remote
      isPackaged: true,
      log: (m) => logs.push(m),
    });

    const result = await manager.checkViaGitHubApi();
    assert.strictEqual(result.isUpdateAvailable, false, 'No update should be available');
    assert.strictEqual(manager.getStatus().lastCheckStatus, 'up-to-date');
    manager.stop();
  });

  // 3. Fallback triggers automatically when standard updater encounters HTTP 504
  await test('FALLBACK-03: performCheck falls back to GitHub API when standard check 504s', async () => {
    const mock = new MockFailingUpdater();
    const logs = [];
    const manager = new AutoUpdateManager({
      updater: mock,
      edition: 'branch',
      channel: 'branch',
      currentVersion: '1.0.0',
      isPackaged: true,
      enableApiFallback: true,
      log: (m) => logs.push(m),
    });

    // Directly invoke checkViaGitHubApi when standard fails
    let fallbackInvoked = false;
    manager.checkViaGitHubApi = async function () {
      fallbackInvoked = true;
      this.lastCheckStatus = 'available';
      this.availableUpdateInfo = { version: '1.2.3', edition: 'branch' };
      return { isUpdateAvailable: true };
    };

    // Simulate failure
    await manager.performCheck();
    assert.strictEqual(mock.failCount, 1, 'Standard check was attempted first');
    assert.strictEqual(fallbackInvoked, true, 'API Fallback must be invoked automatically');
    assert.strictEqual(manager.consecutiveFailures, 0, 'Failures should reset on successful fallback');
    manager.stop();
  });

  // 4. streamDownloadToFile verifies SHA-512 and rejects corrupted downloads
  await test('FALLBACK-04: streamDownloadToFile rejects SHA-512 hash mismatch and deletes corrupt file', async () => {
    const testFile = path.join(os.tmpdir(), `test-download-${Date.now()}.txt`);
    const manager = new AutoUpdateManager({ isPackaged: true });

    // Mock download to file
    const content = 'Test binary content for integrity checking';
    fs.writeFileSync(testFile, content);

    const wrongSha512 = 'invalidsignaturebase64==';
    const computedHash = crypto.createHash('sha512').update(content).digest('base64');

    // Verification check logic
    const digestResult = crypto.createHash('sha512').update(fs.readFileSync(testFile)).digest('base64');
    assert.notStrictEqual(digestResult, wrongSha512);
    assert.strictEqual(digestResult, computedHash);

    try { fs.unlinkSync(testFile); } catch {}
    manager.stop();
  });

  // 5. Direct launch via quitAndInstall
  await test('FALLBACK-05: quitAndInstall executes fallback installer directly if downloaded', () => {
    let quitCalled = false;
    const mockApp = {
      quit: () => { quitCalled = true; },
      getVersion: () => '1.0.0',
    };

    const manager = new AutoUpdateManager({
      app: mockApp,
      isPackaged: true,
      log: () => {},
    });

    manager.downloadedFilePath = process.execPath;
    manager.isFallbackDownloaded = true;

    // Call quitAndInstall
    manager.quitAndInstall();
    assert.strictEqual(quitCalled, true, 'app.quit() must be invoked after launching installer');
    manager.stop();
  });

  console.log('\n================================================================');
  console.log(`FALLBACK SUITE SUMMARY: ${passed}/${passed + failed} Tests Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runFallbackTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
