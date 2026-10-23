const { execSync } = require('child_process');
const path = require('path');

const suites = [
  { name: 'Cash Drawer Settlement & Payroll Invariants', script: 'scratch/test_cash_drawer_and_payroll_invariants.js' },
  { name: 'Electron Auto-Updater Lifecycle & Concurrency', script: 'scratch/test_auto_updater_lifecycle.js' },
  { name: 'Concurrency, Atomicity & Financial Precision', script: 'scratch/concurrency_and_atomicity_tests.js' },
  { name: 'Deep Integration & RBAC Flows', script: 'scratch/deep_integration_tests.js' },
  { name: 'Adversarial Edge Cases & Return Reconciliation', script: 'scratch/review_deep_verification_tests.js' },
  { name: 'Architecture & Security Hardening Verification', script: 'scratch/verification_tests.js' },
  { name: 'Inventory & Multi-Variant Warehouse Suite', script: 'scratch/test_inventory_suite.js' },
  { name: 'Split Sales Payments & Financial Reports', script: 'scratch/test_split_sales_in_reports.js' },
  { name: 'Tailoring Split Payments & Employees Allocation', script: 'scratch/test_tailoring_split_and_employees.js' },
  { name: 'Rentals, Hardware Barcodes & Availability Reservations', script: 'scratch/test_rentals_barcodes_reservations.js' },
  { name: 'Prior Defect Audit & Synchronization Integrity', script: 'scratch/test_prior_defects.js' },
  { name: 'Suppliers Sorting, Dates & Lifecycle Integrity', script: 'scratch/reviewer_r4_comprehensive_check.js' },
  { name: 'Sentinel Independent Victory Audit', script: 'scratch/sentinel_independent_victory_audit.js' },
  { name: 'Frontend Pages, Navigation & Routing Wiring', script: 'scratch/verify_all_pages_and_routes.js' },
  { name: 'Windows Package, NSIS & Runtime Dependencies', script: 'scratch/verify_package.js' },
];

console.log('================================================================');
console.log('       ELWAZEER POS SYSTEM — FULL SYSTEM QUALITY AUDIT SUITE    ');
console.log('================================================================\n');

let totalPassedSuites = 0;
let totalFailedSuites = 0;
const results = [];

for (const suite of suites) {
  process.stdout.write(`⏳ Running: ${suite.name} ... `);
  const start = Date.now();
  try {
    const out = execSync(`node ${suite.script}`, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const duration = Date.now() - start;
    console.log(`✅ PASSED (${duration}ms)`);
    totalPassedSuites++;
    results.push({ name: suite.name, status: 'PASS', duration, output: out.trim() });
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`❌ FAILED (${duration}ms)`);
    console.error(err.stdout || err.stderr || err.message);
    totalFailedSuites++;
    results.push({ name: suite.name, status: 'FAIL', duration, error: err.stdout || err.stderr || err.message });
  }
}

console.log('\n================================================================');
console.log(`AUDIT RUN SUMMARY: ${totalPassedSuites}/${suites.length} Suites Passed, ${totalFailedSuites} Failed`);
console.log('================================================================');

if (totalFailedSuites > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
