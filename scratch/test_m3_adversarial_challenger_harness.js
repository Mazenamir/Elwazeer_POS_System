/**
 * scratch/test_m3_adversarial_challenger_harness.js
 * Empirical Adversarial Stress Harness for Auto-Updater Timing, Backoff & Mutex Invariants
 * Invoked by challenger_m3_2 (Empirical Challenger)
 *
 * Verifies:
 * 1. Jitter distribution: 500 simulated next-check intervals, assert containment in [15m, 25m] and evaluate symmetry.
 * 2. Exponential backoff fuzzing: 20 consecutive network failures, assert interval doubles each step (40m, 80m, 120m) and strictly clamps at 120m without runaway growth. Assert recovery immediately resets back to baseline.
 * 3. Mutex race testing: fire 20 concurrent checkForUpdates() calls simultaneously, assert only 1 network check proceeds and 19 are safely rejected by the mutex lock.
 * 4. Destroy lifecycle audit: ensure calling destroy() repeatedly is idempotent and leaves no hanging timers or orphaned listeners.
 */

const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { AutoUpdateManager } = require('../src/main/updater.service');

// Mock Electron Updater fixture
class MockElectronUpdater extends EventEmitter {
  constructor() {
    super();
    this.autoDownload = false;
    this.autoInstallOnAppQuit = false;
    this.checkCount = 0;
    this.checkDelayMs = 25;
    this.shouldFail = false;
    this.failError = new Error('getaddrinfo ENOTFOUND github.com');
  }

  async checkForUpdates() {
    this.checkCount++;
    this.emit('checking-for-update');
    if (this.checkDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.checkDelayMs));
    }
    if (this.shouldFail) {
      this.emit('error', this.failError);
      throw this.failError;
    }
    const info = { version: '1.0.8' };
    this.emit('update-available', info);
    return { updateInfo: info };
  }

  async downloadUpdate() {
    this.emit('download-progress', { percent: 100 });
    this.emit('update-downloaded', { version: '1.0.8' });
  }

  quitAndInstall() {
    this.quitInstalled = true;
  }
}

// Diagnostic test collector
const testResults = [];

