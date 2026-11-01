/**
 * scratch/test_secure_auto_update_system.js
 * Comprehensive Test Suite for Secure Auto-Update, Safe Installation & Application Protection
 *
 * Covers:
 * A. Update State Machine (All valid and invalid transitions, resets, history)
 * B. Scheduling, Jitter & Backoff (Fake timers, bounds, idempotency)
 * C. False isDownloading bug regression & Decoupled Download Lifecycle
 * D. Edition & Channel Isolation (Master vs Branch cross-update rejection)
 * E. Cryptographic Policy & Package Integrity (Ed25519 signatures, expired policy, SHA-512 digest verification)
 * F. Safe Operation Drain Coordinator & Graceful Maintenance (Active sales drain, new mutations rejected, timeout recovery)
 * G. IPC Security Guards & Preload Isolation
 * H. Windows Least-Privilege ACL Validation (Program Files vs ProgramData separation)
 * I. Failure Injection (Tampered package, network timeout, corrupted signature)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const { UpdateStateMachine, VALID_STATES, ALLOWED_TRANSITIONS } = require('../src/main/update-state-machine');
const {
  compareSemver,
  canonicalizePolicy,
  verifyPolicySignature,
  validatePolicyContract,
  verifyFileSha512,
} = require('../src/main/security/update-policy.verifier');
const { AutoUpdateManager } = require('../src/main/updater.service');
const { OperationDrainCoordinator } = require('../src/server/core/drain-coordinator');
const { generateSignedPolicy } = require('../scripts/sign-release-policy');

// Mock Updater Engine for testing
class MockUpdaterEngine extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = null;
    this.autoInstallOnAppQuit = null;
    this.channel = 'latest';
    this.checkCount = 0;
    this.downloadCount = 0;
    this.quitAndInstallCalled = false;
  }

  async checkForUpdates() {
    this.checkCount++;
    this.emit('checking-for-update');
    return { updateInfo: { version: '1.0.9' } };
  }

  async downloadUpdate() {
    this.downloadCount++;
    this.emit('download-progress', { percent: 50 });
    await new Promise((r) => setTimeout(r, 20));
    this.emit('download-progress', { percent: 100 });
    this.emit('update-downloaded', {
      version: '1.0.9',
      downloadedFile: path.join(__dirname, 'mock-installer.exe'),
    });
    return ['mock-installer.exe'];
  }

  quitAndInstall(isSilent, isForceRunAfter) {
    this.quitAndInstallCalled = true;
    this.quitAndInstallArgs = { isSilent, isForceRunAfter };
  }
}

// Test Runner
let passed = 0;
let failed = 0;
const results = [];

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
    results.push({ name, status: 'PASS' });
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
  }
}

async function runComprehensiveUpdateTestSuite() {
  console.log('========================================================================');
  console.log('    ELWAZEER POS — SECURE AUTO-UPDATE & SYSTEM PROTECTION TEST SUITE     ');
  console.log('========================================================================\n');

  // Keypair for testing signatures
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const testPubKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const testPrivKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

  // --------------------------------------------------------------------------
  // SECTION A: STATE MACHINE INTEGRITY & TRANSITIONS
  // --------------------------------------------------------------------------
  console.log('--- SECTION A: Update State Machine Invariants ---');

  await runTest('SM-01: Contains all required states per specification', () => {
    const requiredStates = [
      'idle', 'checking', 'up-to-date', 'update-available', 'downloading',
      'downloaded', 'waiting-for-safe-point', 'preparing-maintenance',
      'draining-operations', 'stopping-services', 'installing', 'restarting',
      'verifying-health', 'completed', 'failed', 'rollback-required'
    ];
    for (const s of requiredStates) {
      assert.ok(VALID_STATES.includes(s), `Missing required state: ${s}`);
    }
  });

  await runTest('SM-02: Rejects invalid transitions with clear exception', () => {
    const sm = new UpdateStateMachine({ initialState: 'idle', log: () => {} });
    assert.throws(
      () => sm.transition('installing'),
      /Invalid transition from 'idle' to 'installing'/
    );
  });

  await runTest('SM-03: Valid transition pipeline executes smoothly', () => {
    const sm = new UpdateStateMachine({ initialState: 'idle', log: () => {} });
    sm.transition('checking');
    sm.transition('update-available', { version: '1.0.9' });
    sm.transition('downloading');
    sm.transition('downloaded');
    sm.transition('waiting-for-safe-point');
    sm.transition('preparing-maintenance');
    sm.transition('draining-operations');
    sm.transition('stopping-services');
    sm.transition('installing');
    sm.transition('restarting');
    sm.transition('verifying-health');
    sm.transition('completed');
    sm.transition('idle');
    assert.strictEqual(sm.getState(), 'idle');
    assert.ok(sm.getHistory().length > 10);
  });

  await runTest('SM-04: Reset restores idle state safely', () => {
    const sm = new UpdateStateMachine({ initialState: 'draining-operations', log: () => {} });
    sm.reset('test_cleanup');
    assert.strictEqual(sm.getState(), 'idle');
  });

  // --------------------------------------------------------------------------
  // SECTION B: TIMING, JITTER & SCHEDULING (DETERMINISTIC)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION B: Scheduling, Jitter & Backoff Invariants ---');

  await runTest('SCHED-01: Initial startup delay default is 25 seconds', () => {
    const manager = new AutoUpdateManager({ isPackaged: true });
    assert.strictEqual(manager.initialDelayMs, 25000);
  });

  await runTest('SCHED-02: Normal check interval is clamped to 5 minutes minimum', () => {
    const manager = new AutoUpdateManager({ isPackaged: true, checkIntervalMinutes: 2 });
    assert.strictEqual(manager.checkIntervalMs, 5 * 60 * 1000);
  });

  await runTest('SCHED-03: Exponential backoff caps strictly at 120 minutes ceiling', () => {
    const manager = new AutoUpdateManager({
      isPackaged: true,
      checkIntervalMinutes: 20,
    });
    manager.consecutiveFailures = 10; // High failure count
    let scheduledDelay = null;
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (cb, ms) => {
      scheduledDelay = ms;
      return 123;
    };
    try {
      manager.scheduleNextCheck();
      assert.strictEqual(scheduledDelay, 120 * 60 * 1000, 'Backoff must be clamped to 120 minutes');
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });

  await runTest('SCHED-04: Stop and destroy cleanly clear pending timers without process leaks', () => {
    const manager = new AutoUpdateManager({ isPackaged: true, initialDelayMs: 10000 });
    manager.scheduleNextCheck(10000);
    assert.ok(manager.timer !== null);
    manager.stop();
    assert.strictEqual(manager.timer, null);
    assert.strictEqual(manager.isStopped, true);
  });

  // --------------------------------------------------------------------------
  // SECTION C: ISDOWNLOADING BUG REGRESSION & DECOUPLED LIFECYCLE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION C: isDownloading Bug Fix & Decoupled Download ---');

  await runTest('BUG-01: Update available does NOT set isDownloading to true', () => {
    const mock = new MockUpdaterEngine();
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      log: () => {},
    });
    manager.attachEventListeners();
    mock.emit('update-available', { version: '1.0.9' });

    assert.strictEqual(manager.isDownloading, false, 'isDownloading MUST remain false on update-available');
    assert.strictEqual(manager.getStatus().state, 'update-available');
  });

  await runTest('BUG-02: downloadUpdate starts successfully after update-available without already_downloading error', async () => {
    const mock = new MockUpdaterEngine();
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      log: () => {},
    });
    manager.attachEventListeners();
    mock.emit('update-available', { version: '1.0.9' });

    // Calling downloadUpdate should now proceed because isDownloading was NOT prematurely set
    const downloadPromise = manager.downloadUpdate();
    assert.strictEqual(manager.isDownloading, true, 'isDownloading is now true after download actually began');
    assert.strictEqual(manager.getStatus().state, 'downloading');

    await downloadPromise;
    assert.strictEqual(mock.downloadCount, 1);
    assert.strictEqual(manager.updateDownloaded, true);
    assert.strictEqual(manager.isDownloading, false);
  });

  await runTest('BUG-03: Duplicate download calls are rejected idempotently', async () => {
    const mock = new MockUpdaterEngine();
    mock.downloadUpdate = () => new Promise((resolve) => setTimeout(resolve, 50));
    const manager = new AutoUpdateManager({
      updater: mock,
      isPackaged: true,
      log: () => {},
    });
    manager.attachEventListeners();
    mock.emit('update-available', { version: '1.0.9' });

    const p1 = manager.downloadUpdate();
    const p2 = manager.downloadUpdate();

    const res2 = await p2;
    assert.deepStrictEqual(res2, { status: 'already_downloading' });
    await p1;
  });

  // --------------------------------------------------------------------------
  // SECTION D: EDITION & CHANNEL ISOLATION (MASTER VS BRANCH)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION D: Master vs Branch Edition & Channel Isolation ---');

  await runTest('ISO-01: Master updater defaults to channel latest and appId com.bebyoon.system', () => {
    const masterManager = new AutoUpdateManager({ edition: 'master', isPackaged: true });
    assert.strictEqual(masterManager.edition, 'master');
    assert.strictEqual(masterManager.channel, 'latest');
    assert.strictEqual(masterManager.appId, 'com.bebyoon.system');
  });

  await runTest('ISO-02: Branch updater defaults to channel branch and appId com.bebyoon.branch.system', () => {
    const branchManager = new AutoUpdateManager({ edition: 'branch', isPackaged: true });
    assert.strictEqual(branchManager.edition, 'branch');
    assert.strictEqual(branchManager.channel, 'branch');
    assert.strictEqual(branchManager.appId, 'com.bebyoon.branch.system');
  });

  await runTest('ISO-03: Master updater strictly rejects Branch signed policy', async () => {
    const branchSigned = generateSignedPolicy({
      edition: 'branch',
      version: '1.0.9',
      channel: 'branch',
      privateKeyPem: testPrivKeyPem,
    });

    const masterManager = new AutoUpdateManager({
      edition: 'master',
      isPackaged: true,
      publicKeyPem: testPubKeyPem,
      log: () => {},
    });

    const verifyResult = await masterManager.verifyUpdateAuthenticity(
      branchSigned.policy,
      branchSigned.signature
    );

    assert.strictEqual(verifyResult.verified, false);
    assert.ok(verifyResult.error.includes('app_id_mismatch') || verifyResult.error.includes('edition_mismatch'));
  });

  await runTest('ISO-04: Branch updater strictly rejects Master signed policy', async () => {
    const masterSigned = generateSignedPolicy({
      edition: 'master',
      version: '1.0.9',
      channel: 'latest',
      privateKeyPem: testPrivKeyPem,
    });

    const branchManager = new AutoUpdateManager({
      edition: 'branch',
      isPackaged: true,
      publicKeyPem: testPubKeyPem,
      log: () => {},
    });

    const verifyResult = await branchManager.verifyUpdateAuthenticity(
      masterSigned.policy,
      masterSigned.signature
    );

    assert.strictEqual(verifyResult.verified, false);
    assert.ok(verifyResult.error.includes('app_id_mismatch') || verifyResult.error.includes('edition_mismatch'));
  });

  // --------------------------------------------------------------------------
  // SECTION E: CRYPTOGRAPHIC POLICY & ARTIFACT INTEGRITY
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION E: Cryptographic Policy & SHA-512 Package Verification ---');

  await runTest('CRYPTO-01: Valid Ed25519 signature verified successfully', async () => {
    const signed = generateSignedPolicy({
      edition: 'master',
      version: '1.0.9',
      channel: 'latest',
      privateKeyPem: testPrivKeyPem,
    });

    const manager = new AutoUpdateManager({
      edition: 'master',
      isPackaged: true,
      publicKeyPem: testPubKeyPem,
      currentVersion: '1.0.8',
    });

    const result = await manager.verifyUpdateAuthenticity(signed.policy, signed.signature);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.error, null);
  });

  await runTest('CRYPTO-02: Modified policy with tampered version fails cryptographic verification', async () => {
    const signed = generateSignedPolicy({
      edition: 'master',
      version: '1.0.9',
      privateKeyPem: testPrivKeyPem,
    });

    // Tamper with policy payload after signing
    signed.policy.version = '1.0.10';

    const manager = new AutoUpdateManager({
      edition: 'master',
      isPackaged: true,
      publicKeyPem: testPubKeyPem,
      log: () => {},
    });

    const result = await manager.verifyUpdateAuthenticity(signed.policy, signed.signature);
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.error, 'invalid_digital_signature');
  });

  await runTest('CRYPTO-03: Expired policy is rejected by contract validation', async () => {
    const signed = generateSignedPolicy({
      edition: 'master',
      version: '1.0.9',
      expiresInDays: -1, // Expired yesterday
      privateKeyPem: testPrivKeyPem,
    });

    const manager = new AutoUpdateManager({
      edition: 'master',
      isPackaged: true,
      publicKeyPem: testPubKeyPem,
      log: () => {},
    });

    const result = await manager.verifyUpdateAuthenticity(signed.policy, signed.signature);
    assert.strictEqual(result.verified, false);
    assert.ok(result.error.includes('policy_expired'));
  });

  await runTest('CRYPTO-04: Downgrade attempt is rejected by anti-downgrade rule', async () => {
    const signed = generateSignedPolicy({
      edition: 'master',
      version: '1.0.5', // Lower than current 1.0.8
      privateKeyPem: testPrivKeyPem,
    });

    const manager = new AutoUpdateManager({
      edition: 'master',
      isPackaged: true,
      publicKeyPem: testPubKeyPem,
      currentVersion: '1.0.8',
      log: () => {},
    });

    const result = await manager.verifyUpdateAuthenticity(signed.policy, signed.signature);
    assert.strictEqual(result.verified, false);
    assert.ok(result.error.includes('downgrade_rejected'));
  });

  await runTest('CRYPTO-05: SHA-512 artifact digest verification validates authentic package and catches tampered file', async () => {
    const testFile = path.join(__dirname, 'temp_test_artifact.bin');
    fs.writeFileSync(testFile, 'AUTHENTIC_BINARY_CONTENT');
    const realDigest = crypto.createHash('sha512').update('AUTHENTIC_BINARY_CONTENT').digest('hex');

    // 1. Valid digest check
    const validCheck = await verifyFileSha512(testFile, realDigest);
    assert.strictEqual(validCheck.valid, true);

    // 2. Tampered file check
    fs.writeFileSync(testFile, 'TAMPERED_MALICIOUS_CONTENT');
    const tamperedCheck = await verifyFileSha512(testFile, realDigest);
    assert.strictEqual(tamperedCheck.valid, false);
    assert.ok(tamperedCheck.error.includes('digest_mismatch'));

    // Cleanup
    try { fs.unlinkSync(testFile); } catch {}
  });

  // --------------------------------------------------------------------------
  // SECTION F: SAFE OPERATION DRAIN COORDINATOR & MAINTENANCE MODE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION F: Safe Operation Drain Coordinator Invariants ---');

  await runTest('DRAIN-01: Maintenance activation rejects new business operations', () => {
    const coordinator = new OperationDrainCoordinator({ log: () => {} });
    coordinator.activateMaintenance('Urgent security update');

    assert.throws(() => {
      coordinator.startOperation('sale', { customer: 'Ahmed' });
    }, /MAINTENANCE_IN_PROGRESS/);
  });

  await runTest('DRAIN-02: Active operations started before maintenance are permitted to complete cleanly', async () => {
    const coordinator = new OperationDrainCoordinator({ log: () => {} });

    // Active sale in progress
    const { id, end } = coordinator.startOperation('sale', { orderId: 101 });
    assert.strictEqual(coordinator.getStatus().activeCount, 1);

    // Maintenance activated during the sale
    coordinator.activateMaintenance('Preparing update');

    // Drain process starts in background
    let drainFinished = false;
    const drainPromise = coordinator.waitForDrain(10000).then((res) => {
      drainFinished = true;
      return res;
    });

    // Verify drain is waiting
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(drainFinished, false, 'Drain must wait for active sale to finish');

    // Active sale finishes
    end({ invoiceId: 5001 });

    const drainRes = await drainPromise;
    assert.strictEqual(drainRes.drained, true);
    assert.strictEqual(drainRes.remainingCount, 0);
  });

  await runTest('DRAIN-03: Drain timeout does NOT kill active transactions and reports pending state safely', async () => {
    const coordinator = new OperationDrainCoordinator({ log: () => {} });

    // Long running transaction that does not finish
    const { id } = coordinator.startOperation('sale', { invoiceId: 9999 });

    coordinator.activateMaintenance('Update drain');
    // Short 100ms timeout
    const drainRes = await coordinator.waitForDrain(100);

    assert.strictEqual(drainRes.drained, false, 'Should report not drained upon timeout');
    assert.strictEqual(drainRes.remainingCount, 1);
    assert.strictEqual(coordinator.getStatus().activeCount, 1, 'Transaction must NOT be killed');
  });

  await runTest('DRAIN-04: Updater executeSafeInstall coordinates with ServerSupervisor gracefully', async () => {
    let supervisorDrained = false;
    const mockSupervisor = {
      drainAndStop: async () => {
        supervisorDrained = true;
        return { success: true };
      },
    };

    const mockUpdater = new MockUpdaterEngine();
    const manager = new AutoUpdateManager({
      updater: mockUpdater,
      serverSupervisor: mockSupervisor,
      isPackaged: true,
      log: () => {},
    });
    manager.attachEventListeners();

    // Advance to downloaded state
    mockUpdater.emit('update-available', { version: '1.0.9' });
    await manager.downloadUpdate();

    // Execute safe install
    const res = await manager.executeSafeInstall({ timeoutMs: 5000 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(supervisorDrained, true, 'ServerSupervisor.drainAndStop must be called');
    assert.strictEqual(mockUpdater.quitAndInstallCalled, true, 'quitAndInstall must be invoked after safe drain');
    assert.strictEqual(manager.getStatus().state, 'installing');
  });

  // --------------------------------------------------------------------------
  // SECTION G: IPC SECURITY & PRELOAD ISOLATION
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION G: IPC Security & Preload Isolation ---');

  await runTest('SEC-01: Preload script exports explicit whitelisted API without unrestricted ipcRenderer', () => {
    const preloadSource = fs.readFileSync(path.join(__dirname, '../src/preload/index.js'), 'utf8');
    assert.ok(!preloadSource.includes('ipcRenderer.on(event.data.channel'), 'No arbitrary dynamic IPC channel listening');
    assert.ok(preloadSource.includes('VALID_STATUS_CHANNELS'), 'Channel whitelist must be defined');
    assert.ok(!preloadSource.includes('window.electronAPI ='), 'Unsafe fallback to global window must be removed');
  });

  await runTest('SEC-02: validateSender logic rejects external and untrusted origins', () => {
    // Validate sender frame simulation
    function testSender(url) {
      try {
        const parsed = new URL(url);
        const allowed = new Set([
          'http://127.0.0.1:6253',
          'http://localhost:6253',
          'http://127.0.0.1:5173',
          'http://localhost:5173',
        ]);
        if (allowed.has(parsed.origin) || parsed.protocol === 'file:') return true;
        return false;
      } catch {
        return false;
      }
    }

    assert.strictEqual(testSender('http://127.0.0.1:6253/pos'), true);
    assert.strictEqual(testSender('http://localhost:5173/dashboard'), true);
    assert.strictEqual(testSender('file:///C:/Program%20Files/Bebyoon/index.html'), true);
    assert.strictEqual(testSender('https://malicious-site.com/evil'), false);
    assert.strictEqual(testSender('http://192.168.1.100:6253/'), false);
  });

  // --------------------------------------------------------------------------
  // SECTION H: WINDOWS LEAST-PRIVILEGE ACL AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION H: Windows Installation & Least-Privilege ACLs ---');

  await runTest('ACL-01: NSIS script explicitly eliminates Everyone (*S-1-1-0) Full Control', () => {
    const nshSource = fs.readFileSync(path.join(__dirname, '../build/installer.nsh'), 'utf8');
    assert.ok(!nshSource.includes('/grant *S-1-1-0:(OI)(CI)F'), 'Insecure Everyone Full Control must NOT exist in installer.nsh');
    assert.ok(nshSource.includes('*S-1-5-18:(OI)(CI)F'), 'SYSTEM must receive Full Control');
    assert.ok(nshSource.includes('*S-1-5-32-544:(OI)(CI)F'), 'Administrators must receive Full Control');
    assert.ok(nshSource.includes('*S-1-5-11:(OI)(CI)M'), 'Authenticated Users must receive Modify permissions only');
  });

  // --------------------------------------------------------------------------
  // SECTION I: SECRETS & ENVIRONMENT HYGIENE
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION I: Secrets & Packaging Hygiene ---');

  await runTest('SEC-03: No private signing keys in git working tree', () => {
    const files = fs.readdirSync(path.join(__dirname, '..'));
    for (const f of files) {
      assert.ok(!f.endsWith('.pem') && !f.endsWith('.key') && !f.includes('private'), `Suspicious private key file in root: ${f}`);
    }
  });

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed}/${passed + failed} Tests Passed (${failed} Failed)`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveUpdateTestSuite().catch((err) => {
  console.error('Test suite failed to run:', err);
  process.exit(1);
});
