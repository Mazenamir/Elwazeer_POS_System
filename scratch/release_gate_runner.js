/**
 * Elwazeer POS System — End-to-End CI Release Gate Runner
 * 
 * Executes the complete Phase 13 release gate pipeline:
 *   Step 1: Run Full Master Regression Suite (12 Core Suites)
 *   Step 2: Run Vite Production Client Build (npm run build)
 *   Step 3: Run Package & Dependencies Integrity Validation (scratch/verify_package.js)
 *   Step 4: Verify Git Working Directory Cleanliness & Release Status
 * 
 * Exit code: 0 on complete pass across all 4 steps; non-zero on any step failure.
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const ALLOW_DIRTY = process.env.ALLOW_DIRTY === 'true' || process.argv.includes('--allow-dirty');

console.log('========================================================================================================');
console.log('                       ELWAZEER POS SYSTEM — CI RELEASE GATE RUNNER                                     ');
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
    name: 'Master Regression Suite Execution (12 Core Suites)',
    command: process.execPath,
    args: [path.resolve(ROOT_DIR, 'scratch/run_all_audit_suites.js')],
    validate: null,
  },
  {
    step: 2,
    name: 'Vite Production Client Build (npm run build)',
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'build'],
    validate: () => {
      const htmlPath = path.resolve(ROOT_DIR, 'dist/renderer/index.html');
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`Production build artifact missing: ${htmlPath}`);
      }
      const stats = fs.statSync(htmlPath);
      if (stats.size === 0) {
        throw new Error(`Production build artifact ${htmlPath} is 0 bytes`);
      }
    },
  },
  {
    step: 3,
    name: 'Package & Runtime Dependencies Integrity Audit',
    command: process.execPath,
    args: [path.resolve(ROOT_DIR, 'scratch/verify_package.js')],
    validate: null,
  },
  {
    step: 4,
    name: 'Git Working Directory Cleanliness & Release Readiness',
    customExec: () => {
      let branchName = 'unknown';
      let commitHash = 'unknown';
      try {
        branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
        commitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
      } catch (e) {
        console.warn(`[WARN] Could not inspect git metadata: ${e.message}`);
      }

      console.log(`   Git Branch: ${branchName} | Commit: ${commitHash}`);

      let statusOutput = '';
      try {
        statusOutput = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
      } catch (err) {
        throw new Error(`Failed to check git status: ${err.message}`);
      }

      if (!statusOutput) {
        console.log('   ✅ Git working tree is completely clean. Zero uncommitted changes.');
        return { clean: true, branch: branchName, commit: commitHash };
      }

      console.log('   ⚠️ Git Status Output:');
      console.log(statusOutput);

      if (ALLOW_DIRTY) {
        console.log('   ⚠️ ALLOW_DIRTY override active. Proceeding despite modified files.');
        return { clean: false, branch: branchName, commit: commitHash, bypassed: true };
      }

      throw new Error(
        `Working directory is dirty. Uncommitted modifications detected:\n${statusOutput}\n` +
        `All release assets must be committed, or execute with --allow-dirty for local preview.`
      );
    },
  },
];

const stepResults = [];

for (const s of gateSteps) {
  console.log(`\n--------------------------------------------------------------------------------------------------------`);
  console.log(`▶ [STEP ${s.step}/4] ${s.name}`);
  console.log(`--------------------------------------------------------------------------------------------------------`);

  const stepStart = Date.now();

  if (s.customExec) {
    try {
      const meta = s.customExec();
      const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);
      console.log(`✅ [STEP ${s.step}/4] PASSED (${stepDurationSec}s)`);
      stepResults.push({ step: s.step, name: s.name, status: 'PASS', durationSec: stepDurationSec, meta });
    } catch (err) {
      const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);
      console.error(`❌ [STEP ${s.step}/4] FAILED (${stepDurationSec}s): ${err.message}`);
      stepResults.push({ step: s.step, name: s.name, status: 'FAIL', durationSec: stepDurationSec, error: err.message });
      printSummaryAndExit(1);
    }
  } else {
    const res = spawnSync(s.command, s.args, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env },
    });

    const stepDurationSec = ((Date.now() - stepStart) / 1000).toFixed(2);

    if (res.status !== 0) {
      console.error(`❌ [STEP ${s.step}/4] FAILED (${stepDurationSec}s, exit code: ${res.status})`);
      stepResults.push({ step: s.step, name: s.name, status: 'FAIL', durationSec: stepDurationSec, exitCode: res.status });
      printSummaryAndExit(res.status || 1);
    }

    if (s.validate) {
      try {
        s.validate();
      } catch (valErr) {
        console.error(`❌ [STEP ${s.step}/4] VALIDATION FAILED (${stepDurationSec}s): ${valErr.message}`);
        stepResults.push({ step: s.step, name: s.name, status: 'FAIL', durationSec: stepDurationSec, error: valErr.message });
        printSummaryAndExit(1);
      }
    }

    console.log(`✅ [STEP ${s.step}/4] PASSED (${stepDurationSec}s)`);
    stepResults.push({ step: s.step, name: s.name, status: 'PASS', durationSec: stepDurationSec });
  }
}

printSummaryAndExit(0);

function printSummaryAndExit(code) {
  const totalGateDurationSec = ((Date.now() - gateStartTime) / 1000).toFixed(2);

  console.log('\n========================================================================================================');
  console.log('                                 CI RELEASE GATE EXECUTION SUMMARY                                      ');
  console.log('========================================================================================================');
  console.log('Step | Gate Description                                          | Duration | Status ');
  console.log('-----+-----------------------------------------------------------+----------+--------');

  for (const r of stepResults) {
    const num = `[${r.step}/4]`.padEnd(4, ' ');
    const desc = r.name.padEnd(57, ' ');
    const dur = `${r.durationSec}s`.padStart(8, ' ');
    const stat = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`${num} | ${desc} | ${dur} | ${stat}`);
  }

  console.log('-----+-----------------------------------------------------------+----------+--------');
  console.log(`TOTAL PIPELINE DURATION : ${totalGateDurationSec}s`);
  console.log(`FINAL GATE VERDICT      : ${code === 0 ? '🎉 RELEASE READY — ALL 4 GATES PASSED' : '❌ GATE FAILED — RELEASE BLOCKED'}`);
  console.log('========================================================================================================\n');

  process.exit(code);
}
