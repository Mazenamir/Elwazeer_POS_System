/**
 * Elwazeer POS System — End-to-End CI Release Gate Runner
 *
 * Executes ALL comprehensive verification gates locally on the exact HEAD commit and writes
 * a signed local stamp (`dist/.release-gate-stamp.json`) required by upload_to_github_release.js.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const ALLOW_DIRTY = process.env.ALLOW_DIRTY === 'true' || process.argv.includes('--allow-dirty');

console.log('========================================================================================================');
console.log('                       ELWAZEER POS SYSTEM — FULL CI RELEASE GATE RUNNER                                ');
console.log('========================================================================================================');
console.log(`Execution Environment : Node.js ${process.version} (${process.platform} ${process.arch})`);
console.log(`Working Directory     : ${ROOT_DIR}`);
console.log(`Start Time            : ${new Date().toISOString()}`);
console.log(`Allow Dirty Tree      : ${ALLOW_DIRTY ? 'YES (override)' : 'NO (strict cleanliness required)'}`);
console.log('========================================================================================================\n');

const gateStartTime = Date.now();
const gateSteps = [
  {
    step: 1,
    name: 'Git Working Directory Cleanliness & Commit Resolution',
    customExec: () => {
      const branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
      const commitHash = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
      console.log(`   Git Branch: ${branchName} | Commit: ${commitHash}`);

      const statusOutput = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
      if (!statusOutput) {
        console.log('   ✅ Git working tree is completely clean.');
        return { clean: true, branch: branchName, commit: commitHash };
      }

      if (ALLOW_DIRTY) {
        console.log('   ⚠️ ALLOW_DIRTY override active. Proceeding despite modified files.');
        return { clean: false, branch: branchName, commit: commitHash, bypassed: true };
      }

      throw new Error(`Working directory is dirty. Commit all changes before running the release gate:\n${statusOutput}`);
    },
  },
  {
    step: 2,
    name: 'Vite Production Client Build & Static TDZ/Contract Audit',
    execCmd: 'npm run build:client && node scratch/audit_contracts_and_sql.js && node scratch/verify_all_pages_and_routes.js',
    validate: () => {
      const htmlPath = path.resolve(ROOT_DIR, 'dist/renderer/index.html');
      if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) {
        throw new Error(`Production build artifact missing or empty: ${htmlPath}`);
      }
    },
  },
  {
    step: 3,
    name: 'Master Regression Suites (20 Core Suites)',
    execCmd: `"${process.execPath}" scratch/run_all_audit_suites.js`,
  },
  {
    step: 4,
    name: 'Consolidated Branch SQLite Suites (6 Suites / 76 Checks)',
    execCmd: `"${process.execPath}" scratch/run_all_branch_tests.js`,
  },
  {
    step: 5,
    name: 'Two-Way & Inter-Branch <-> PG Sync E2E Suites',
    execCmd: `"${process.execPath}" scratch/test_two_way_sync_accountant.js && "${process.execPath}" scratch/test_interbranch_pg_sync.js`,
  },
  {
    step: 6,
    name: 'Full-System Dual-Mode HTTP E2E Audit (Master PG + Branch SQLite)',
    execCmd: `"${process.execPath}" scratch/test_full_system_http_e2e.js`,
  },
  {
    step: 7,
    name: 'Concurrency Race, Idempotency & Edge Fuzz Suite',
    execCmd: `"${process.execPath}" scratch/test_concurrency_and_edge_fuzz.js`,
  },
  {
    step: 8,
    name: 'Live Interactive Electron UI E2E & Package Audit',
    execCmd: `npx electron scratch/test_live_ui_e2e_electron.js && "${process.execPath}" scratch/verify_package.js`,
  },
];

const stepResults = [];
let gitMeta = {};

for (const s of gateSteps) {
  console.log(`\n--------------------------------------------------------------------------------------------------------`);
  console.log(`▶ [STEP ${s.step}/${gateSteps.length}] ${s.name}`);
  console.log(`--------------------------------------------------------------------------------------------------------`);

  const stepStart = Date.now();

  if (s.customExec) {
    try {
      const meta = s.customExec();
      gitMeta = meta || gitMeta;
      const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);
      console.log(`✅ [STEP ${s.step}/${gateSteps.length}] PASSED (${stepDurationSec}s)`);
      stepResults.push({ step: s.step, name: s.name, status: 'PASS', durationSec: stepDurationSec, meta });
    } catch (err) {
      const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);
      console.error(`❌ [STEP ${s.step}/${gateSteps.length}] FAILED (${stepDurationSec}s): ${err.message}`);
      stepResults.push({ step: s.step, name: s.name, status: 'FAIL', durationSec: stepDurationSec, error: err.message });
      printSummaryAndExit(1);
    }
  } else {
    try {
      execSync(s.execCmd, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: { ...process.env },
      });
    } catch (cmdErr) {
      const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);
      console.error(`❌ [STEP ${s.step}/${gateSteps.length}] FAILED (${stepDurationSec}s, error: ${cmdErr.message})`);
      stepResults.push({ step: s.step, name: s.name, status: 'FAIL', durationSec: stepDurationSec, exitCode: cmdErr.status || 1 });
      printSummaryAndExit(cmdErr.status || 1);
    }

    const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);

    if (s.validate) {
      try {
        s.validate();
      } catch (valErr) {
        console.error(`❌ [STEP ${s.step}/${gateSteps.length}] VALIDATION FAILED (${stepDurationSec}s): ${valErr.message}`);
        stepResults.push({ step: s.step, name: s.name, status: 'FAIL', durationSec: stepDurationSec, error: valErr.message });
        printSummaryAndExit(1);
      }
    }

    console.log(`✅ [STEP ${s.step}/${gateSteps.length}] PASSED (${stepDurationSec}s)`);
    stepResults.push({ step: s.step, name: s.name, status: 'PASS', durationSec: stepDurationSec });
  }
}

// Write verified gate stamp for HEAD commit
try {
  const stampDir = path.resolve(ROOT_DIR, 'dist');
  fs.mkdirSync(stampDir, { recursive: true });
  fs.writeFileSync(
    path.join(stampDir, '.release-gate-stamp.json'),
    JSON.stringify({
      commit: gitMeta.commit || execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim(),
      branch: gitMeta.branch || 'master',
      clean: Boolean(gitMeta.clean),
      gatesPassed: true,
      passedAt: new Date().toISOString(),
      steps: stepResults.map((r) => ({ step: r.step, name: r.name, status: r.status, durationSec: r.durationSec })),
    }, null, 2),
    'utf8'
  );
} catch (err) {
  console.warn('Warning: could not write dist/.release-gate-stamp.json:', err.message);
}

printSummaryAndExit(0);

function printSummaryAndExit(code) {
  const totalGateDurationSec = ((Date.now() - gateStartTime) / 1000).toFixed(2);

  console.log('\n========================================================================================================');
  console.log('                                 CI RELEASE GATE EXECUTION SUMMARY                                      ');
  console.log('========================================================================================================');
  console.log('Step | Gate Description                                                 | Duration | Status ');
  console.log('-----+------------------------------------------------------------------+----------+--------');

  for (const r of stepResults) {
    const num = `[${r.step}/${gateSteps.length}]`.padEnd(4, ' ');
    const desc = r.name.padEnd(64, ' ').slice(0, 64);
    const dur = `${r.durationSec}s`.padStart(8, ' ');
    const stat = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`${num} | ${desc} | ${dur} | ${stat}`);
  }

  console.log('-----+------------------------------------------------------------------+----------+--------');
  console.log(`TOTAL PIPELINE DURATION : ${totalGateDurationSec}s`);
  console.log(`FINAL GATE VERDICT      : ${code === 0 ? '🎉 RELEASE READY — ALL 8 GATES PASSED' : '❌ GATE FAILED — RELEASE BLOCKED'}`);
  console.log('========================================================================================================\n');

  process.exit(code);
}
