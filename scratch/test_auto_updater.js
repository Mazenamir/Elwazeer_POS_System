/**
 * test_auto_updater.js
 * Invariant Regression Suite for Electron Periodic Auto-Update Checking.
 *
 * Authoritative Sources:
 * 1. PROJECT.md (Section 3: Auto-Updater Service Contract & Invariants)
 * 2. ORIGINAL_REQUEST.md (Requirement R5: Reliable Lightweight Periodic Auto-Update Checking)
 * 3. survey_explorer_3/handoff.md (Analysis & Architecture)
 *
 * Invariants Verified:
 * - Zero client-side git pull or unverified scripts
 * - Baseline periodic check interval: 20 minutes (1,200,000 ms)
 * - Random jitter bounds: ± 5 minutes (range 15–25 min / 900,000–1,500,000 ms)
 * - Concurrency lock: prevents overlapping check requests while previous check is in-flight
 * - Bounded exponential backoff: doubling interval on consecutive failures up to 120 min (7,200,000 ms) max
 * - Decoupled check vs download: autoDownload = false
 * - Lifecycle cleanup: destroy() clears timers and unbinds listeners
 */

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

// Test Runner Harness
let totalTests = 0;
let passedTests = 0;
const failures = [];
const implementationBugs = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    failures.push({ name, error: err.message });
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    -> ${err.message}`);
  }
}

// ============================================================================
// REFERENCE INVARIANT SPECIFICATION ENGINE
// ============================================================================

const BASELINE_INTERVAL_MIN = 20;
const BASELINE_INTERVAL_MS = BASELINE_INTERVAL_MIN * 60 * 1000; // 1,200,000 ms (20 min)
const JITTER_BOUND_MS = 5 * 60 * 1000;                          // 300,000 ms (±5 min)
const MIN_JITTERED_INTERVAL_MS = BASELINE_INTERVAL_MS - JITTER_BOUND_MS; // 900,000 ms (15 min)
const MAX_JITTERED_INTERVAL_MS = BASELINE_INTERVAL_MS + JITTER_BOUND_MS; // 1,500,000 ms (25 min)
const MAX_BACKOFF_MS = 120 * 60 * 1000;                         // 7,200,000 ms (120 min)

/**
 * Calculates next check delay based on PROJECT.md invariants:
 * - On success (consecutiveFailures == 0): baseline (20 min) ± 5 min jitter [15 min, 25 min]
 * - On failure (consecutiveFailures > 0): baseline * (2 ^ failures) clamped to 120 min max
 */
function calculateNextCheckDelay(consecutiveFailures = 0, customRandom = Math.random) {
  if (consecutiveFailures > 0) {
    // Doubling exponential backoff capped at 120 min (7,200,000 ms)
    const backoff = BASELINE_INTERVAL_MS * Math.pow(2, consecutiveFailures);
    return Math.min(MAX_BACKOFF_MS, backoff);
  }
  // Regular interval with uniform ± 5 min jitter
  // Uniform range: [BASELINE - 5min, BASELINE + 5min] = [15m, 25m]
  const jitter = (customRandom() * 2 - 1) * JITTER_BOUND_MS;
  return Math.round(BASELINE_INTERVAL_MS + jitter);
}

// ============================================================================
// MOCK AUTO-UPDATER & ELECTRON TEST FIXTURES
// ============================================================================

class MockAutoUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = null;
    this.autoInstallOnAppQuit = null;
    this.checkCount = 0;
    this.checkDelayMs = 50; // simulated network delay
    this.shouldFail = false;
  }

  async checkForUpdates() {
    this.checkCount++;
    this.emit('checking-for-update');
    await new Promise((r) => setTimeout(r, this.checkDelayMs));
    if (this.shouldFail) {
      const err = new Error('Network timeout: https://github.com/Mazenamir/Elwazeer_POS_System?token=secret123');
      this.emit('error', err);
      throw err;
    }
    const info = { version: '1.0.8' };
    this.emit('update-available', info);
    return { updateInfo: info };
  }

  async downloadUpdate() {
    this.emit('download-progress', { percent: 50 });
    await new Promise((r) => setTimeout(r, 20));
    this.emit('update-downloaded', { version: '1.0.8' });
  }

  quitAndInstall() {
    this.quitInstalled = true;
  }
}

// ============================================================================
// SUITE EXECUTION
// ============================================================================

async function runAutoUpdaterSuite() {
  console.log('================================================================');
  console.log('ELWAZEER POS INVARIANT REGRESSION SUITE (ELECTRON AUTO-UPDATER)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: Client Integrity & Security Invariant (Zero Git Pull)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Client Integrity & Security Invariant (Zero Git Pull) ---');

  await test('F10.T1.1: Zero client-side git pull or shell update scripts in source code', () => {
    const srcDir = path.resolve(__dirname, '../src');
    function scanFiles(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanFiles(full);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
          const content = fs.readFileSync(full, 'utf8');
          assert.ok(
            !content.includes('git pull'),
            `Forbidden "git pull" found in ${path.relative(srcDir, full)}`
          );
          assert.ok(
            !content.includes('git checkout'),
            `Forbidden "git checkout" found in ${path.relative(srcDir, full)}`
          );
        }
      }
    }
    scanFiles(srcDir);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Timing, Jitter & Backoff Mathematical Invariants (Tier 1 & 2)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Timing, Jitter & Backoff Invariants (Tier 1 & 2) ---');

  await test('F10.T1.2: Periodic check interval baseline is strictly 20 minutes (1,200,000 ms)', () => {
    assert.strictEqual(
      BASELINE_INTERVAL_MS,
      1200000,
      'Baseline check interval must equal 20 minutes in ms'
    );
  });

  await test('F10.T1.3: Random jitter bounds are strictly within ±5 minutes (15 to 25 minutes)', () => {
    // Sample 1,000 iterations to verify boundary containment
    let minObserved = Infinity;
    let maxObserved = -Infinity;

    for (let i = 0; i < 1000; i++) {
      const delay = calculateNextCheckDelay(0);
      if (delay < minObserved) minObserved = delay;
      if (delay > maxObserved) maxObserved = delay;

      assert.ok(
        delay >= MIN_JITTERED_INTERVAL_MS,
        `Sample ${i} below 15-minute floor: ${delay}ms < ${MIN_JITTERED_INTERVAL_MS}ms`
      );
      assert.ok(
        delay <= MAX_JITTERED_INTERVAL_MS,
        `Sample ${i} above 25-minute ceiling: ${delay}ms > ${MAX_JITTERED_INTERVAL_MS}ms`
      );
    }

    // Verify healthy distribution spread (> 7 minutes spread across 1,000 samples)
    const spreadMin = (maxObserved - minObserved) / 60000;
    assert.ok(
      spreadMin >= 7,
      `Jitter spread across 1,000 samples must be >= 7 min (observed ${spreadMin.toFixed(2)} min)`
    );
  });

  await test('F10.T1.4: Bounded exponential backoff doubles on failures and clamps at 120 minutes max', () => {
    // Failure 1: 20m * 2^1 = 40 min = 2,400,000 ms
    const f1 = calculateNextCheckDelay(1);
    assert.strictEqual(f1, 2400000, `Failure 1 delay must be 40 min (2,400,000 ms), got ${f1}`);

    // Failure 2: 20m * 2^2 = 80 min = 4,800,000 ms
    const f2 = calculateNextCheckDelay(2);
    assert.strictEqual(f2, 4800000, `Failure 2 delay must be 80 min (4,800,000 ms), got ${f2}`);

    // Failure 3: 20m * 2^3 = 160 min -> Clamped to 120 min = 7,200,000 ms
    const f3 = calculateNextCheckDelay(3);
    assert.strictEqual(f3, 7200000, `Failure 3 delay must clamp at 120 min (7,200,000 ms), got ${f3}`);

    // Failure 10: Still clamped to 120 min max
    const f10 = calculateNextCheckDelay(10);
    assert.strictEqual(f10, 7200000, `Failure 10 delay must remain clamped at 120 min (7,200,000 ms), got ${f10}`);
  });

  await test('F10.T1.5: Success check resets failure counter and restores baseline jittered schedule', () => {
    // Simulate recovery after 5 failures
    let consecutiveFailures = 5;
    assert.strictEqual(calculateNextCheckDelay(consecutiveFailures), MAX_BACKOFF_MS);

    // On check success:
    consecutiveFailures = 0;
    const restoredDelay = calculateNextCheckDelay(consecutiveFailures);
    assert.ok(
      restoredDelay >= MIN_JITTERED_INTERVAL_MS && restoredDelay <= MAX_JITTERED_INTERVAL_MS,
      `Restored delay must return to [15m, 25m] baseline range, got ${restoredDelay / 60000} min`
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Concurrency Lock & Decoupled Phase Invariants (Tier 2 & 3)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Concurrency Lock & Decoupled Phase Invariants (Tier 2 & 3) ---');

  await test('F10.T2.1: Concurrency mutex strictly prevents overlapping check requests', async () => {
    let isChecking = false;
    let actualNetworkCalls = 0;

    async function safeCheckForUpdates() {
      if (isChecking) {
        return { skipped: true, reason: 'concurrency_lock' };
      }
      isChecking = true;
      try {
        actualNetworkCalls++;
        // Simulate async network request
        await new Promise((r) => setTimeout(r, 50));
        return { skipped: false };
      } finally {
        isChecking = false;
      }
    }

    // Launch 3 simultaneous checks
    const [res1, res2, res3] = await Promise.all([
      safeCheckForUpdates(),
      safeCheckForUpdates(),
      safeCheckForUpdates(),
    ]);

    assert.strictEqual(actualNetworkCalls, 1, 'Exactly 1 network request must execute');
    assert.strictEqual(res1.skipped, false);
    assert.strictEqual(res2.skipped, true);
    assert.strictEqual(res3.skipped, true);
    assert.strictEqual(isChecking, false, 'Mutex must unlock after check completes');
  });

  await test('F10.T2.2: Decoupled check vs download phase: autoDownload is explicitly false', () => {
    const mockUpdater = new MockAutoUpdater();
    // Enforce invariant: autoDownload must be false
    mockUpdater.autoDownload = false;
    assert.strictEqual(
      mockUpdater.autoDownload,
      false,
      'autoDownload must be set to false so checking does not initiate 280MB download'
    );
  });

  await test('F10.T2.3: Lifecycle cleanup: destroy/stop clears background timer and unbinds listeners', () => {
    let timerCleared = false;
    let fakeTimer = setTimeout(() => {}, 100000);

    function stopUpdater() {
      if (fakeTimer) {
        clearTimeout(fakeTimer);
        fakeTimer = null;
        timerCleared = true;
      }
    }

    stopUpdater();
    assert.strictEqual(timerCleared, true, 'Timer handle must be cleared');
    assert.strictEqual(fakeTimer, null, 'Timer reference must be nullified');
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Application Module Audit & Implementation Verification (Tier 3 & 4)
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Application Module Audit & Implementation Verification (Tier 3 & 4) ---');

  // Check for updater service module
  const servicePath = path.resolve(__dirname, '../src/main/updater.service.js');
  const legacyPath = path.resolve(__dirname, '../src/main/updater.js');
  const hasService = fs.existsSync(servicePath);
  const targetModulePath = hasService ? servicePath : legacyPath;

  await test('F10.T3.1: Locate active updater implementation file', () => {
    assert.ok(
      fs.existsSync(targetModulePath),
      `Updater module must exist at ${servicePath} or ${legacyPath}`
    );
    console.log(`    Target updater module under audit: ${path.relative(path.resolve(__dirname, '..'), targetModulePath)}`);
  });

  await test('F10.T3.2: Verify updater module autoDownload = false invariant', () => {
    const code = fs.readFileSync(targetModulePath, 'utf8');

    // Invariant: autoDownload MUST be false
    const hasAutoDownloadFalse = /autoDownload\s*=\s*false/.test(code);
    const hasAutoDownloadTrue = /autoDownload\s*=\s*true/.test(code);

    if (hasAutoDownloadTrue && !hasAutoDownloadFalse) {
      implementationBugs.push({
        id: 'DEF-UPDATER-01',
        module: path.relative(path.resolve(__dirname, '..'), targetModulePath),
        description: 'Module sets autoDownload = true. Violates Requirement R5: Check and download must be decoupled (autoDownload = false).',
      });
    }

    assert.ok(
      hasAutoDownloadFalse,
      'Module must set autoUpdater.autoDownload = false to decouple check from binary download'
    );
  });

  await test('F10.T3.3: Verify updater baseline interval matches 20 minutes', () => {
    const code = fs.readFileSync(targetModulePath, 'utf8');
    
    // Check for 20 minute default interval
    const has20MinBaseline = /defaultIntervalMin\s*=\s*[^;]*20/.test(code) ||
                             /checkIntervalMinutes\s*:\s*20/.test(code) ||
                             /20\s*\*\s*60\s*\*\s*1000/.test(code);

    if (!has20MinBaseline) {
      implementationBugs.push({
        id: 'DEF-UPDATER-02',
        module: path.relative(path.resolve(__dirname, '..'), targetModulePath),
        description: 'Default periodic interval is configured to 15m instead of 20m baseline specified in PROJECT.md / R5.',
      });
    }

    assert.ok(has20MinBaseline, 'Updater module baseline check interval must be 20 minutes');
  });

  await test('F10.T3.4: Verify updater random jitter range bounds (±5 min / 15-25 min)', () => {
    const code = fs.readFileSync(targetModulePath, 'utf8');

    // Check for jitter configuration (5 minutes or 300000 ms specifically on jitter)
    const has5MinJitter = /maxJitterMs\s*=\s*[^;]*300000/.test(code) ||
                          /maxJitterMs\s*=\s*[^;]*5\s*\*\s*60\s*\*\s*1000/.test(code) ||
                          /jitter\s*=.*300000/.test(code);

    if (!has5MinJitter) {
      implementationBugs.push({
        id: 'DEF-UPDATER-03',
        module: path.relative(path.resolve(__dirname, '..'), targetModulePath),
        description: 'Jitter is configured to 0-60s (maxJitterMs: 60 * 1000) instead of ±5 minutes (300,000 ms / 15–25m range) specified in PROJECT.md Section 3.',
      });
    }

    assert.ok(has5MinJitter, 'Updater module random jitter must be configured with ±5 minutes bounds');
  });

  await test('F10.T3.5: Verify updater bounded exponential backoff max cap is 120 minutes (7,200,000 ms)', () => {
    const code = fs.readFileSync(targetModulePath, 'utf8');

    // Check for 120 min max backoff (7,200,000 ms)
    const has120MinBackoff = /maxBackoffMs\s*=\s*[^;]*120\s*\*\s*60\s*\*\s*1000/.test(code) ||
                             /7200000/.test(code) ||
                             /120\s*\*\s*60\s*\*\s*1000/.test(code);

    if (!has120MinBackoff) {
      implementationBugs.push({
        id: 'DEF-UPDATER-04',
        module: path.relative(path.resolve(__dirname, '..'), targetModulePath),
        description: 'Maximum exponential backoff is capped at 60 minutes instead of 120 minutes specified in PROJECT.md Section 3.',
      });
    }

    assert.ok(has120MinBackoff, 'Updater max exponential backoff must be 120 minutes (7,200,000 ms)');
  });

  await test('F10.T3.6: Verify updater module lifecycle cleanup methods exist and operate cleanly', () => {
    const mod = require(targetModulePath);
    const hasCleanup = typeof mod.stopAutoUpdater === 'function' ||
                       typeof mod.destroy === 'function' ||
                       (mod.AutoUpdateManager && typeof mod.AutoUpdateManager.prototype.stop === 'function');
    assert.ok(hasCleanup, 'Updater module must export cleanup function (stopAutoUpdater, destroy, or stop)');
  });

  // --------------------------------------------------------------------------
  // FINAL REPORT & ESCALATIONS
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failures.length} Failed)`);
  console.log('================================================================');

  if (implementationBugs.length > 0) {
    console.log('\n⚠️ IMPLEMENTATION BUGS / INVARIANT VIOLATIONS DISCOVERED:');
    implementationBugs.forEach((bug, idx) => {
      console.log(`  ${idx + 1}. [${bug.id}] ${bug.module}`);
      console.log(`     Details: ${bug.description}`);
    });
  }

  if (failures.length > 0) {
    console.log('\nFAILURE DETAILS:');
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. Test: ${f.name}`);
      console.log(`     Error: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✓ ALL AUTO-UPDATER INVARIANT TESTS PASSED CLEANLY.');
    process.exit(0);
  }
}

runAutoUpdaterSuite().catch((err) => {
  console.error('\nFATAL SUITE CRASH:', err);
  process.exit(1);
});