function record(id, title, status, details, evidence = {}) {
  testResults.push({ id, title, status, details, evidence });
  const icon = status === 'PASS' ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${id}: ${title}`);
  console.log(`   Details: ${details}`);
  if (Object.keys(evidence).length > 0) {
    console.log(`   Evidence: ${JSON.stringify(evidence)}`);
  }
}

async function runEmpiricalStressHarness() {
  console.log('========================================================================');
  console.log('EMPIRICAL ADVERSARIAL STRESS HARNESS — AUTO-UPDATER SERVICE (M3)');
  console.log('Target: src/main/updater.service.js');
  console.log('Agent: challenger_m3_2');
  console.log('========================================================================\n');

  // Intercept setTimeout to capture scheduled delayMs without awaiting wall-clock minutes
  let lastCapturedDelay = null;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, delay, ...args) => {
    if (typeof delay === 'number' && delay >= 5000) {
      lastCapturedDelay = delay;
      // Return a dummy timer that won't fire during test execution
      return originalSetTimeout(() => {}, 1000000);
    }
    return originalSetTimeout(fn, delay, ...args);
  };

  try {
    // ------------------------------------------------------------------------
    // SCENARIO 1: Jitter Distribution Simulation (500 iterations)
    // ------------------------------------------------------------------------
    console.log('--- TEST SCENARIO 1: JITTER DISTRIBUTION (500 ITERATIONS) ---');
    {
      const mock = new MockElectronUpdater();
      const manager = new AutoUpdateManager({
        updater: mock,
        isPackaged: true,
        log: () => {},
      });

      const samples = [];
      const floorMs = 15 * 60 * 1000;  // 900,000 ms
      const ceilingMs = 25 * 60 * 1000; // 1,500,000 ms
      let violations = 0;
      let minVal = Infinity;
      let maxVal = -Infinity;

      for (let i = 0; i < 500; i++) {
        lastCapturedDelay = null;
        manager.scheduleNextCheck();
        const d = lastCapturedDelay;
        samples.push(d);
        if (d < minVal) minVal = d;
        if (d > maxVal) maxVal = d;
        if (d < floorMs || d > ceilingMs) {
          violations++;
        }
      }
      manager.stop();

      const below20m = samples.filter((s) => s < 1200000).length;
      const above20m = samples.filter((s) => s >= 1200000).length;

      // 1.1 Strict containment check [15m, 25m]
      if (violations === 0) {
        record(
          'SCENARIO-1.1',
          'Jitter 500-Sample Containment in [15m, 25m]',
          'PASS',
          `100% of 500 samples fall strictly within [${floorMs}ms, ${ceilingMs}ms] ([15m, 25m])`,
          { minObservedMs: minVal, maxObservedMs: maxVal, totalSamples: 500, violations: 0 }
        );
      } else {
        record(
          'SCENARIO-1.1',
          'Jitter 500-Sample Containment in [15m, 25m]',
          'FAIL',
          `${violations} samples breached [15m, 25m] range boundaries`,
          { violations, minObservedMs: minVal, maxObservedMs: maxVal }
        );
      }

      // 1.2 Symmetry check (±5 min vs +0..+5 min)
      if (below20m === 0) {
        record(
          'SCENARIO-1.2',
          'Jitter Symmetry & Full Range Coverage',
          'FAIL',
          `Zero samples generated below baseline (1,200,000ms). Jitter is strictly positive (+0..+5m) rather than symmetric (±5m). Effective range is [20m, 25m].`,
          {
            samplesBelowBaseline: below20m,
            samplesAboveBaseline: above20m,
            minObservedMinutes: (minVal / 60000).toFixed(2),
            maxObservedMinutes: (maxVal / 60000).toFixed(2),
            codeLocation: 'updater.service.js:180 (delayMs = this.checkIntervalMs + jitter)',
          }
        );
      } else {
        record(
          'SCENARIO-1.2',
          'Jitter Symmetry & Full Range Coverage',
          'PASS',
          `Symmetric distribution verified around baseline with ${below20m} below and ${above20m} above 20m.`,
          { samplesBelowBaseline: below20m, samplesAboveBaseline: above20m }
        );
      }
    }

    // ------------------------------------------------------------------------
    // SCENARIO 2: Exponential Backoff Fuzzing (20 Consecutive Failures)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SCENARIO 2: EXPONENTIAL BACKOFF FUZZING (20 FAILURES) ---');
    {
      const mock = new MockElectronUpdater();
      mock.shouldFail = true;
      mock.checkDelayMs = 0; // zero delay for immediate loop
      const manager = new AutoUpdateManager({
        updater: mock,
        isPackaged: true,
        log: () => {},
      });

      const failureDelays = [];
      let runaway = false;

      for (let f = 1; f <= 20; f++) {
        lastCapturedDelay = null;
        await manager.performCheck();
        const d = lastCapturedDelay;
        failureDelays.push({ failure: f, delayMs: d, delayMinutes: d ? d / 60000 : null });
        if (d > 120 * 60 * 1000) {
          runaway = true;
        }
      }

      const step1 = failureDelays[0].delayMs;
      const step2 = failureDelays[1].delayMs;
      const step3 = failureDelays[2].delayMs;
      const step20 = failureDelays[19].delayMs;

      // 2.1 Assert interval doubles each step (40m, 80m, 120m)
      const expectedStep1 = 40 * 60 * 1000;  // 2,400,000 ms
      const expectedStep2 = 80 * 60 * 1000;  // 4,800,000 ms
      const expectedStep3 = 120 * 60 * 1000; // 7,200,000 ms

      const doublesFromBaseline = step1 === expectedStep1 && step2 === expectedStep2 && step3 === expectedStep3;

      if (!doublesFromBaseline) {
        record(
          'SCENARIO-2.1',
          'Exponential Backoff Sequence (40m, 80m, 120m)',
          'FAIL',
          `Backoff sequence does NOT match (40m, 80m, 120m). Actual: Step 1 = ${step1 / 60000}m (${step1}ms), Step 2 = ${step2 / 60000}m (${step2}ms), Step 3 = ${step3 / 60000}m (${step3}ms).`,
          {
            expected: ['40m (2,400,000ms)', '80m (4,800,000ms)', '120m (7,200,000ms)'],
            actual: [`${step1 / 60000}m (${step1}ms)`, `${step2 / 60000}m (${step2}ms)`, `${step3 / 60000}m (${step3}ms)`],
            rootCause: 'updater.service.js line 51 uses baseBackoffMs = 5min resulting in 5m, 10m, 20m, 40m, 80m, 120m instead of doubling 20m baseline.',
          }
        );
      } else {
        record(
          'SCENARIO-2.1',
          'Exponential Backoff Sequence (40m, 80m, 120m)',
          'PASS',
          `Backoff sequence strictly doubles from baseline to (40m, 80m, 120m).`,
          { step1, step2, step3 }
        );
      }

      // 2.2 Clamping at 120m ceiling without runaway growth
      if (!runaway && step20 === 120 * 60 * 1000) {
        record(
          'SCENARIO-2.2',
          'Backoff Strict Clamping at 120m Ceiling',
          'PASS',
          `All failures through #20 strictly clamp at 120m (7,200,000ms) without runaway growth.`,
          { failure20DelayMs: step20, runawayGrowth: false }
        );
      } else {
        record(
          'SCENARIO-2.2',
          'Backoff Strict Clamping at 120m Ceiling',
          'FAIL',
          `Backoff failed to clamp at 120m. Runaway=${runaway}, step20=${step20}ms`,
          { runaway, step20 }
        );
      }

      // 2.3 Recovery immediate reset to baseline
      mock.shouldFail = false;
      lastCapturedDelay = null;
      await manager.performCheck();
      const recDelay = lastCapturedDelay;

      if (manager.consecutiveFailures === 0 && recDelay >= 15 * 60 * 1000 && recDelay <= 25 * 60 * 1000) {
        record(
          'SCENARIO-2.3',
          'Recovery Immediate Reset to Baseline',
          'PASS',
          `Successful check immediately reset consecutiveFailures to 0 and scheduled delay in baseline range (${(recDelay / 60000).toFixed(2)}m).`,
          { consecutiveFailures: manager.consecutiveFailures, scheduledDelayMs: recDelay }
        );
      } else {
        record(
          'SCENARIO-2.3',
          'Recovery Immediate Reset to Baseline',
          'FAIL',
          `Recovery did not restore baseline properly. consecutiveFailures=${manager.consecutiveFailures}, delay=${recDelay}ms`,
          { consecutiveFailures: manager.consecutiveFailures, recDelay }
        );
      }

      manager.stop();
    }

    // ------------------------------------------------------------------------
    // SCENARIO 3: Mutex Concurrency Race Testing (20 Concurrent Calls)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SCENARIO 3: MUTEX CONCURRENCY RACE (20 CALLS) ---');
    {
      const mock = new MockElectronUpdater();
      mock.checkDelayMs = 40; // In-flight simulated check delay
      const manager = new AutoUpdateManager({
        updater: mock,
        isPackaged: true,
        log: () => {},
      });

      const concurrentCalls = 20;
      const checkPromises = [];
      for (let i = 0; i < concurrentCalls; i++) {
        checkPromises.push(manager.performCheck());
      }

      await Promise.all(checkPromises);

      const executed = mock.checkCount;
      const rejected = concurrentCalls - executed;
      const isCheckingAfter = manager.isChecking;

      if (executed === 1 && rejected === 19 && isCheckingAfter === false) {
        record(
          'SCENARIO-3.1',
          'Mutex Concurrency Race Protection',
          'PASS',
          `Exactly 1 network check proceeded and 19 were safely rejected by the mutex lock. Mutex cleanly unlocked (isChecking = false).`,
          { dispatched: concurrentCalls, executed, rejected, finalIsChecking: isCheckingAfter }
        );
      } else {
        record(
          'SCENARIO-3.1',
          'Mutex Concurrency Race Protection',
          'FAIL',
          `Mutex failed race test. Dispatched: ${concurrentCalls}, Executed: ${executed}, Rejected: ${rejected}, isChecking: ${isCheckingAfter}`,
          { executed, rejected, isCheckingAfter }
        );
      }

      manager.stop();
    }

    // ------------------------------------------------------------------------
    // SCENARIO 4: Destroy Lifecycle & Orphaned Listener Audit
    // ------------------------------------------------------------------------
    console.log('\n--- TEST SCENARIO 4: DESTROY LIFECYCLE & LISTENER AUDIT ---');
    {
      const mock = new MockElectronUpdater();
      const manager = new AutoUpdateManager({
        updater: mock,
        isPackaged: true,
        initialDelayMs: 60000,
        log: () => {},
      });

      manager.init();

      const events = [
        'checking-for-update',
        'update-available',
        'update-not-available',
        'download-progress',
        'update-downloaded',
        'error',
      ];

      // Add external listener on manager
      manager.on('status', () => {});

      // Call destroy() 5 times consecutively to verify idempotency
      let threwError = false;
      try {
        manager.destroy();
        manager.destroy();
        manager.destroy();
        manager.destroy();
        manager.destroy();
      } catch (e) {
        threwError = true;
      }

      // 4.1 Idempotency check
      if (!threwError && manager.isStopped === true && manager.timer === null) {
        record(
          'SCENARIO-4.1',
          'Destroy Lifecycle Idempotency',
          'PASS',
          `Repeated destroy() invocations are idempotent, throw no exceptions, and maintain isStopped=true and timer=null.`,
          { isStopped: manager.isStopped, timer: manager.timer }
        );
      } else {
        record(
          'SCENARIO-4.1',
          'Destroy Lifecycle Idempotency',
          'FAIL',
          `Repeated destroy() threw exceptions or left timer active.`,
          { threwError, isStopped: manager.isStopped, timer: manager.timer }
        );
      }

      // 4.2 Listener cleanup check
      let orphanedOnUpdater = 0;
      const remainingCounts = {};
      events.forEach((evt) => {
        const count = mock.listenerCount(evt);
        remainingCounts[evt] = count;
        orphanedOnUpdater += count;
      });

      const orphanedOnManager = manager.listenerCount('status');

      if (orphanedOnUpdater === 0 && orphanedOnManager === 0) {
        record(
          'SCENARIO-4.2',
          'Zero-Leak Listener Cleanup on Destroy',
          'PASS',
          `All listeners on updater and manager were completely unbound on destroy(). Zero leaks detected.`,
          { remainingCounts, orphanedOnManager }
        );
      } else {
        record(
          'SCENARIO-4.2',
          'Zero-Leak Listener Cleanup on Destroy',
          'FAIL',
          `destroy() left ${orphanedOnUpdater} orphaned listeners on updater and ${orphanedOnManager} on manager.`,
          {
            totalOrphanedOnUpdater: orphanedOnUpdater,
            remainingCounts,
            orphanedOnManager,
            rootCause: 'updater.service.js destroy() only invokes stop() (clearing timer). It does not unbind event handlers from this.updater or call removeAllListeners().',
          }
        );
      }
    }

    // ------------------------------------------------------------------------
    // SUMMARY AND VERDICT
    // ------------------------------------------------------------------------
    console.log('\n========================================================================');
    const passedCount = testResults.filter((r) => r.status === 'PASS').length;
    const failedCount = testResults.filter((r) => r.status === 'FAIL').length;
    console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
    console.log('========================================================================\n');

    if (failedCount > 0) {
      console.log('❌ FINAL VERDICT: FAIL');
      console.log('Deficiencies confirmed by empirical stress test:');
      testResults
        .filter((r) => r.status === 'FAIL')
        .forEach((r, idx) => {
          console.log(`  ${idx + 1}. [${r.id}] ${r.title}`);
          console.log(`     ${r.details}`);
        });
      process.exit(1);
    } else {
      console.log('✅ FINAL VERDICT: APPROVE');
      process.exit(0);
    }
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

runEmpiricalStressHarness().catch((err) => {
  console.error('Fatal crash running empirical stress harness:', err);
  process.exit(1);
});
