# Bebyoon / Elwazeer POS System — Complete Windows Installer & Deployment Guide

## 1. Executive Summary

This guide documents the enterprise self-contained Windows x64 installer for the **Bebyoon / El-Wazeer POS & Management System** (v1.0.6).
The installer packages all runtime dependencies — including **Electron 30**, **Node.js v24.15.0 portable runtime**, **PostgreSQL 18.4 engine**, **React SPA production client**, and the **Microsoft Visual C++ 2015-2022 x64 Redistributable** — enabling offline, single-click deployment on clean Windows 10/11 x64 systems without any pre-installed development tooling.

---

## 2. Root Cause Analysis of Previous VM Launch Failure

When previously tested on a clean Windows 10 x64 VMware Workstation virtual machine, `Bebyoon System Setup 1.0.6.exe` exhibited the following fatal failure:
```
[Database] PostgreSQL is starting up / performing recovery... (5s.. 10s.. 56s elapsed)
Error: [Database] PostgreSQL failed to accept connections on port 5432 within 60 seconds.
Failed to load URL: ERR_CONNECTION_REFUSED (-102) loading 'http://127.0.0.1:6253/'
```

### The Three Root Causes Identified & Resolved:
1. **Missing Microsoft Visual C++ 2015-2022 (MSVC 14.4x) x64 Runtime on Clean Windows:**
   - PostgreSQL 18.4 was compiled with MSVC `19.44.35226` (Visual Studio 2022).
   - On a clean Windows machine without Visual Studio or C++ runtimes installed, standard OS libraries lack required CRT dependencies.
   - The installer ran with `perMachine: false` (unelevated standard user token), preventing silent installation of `vc_redist.x64.exe` to `C:\Windows\System32`.
   - **Resolution:** Updated NSIS installer configuration with `perMachine: true` (administrative execution level) and an intelligent prerequisite script (`build/installer.nsh`) that detects 64-bit registry keys (`HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64`) and executes `vc_redist.x64.exe /install /quiet /norestart` with verified return codes (`0`, `3010`, `1638`).

2. **Data Directory Co-location in Read-Only / Volatile Program Files:**
   - Electron-builder installed extraResources inside `C:\Program Files\Bebyoon System\resources\programs\data`.
   - In `C:\Program Files`, standard users and PostgreSQL daemon processes lack write permissions. PostgreSQL fails to create WAL logs, temporary files, and lock files, causing immediate startup failure.
   - Furthermore, application updates and re-installs overwrite or delete the installation folder, risking catastrophic data loss.
   - **Resolution:** Separated application code from persistent customer data. Persistent database data, SQLite offline cache, and uploads now reside in `%ProgramData%\Bebyoon System\` (`C:\ProgramData\Bebyoon System\postgres_data`), with full read/write inheritance granted to all local users. Existing customer data is never overwritten on update or uninstallation.

3. **Stale Lock Files, Missing First-Run Template Cloning, and File Sharing Violations:**
   - Previous builds did not clone the database template on first launch to persistent storage.
   - When passing `-l server.log` to `pg_ctl start`, a file sharing violation occurred on Windows between `pg_ctl` and PostgreSQL's built-in `logging_collector`.
   - **Resolution:** Implemented automated first-run template copying via `fs.cpSync`, excluded stale `.log`, `postmaster.pid`, and `postmaster.opts` files from the installer build filter, and removed conflicting `-l` flag to let PostgreSQL `logging_collector` write cleanly to `log/postgresql-*.log`.

---

## 3. Runtime Dependency Matrix

| Component | Purpose | Required at Runtime | Bundling Strategy | Installation / Verification Method |
|---|---|---|---|---|
| **Electron Runtime** | Desktop GUI shell & OS integration | Yes | Bundled via `electron-builder` (v30.5.1) | Packaged in `Bebyoon System.exe` |
| **Node.js Portable Engine** | Standalone background API service | Yes | Bundled in `programs/node/node.exe` (v24.15.0 x64) | Tested via supervisor fork with `ELECTRON_RUN_AS_NODE: '1'` fallback |
| **PostgreSQL 18.4 Engine** | Local relational database server | Yes | Bundled in `postgresql/bin/` (x64) | Tested via `pg_ctl` & `psql` connection check |
| **PostgreSQL Support DLLs** | ICU locales, OpenSSL 3, Zstandard, XML | Yes | Bundled in `postgresql/bin/` | Verified against Windows System32 dependencies |
| **Visual C++ 2015-2022 x64** | MSVC 14.4x C/C++ runtime libraries | Yes | Bundled as `build/vc_redist.x64.exe` (24.4 MB) | NSIS checks registry and installs silently |
| **Node Production Modules** | Express 5, pg 8.20, bcryptjs, JWT | Yes | Bundled in `resources/node_modules/` | Pure JS dependencies, verified at startup |
| **React SPA Client** | Frontend Point of Sale user interface | Yes | Compiled to `dist/renderer/` by Vite | Served by Express backend with SPA fallback |
| **Database Template** | Initial database schema, roles & tables | Yes | Bundled in `resources/programs/data/` | Copied to `%ProgramData%\Bebyoon System\` on first run |
| **Client Configuration** | Port, JWT secret, DB credentials | Yes | Bundled in `resources/.env` | Copied to `%ProgramData%\Bebyoon System\.env` |

---

## 4. Architecture & Data Directory Separation

```
[ Application Installation ] (C:\Program Files\Bebyoon System)
├── Bebyoon System.exe             <-- Main Electron executable
├── resources/
│   ├── app.asar                   <-- Packaged Electron main & preload code
│   ├── dist/renderer/             <-- Compiled React 19 SPA assets
│   ├── server/                    <-- Express 5 backend API
│   ├── shared/                    <-- Shared constants & utilities
│   ├── postgresql/                <-- Portable PostgreSQL 18.4 binaries & DLLs
│   ├── programs/
│   │   ├── node/node.exe          <-- Portable Node.js v24.15.0
│   │   └── data/                  <-- Pristine database template
│   └── node_modules/              <-- Production npm packages

