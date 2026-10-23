/**
 * Elwazeer POS System — Master Regression Suite Runner
 * 
 * Sequentially executes all 12 verified core audit suites, records timing and results,
 * displays a formatted summary matrix, and terminates with exit code 0 on complete pass,
 * or exit code 1 on any failure.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');

// 12 Verified Core Test Suites (Milestone M4)
const suites = [
  {
    id: 1,
    name: 'Financial, Payroll & Excel Invariants',
    domain: 'Accounting & Payroll',
    script: 'scratch/test_financial_payroll_invariants.js',
  },
  {
    id: 2,
    name: 'Auto-Updater Timing, Backoff, Jitter & Mutex',
    domain: 'Auto-Updater Core',
    script: 'scratch/test_auto_updater.js',
  },
  {
    id: 3,
    name: 'Auto-Updater Lifecycle & Listener Cleanup',
    domain: 'Lifecycle & Electron',
    script: 'scratch/test_auto_updater_lifecycle.js',
  },
  {
    id: 4,
    name: 'Adversarial Challenger Timing & Mutex Probe',
    domain: 'Challenger Resilience',
    script: 'scratch/test_m3_adversarial_challenger_harness.js',
  },
  {
    id: 5,
    name: 'API Security, RBAC Guards, CORS & Rate Limits',
    domain: 'Security & Access',
    script: 'scratch/test_m2_security.js',
  },
  {
    id: 6,
    name: 'Database Atomicity, Concurrency & Stock Dedup',
    domain: 'Database & Concurrency',
    script: 'scratch/concurrency_and_atomicity_tests.js',
  },
  {
    id: 7,
    name: 'Core Verification Test Matrix',
    domain: 'System Verification',
    script: 'scratch/verification_tests.js',
  },
  {
    id: 8,
    name: 'Deep System Integration Tests',
    domain: 'Integration & RBAC',
    script: 'scratch/deep_integration_tests.js',
  },
  {
    id: 9,
    name: 'Inventory Movements & Branch Isolation',
    domain: 'Inventory & Warehouse',
    script: 'scratch/test_inventory_suite.js',
  },
  {
    id: 10,
    name: 'Rentals, Barcodes & Availability Reservations',
    domain: 'Rentals & Hardware',
    script: 'scratch/test_rentals_barcodes_reservations.js',
  },
  {
    id: 11,
    name: 'Database Migration & SQLite Backfill Verification',
    domain: 'Database Migrations',
    script: 'scratch/victory_audit_r2_independent_suite.js',
  },
  {
    id: 12,
    name: 'Package Manifest, Dependencies & Artifact Integrity',
    domain: 'Packaging & Binaries',
    script: 'scratch/verify_package.js',
  },
];

console.log('========================================================================================================');
console.log('             ELWAZEER POS SYSTEM — MASTER REGRESSION AUDIT RUNNER (PHASE 13 RELEASE GATE)                ');
console.log('========================================================================================================');
console.log(`Execution Environment : Node.js ${process.version} (${process.platform} ${process.arch})`);
console.log(`Working Directory     : ${ROOT_DIR}`);
console.log(`Total Core Suites     : ${suites.length}`);
console.log(`Timestamp             : ${new Date().toISOString()}`);
console.log('========================================================================================================\n');

let totalPassed = 0;
let totalFailed = 0;
const results = [];
const masterStartTime = Date.now();

for (let i = 0; i < suites.length; i++) {
  const suite = suites[i];
  const suiteIndex = `[${String(i + 1).padStart(2, ' ')}/${suites.length}]`;
  const absoluteScriptPath = path.resolve(ROOT_DIR, suite.script);

  if (!fs.existsSync(absoluteScriptPath)) {
    console.error(`${suiteIndex} ❌ FILE NOT FOUND: ${suite.script}`);
    totalFailed++;
    results.push({
      ...suite,
      durationMs: 0,
      status: 'FAIL',
      error: `File not found: ${absoluteScriptPath}`,
    });
    continue;
  }

  process.stdout.write(`${suiteIndex} ⏳ Running: ${suite.name} ... `);
  const suiteStart = Date.now();

  const spawnResult = spawnSync(process.execPath, [absoluteScriptPath], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 180000, // 3-minute timeout per suite
    maxBuffer: 50 * 1024 * 1024,
  });

  const durationMs = Date.now() - suiteStart;
  const durationSec = (durationMs / 1000).toFixed(2);

  if (spawnResult.status === 0 && !spawnResult.error) {
    process.stdout.write(`✅ PASS (${durationSec}s)\n`);
    totalPassed++;
    results.push({
      ...suite,
      durationMs,
      durationSec,
      status: 'PASS',
      stdout: spawnResult.stdout,
    });
  } else {
    process.stdout.write(`❌ FAIL (${durationSec}s, code: ${spawnResult.status})\n`);
    totalFailed++;
    const errMsg = spawnResult.error
      ? spawnResult.error.message
      : (spawnResult.stderr || spawnResult.stdout || 'Unknown error');
    
    console.error(`\n--- [ERROR OUTPUT: ${suite.name}] ---`);
    console.error(errMsg.trim());
    console.error('-------------------------------------------\n');

    results.push({
      ...suite,
      durationMs,
      durationSec,
      status: 'FAIL',
      error: errMsg,
    });
  }
}

const totalMasterDurationSec = ((Date.now() - masterStartTime) / 1000).toFixed(2);

// Formatted Summary Matrix Table
console.log('\n========================================================================================================');
console.log('                                  MASTER REGRESSION EXECUTION MATRIX                                    ');
console.log('========================================================================================================');
console.log(
  ' #  | ' +
  'Suite Name'.padEnd(50, ' ') + ' | ' +
  'Domain'.padEnd(22, ' ') + ' | ' +
  'Duration'.padStart(8, ' ') + ' | ' +
  'Status'
);
console.log('----+-' + '-'.repeat(50) + '-+-' + '-'.repeat(22) + '-+-' + '-'.repeat(8) + '-+--------');

for (const res of results) {
  const num = String(res.id).padStart(2, ' ');
  const name = res.name.padEnd(50, ' ');
  const domain = res.domain.padEnd(22, ' ');
  const dur = `${res.durationSec}s`.padStart(8, ' ');
  const status = res.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  console.log(`${num}  | ${name} | ${domain} | ${dur} | ${status}`);
}

console.log('----+-' + '-'.repeat(50) + '-+-' + '-'.repeat(22) + '-+-' + '-'.repeat(8) + '-+--------');
console.log(`TOTAL SUITES : ${suites.length}`);
console.log(`PASSED       : ${totalPassed} (${((totalPassed / suites.length) * 100).toFixed(1)}%)`);
console.log(`FAILED       : ${totalFailed}`);
console.log(`TOTAL TIME   : ${totalMasterDurationSec}s`);
console.log('========================================================================================================');

if (totalFailed > 0) {
  console.error(`\n❌ REGRESSION SUITE FAILED: ${totalFailed} suite(s) failed. See error logs above.`);
  process.exit(1);
} else {
  console.log(`\n🎉 SUCCESS: All ${totalPassed} regression suites passed with 100% integrity!`);
  process.exit(0);
}
