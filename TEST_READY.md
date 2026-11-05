# TEST_READY: Elwazeer POS System — Branch Edition (`APP_MODE=branch`)

## Verification Summary
- **Edition**: Branch Standalone Edition (`APP_MODE=branch`, SQLite WAL mode)
- **Current Version**: 1.1.8
- **Packaging Status**: Standalone Windows NSIS Installer Generated & Verified (`dist-branch/Bebyoon Branch Setup 1.1.8.exe`, 172.9 MB)
- **Automated Regression Status**: 100% Passed (8/8 Suites, 293/293 Automated Checks, 0 Failures)
- **Verification Gate Verdict**: **RELEASE READY (ALL GATES PASSED)**

---

## 1. Test Runner & Execution Commands

### Primary Consolidated Branch Test Runner
To execute the complete consolidated branch test suite across all 8 suites and 293 checks:
```powershell
# Directly via node:
node scratch/run_all_branch_tests.js

# Or via npm script:
npm run test:branch

# Or via polymorphic npm test under branch environment:
$env:APP_MODE="branch"; npm test
```

### Packaging & Client Compilation Commands
```powershell
# Client production build:
npm run predist:branch

# Windows standalone branch installer generation:
npm run dist:branch

# Challenger packaging & uninstaller isolation verification:
node scratch/test_m5_challenger2_packaging.js
```

---

## 2. Test Architecture & Tier Matrix

The branch automated test suite is organized into 4 verification tiers spanning 8 suites and 293 automated checks:

| Tier | Suite # | Test File | Domain / Objective | Checks | Result | Duration |
|:---:|:---:|---|---|:---:|:---:|:---:|
| **Tier 1** | **Suite 1** | `scratch/test_m1_acceptance_branch.js` | Acceptance Criteria 1–7, Branch reports, sensitive passwords, drawer math | 38/38 | ✅ PASS | ~10.1s |
| **Tier 1** | **Suite 3** | `scratch/test_m1_sqlite_migrations.js` | SQLite schema migrations, DDL backfills, custom scalar UDFs, PG-to-SQLite translation | 7/7 | ✅ PASS | ~0.16s |
| **Tier 2** | **Suite 4** | `scratch/test_m2_challenger_isolation.js` | Branch data scoping, cross-branch leak prevention, RBAC integrity, timing-safe auth | 47/47 | ✅ PASS | ~6.5s |
| **Tier 3** | **Suite 5** | `scratch/test_m3_sync_resilience.js` | Sync engine resilience, queue pruning syntax, dead-letter retry policy, txMutex | 16/16 | ✅ PASS | ~2.3s |
| **Tier 3** | **Suite 8** | `scratch/test_m4_adversarial_edge_cases.js` | Concurrency collisions, SQLite lock recovery, WAL contention, transient disconnects | 40/40 | ✅ PASS | ~9.8s |
| **Tier 4** | **Suite 2** | `scratch/test_cash_drawer_and_payroll_invariants.js` | Cash drawer settlement (Visa/Instapay exclusion), 268h payroll, 36-sheet Excel export | 32/32 | ✅ PASS | ~3.0s |
| **Tier 4** | **Suite 6** | `scratch/test_m4_e2e_daily_lifecycle.js` | Full daily business lifecycle: POS sales, inventory deduction, attendance, drawer closing | 69/69 | ✅ PASS | ~7.5s |
| **Tier 4** | **Suite 7** | `scratch/test_m4_adversarial_accounting_stress.js` | High-frequency sales, multi-item discounts, negative cash guards, refund settlement | 44/44 | ✅ PASS | ~8.8s |
| **TOTAL** | **8 Suites** | **Consolidated Matrix** | **All R1–R6 Requirements & Acceptance Criteria** | **293/293** | **✅ 100%** | **~48.9s** |

---

## 3. Feature Coverage Checklist (PROJECT.md § Feature Inventory)