[ Persistent User & Store Data ] (C:\ProgramData\Bebyoon System)
├── postgres_data/                 <-- Live PostgreSQL cluster & databases
│   ├── base/
│   ├── global/
│   ├── pg_wal/
│   └── log/                       <-- PostgreSQL engine rotation logs
├── data/
│   ├── branch.sqlite              <-- Offline cache database
│   └── uploads/products/          <-- Product catalog photos & assets
└── .env                           <-- Store-specific persistent configuration
```

---

## 5. Build and Validation Instructions

### Repeatable Build Commands:
```bash
# 1. Clean verify all dependencies and package configuration
npm run verify:package

# 2. Build frontend React production bundle
npm run build:client

# 3. Compile the standalone Windows x64 NSIS Installer
npm run dist
```

### Generated Build Artifacts:
- **Installer Executable:** `dist/Bebyoon System Setup 1.0.6.exe` (216,243,047 bytes / ~206.2 MB)
- **Blockmap File:** `dist/Bebyoon System Setup 1.0.6.exe.blockmap`
- **Auto-Update Descriptor:** `dist/latest.yml`
- **Unpacked Folder:** `dist/win-unpacked/`

---

## 6. Clean-Machine Acceptance Testing Checklist

When deploying to a clean Windows 10/11 x64 computer or VMware Workstation virtual machine:

- [ ] **1. Clean Environment:** Ensure no Visual C++ Redistributable 2015-2022, Node.js, or PostgreSQL is pre-installed.
- [ ] **2. Offline Installation:** Disconnect internet access (Airplane mode or host-only virtual adapter).
- [ ] **3. Run Installer:** Double click `Bebyoon System Setup 1.0.6.exe`.
  - Accept Windows UAC prompt.
  - Follow NSIS Setup wizard.
  - Observe `Checking Microsoft Visual C++ Redistributable (x64)...` and silent installation.
- [ ] **4. Directory Verification:**
  - Verify `C:\Program Files\Bebyoon System\` contains application binaries.
  - Verify `C:\ProgramData\Bebyoon System\` directory was created with appropriate permissions.
- [ ] **5. First Launch:**
  - Launch `Bebyoon System` from Start Menu or Desktop.
  - Verify PostgreSQL template initializes in `C:\ProgramData\Bebyoon System\postgres_data`.
  - Verify database migrations complete within 5–10 seconds.
  - Verify React POS interface appears automatically.
- [ ] **6. Authentication & Workflows:**
  - Log in using system credentials.
  - Perform sample POS sales, add items to cart, and test barcode scanning.
  - Test inventory update, customer creation, and supplier statement generation.
- [ ] **7. Subsequent Launch & Persistence:**
  - Close the application. Verify `postgres.exe` terminates gracefully.
  - Launch the application again. Confirm that existing sales, customers, and inventory data remain 100% intact.
- [ ] **8. Upgrade & Uninstall Safety:**
  - Re-run installer: Confirm existing database in `%ProgramData%` is NOT overwritten.
  - Run uninstaller: Confirm application binaries in `Program Files` are removed, while `C:\ProgramData\Bebyoon System` is retained.