| Feature ID | Feature Name | Source File(s) Modified / Implemented | Verifying Suite(s) | Status |
|:---:|---|---|---|:---:|
| **F1** | SQLite Query Translation & Polyfills | `src/server/database/connection.js` | Suite 1, Suite 3, Suite 4 | ✅ Verified |
| **F2** | Rental Date Subtraction Translation | `src/server/database/connection.js` | Suite 1, Suite 3, Suite 6 | ✅ Verified |
| **F3** | SQLite Baseline Schema & Migrations Parity | `src/server/database/migrator.js` | Suite 1, Suite 3 | ✅ Verified |
| **F4** | Branch Scoping & Admin Resolution | `src/server/middleware/branchScope.middleware.js` | Suite 1, Suite 4 | ✅ Verified |
| **F5** | Sensitive Passwords Configuration & Cashier Returns | `src/server/modules/auth/sensitivePassword.service.js`, `settings` table | Suite 1, Suite 4, Suite 6 | ✅ Verified |
| **F6** | RBAC Integrity & Catalog Data Privacy | `src/server/modules/sync/sync.service.js`, `catalog.service.js` | Suite 4 | ✅ Verified |
| **F7** | Queue Pruning Engine-Safe Syntax | `src/server/modules/sync/sync.service.js` | Suite 5 | ✅ Verified |
| **F8** | Sync Diagnostics & Dead-Letter Retry Policy | `src/server/modules/sync/sync.service.js` | Suite 5 | ✅ Verified |
| **F9** | Catalog Import Transaction Mutex Synchronization | `src/server/modules/sync/sync.service.js` | Suite 5, Suite 8 | ✅ Verified |
| **F10** | Missing Offline Queue Handlers Integration | `src/server/modules/tailoring/`, `src/server/modules/hr/`, `src/server/modules/sales/` | Suite 5, Suite 6 | ✅ Verified |
| **F11** | Master Sync Replay Idempotency & Conflict Guards | `src/server/modules/sync/sync.service.js` | Suite 5 | ✅ Verified |
| **F12** | Core Operations SQLite Compatibility | `src/server/modules/tailoring/tailoring.service.js`, `reports.service.js` | Suite 1, Suite 2, Suite 6, Suite 7 | ✅ Verified |
| **F13** | End-to-End Operational Verification | `src/server/modules/sales/`, `src/server/modules/hr/`, `reports.service.js` | Suite 6 | ✅ Verified |
| **F14** | Comprehensive Regression Suite & Master Test Runner | `scratch/run_all_branch_tests.js`, `package.json` | Suite 1–8 (All 293 Checks) | ✅ Verified |
| **F15** | Desktop Packaging & Uninstaller Hardening | `package.json`, `.env.branch`, `build/installer.nsh` | Challenger 2 (73/73 Checks) | ✅ Verified |
| **F16** | Standalone Desktop Build & Package Verification | `electron-builder.branch.json`, `dist-branch/` | Milestone M6 Distributable Verification | ✅ Verified |

---

## 4. Standalone Windows Distributable Verification (`dist-branch/`)

### Generated Packaging Artifacts
- **Installer Binary**: `dist-branch/Bebyoon Branch Setup 1.1.8.exe`
  - **File Size**: 172,925,618 bytes (~164.9 MB)
  - **SHA-512**: `MwQHBIu4ZznxG5NJiU8NdmTe+dLdGK+p9P+8H2/g8Wa03TfDeQFZVUn8ZpD5g30ftwNdpiSv6kr4uaLabNoLfQ==`
  - **Target Arch**: Windows x64 (NSIS per-machine installer)
  - **Product Name**: `Bebyoon Branch System`
  - **Application ID**: `com.bebyoon.branch.system`
- **Blockmap Metadata**: `dist-branch/Bebyoon Branch Setup 1.1.8.exe.blockmap` (181,947 bytes)
- **Auto-Update Metadata**: `dist-branch/branch.yml` (release date: `2026-11-05T10:40:06.923Z`)
- **Unpacked Application Directory**: `dist-branch/win-unpacked/`
  - Main Executable: `dist-branch/win-unpacked/Bebyoon Branch System.exe`

### ExtraResources Bundle Integrity
All 6 resource mappings from `electron-builder.branch.json` were bundled and verified:
1. `server`: Backend REST API (`src/server` -> `dist-branch/win-unpacked/resources/server/`)
2. `shared`: Shared utilities (`src/shared` -> `dist-branch/win-unpacked/resources/shared/`)
3. `dist/renderer`: Production React frontend with `index.html` and assets bundle (`dist/renderer` -> `dist-branch/win-unpacked/resources/dist/renderer/`)
4. `programs/node`: Portable Node.js v24.15.0 with built-in `node:sqlite` (`programs/node` -> `dist-branch/win-unpacked/resources/programs/node/`)
5. `.env`: Sanitized branch configuration with local `SYNC_SERVER_URL=http://127.0.0.1:6253` and no leaked public IPs (`.env.branch` -> `dist-branch/win-unpacked/resources/.env`)
6. `node_modules`: Pruned production dependencies excluding dev toolchains (`vite`, `electron-builder`, `tailwindcss`, `@rolldown`, `.bin`)

### NSIS Uninstaller Safety & Filesystem Isolation
- Uninstaller dynamically resolves `$R1` via `$R0\${PRODUCT_NAME}`, targeting `$ProgramData\Bebyoon Branch System`.
- Guarantees zero cross-deletion of Master edition databases (`$ProgramData\Bebyoon System\postgres_data`), verified empirically via mock filesystem simulation in `scratch/test_m5_challenger2_packaging.js`.

---

## 5. Verification Protocol for Independent Auditors

To independently replicate and verify all milestone results from a clean clone:

```powershell
# 1. Run the consolidated test suite:
node scratch/run_all_branch_tests.js
# Expected output: All 8 suites pass, 293/293 checks passed, exit code 0.

# 2. Run the packaging configuration verification suite:
node scratch/test_m5_challenger2_packaging.js
# Expected output: All 5 suites pass, 73/73 checks passed, exit code 0.

# 3. Compile client assets:
npm run predist:branch
# Expected output: Vite compiles production assets into dist/renderer in < 5 seconds.

# 4. Check installer artifact presence:
Get-Item "dist-branch\Bebyoon Branch Setup 1.1.8.exe"
# Expected output: File size ~172.9 MB, valid executable.
```
