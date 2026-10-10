const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

console.log('====================================================');
console.log('🧪 ELWAZEER / BEBYOON SYSTEM - PACKAGE & DEPS AUDIT');
console.log('====================================================\n');

let failed = 0;
let passed = 0;

function check(title, condition, detail = '') {
  if (condition) {
    console.log(`✅ PASS: ${title} ${detail ? '(' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${title} ${detail ? '(' + detail + ')' : ''}`);
    failed++;
  }
}

// 1. Verify Node.js Portable Runtime
const localNode = path.resolve('programs/node/node.exe');
let nodeVersion = '';
let sqliteWorking = false;
try {
  if (fs.existsSync(localNode)) {
    nodeVersion = execFileSync(localNode, ['-v'], { encoding: 'utf8' }).trim();
    const testSqlite = execFileSync(localNode, ['-e', 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); console.log("ok");'], { encoding: 'utf8' }).trim();
    sqliteWorking = testSqlite === 'ok';
  }
} catch (e) {
  nodeVersion = 'Error: ' + e.message;
}
check('Portable Node.js binary is valid', Boolean(nodeVersion && nodeVersion.startsWith('v')), nodeVersion);
check('Portable Node.js built-in SQLite engine works', sqliteWorking);

// 2. Verify PostgreSQL Portable Binaries
const pgCtl = path.resolve('postgresql/bin/pg_ctl.exe');
const postgres = path.resolve('postgresql/bin/postgres.exe');
let pgVersion = '';
try {
  if (fs.existsSync(postgres)) {
    pgVersion = execFileSync(postgres, ['--version'], { encoding: 'utf8' }).trim();
  }
} catch (e) {
  pgVersion = 'Error: ' + e.message;
}
check('PostgreSQL engine is valid', Boolean(pgVersion && pgVersion.includes('PostgreSQL')), pgVersion);

// 3. Verify PostgreSQL Essential DLLs
const binDir = path.resolve('postgresql/bin');
const requiredDlls = [
  'msvcp140.dll', 'vcruntime140.dll', 'libcrypto-3-x64.dll', 'libssl-3-x64.dll',
  'libintl-9.dll', 'libxml2.dll', 'liblz4.dll', 'libzstd.dll', 'icuuc77.dll', 'icuin77.dll'
];
const missingDlls = requiredDlls.filter(d => !fs.existsSync(path.join(binDir, d)));
check('PostgreSQL internal runtime DLLs present', missingDlls.length === 0, missingDlls.length ? `Missing: ${missingDlls.join(', ')}` : 'All present');

// 4. Verify Microsoft Visual C++ 2015-2022 Redistributable Setup Package
const vcRedist = path.resolve('build/vc_redist.x64.exe');
const vcRedistExists = fs.existsSync(vcRedist);
const vcRedistSize = vcRedistExists ? fs.statSync(vcRedist).size : 0;
check('Official Visual C++ Redistributable (vc_redist.x64.exe) bundled in build/', vcRedistExists && vcRedistSize > 20000000, `${(vcRedistSize / (1024 * 1024)).toFixed(1)} MB`);

// 5. Verify NSIS Installer Script
const installerNsh = path.resolve('build/installer.nsh');
const nshContent = fs.existsSync(installerNsh) ? fs.readFileSync(installerNsh, 'utf8') : '';
check('NSIS prerequisite script contains VC++ detection & install logic', nshContent.includes('vc_redist.x64.exe') && nshContent.includes('customInstall'));
check('NSIS installer configures persistent ProgramData with full permissions', nshContent.includes('Bebyoon System') && nshContent.includes('icacls.exe') && nshContent.includes('SetShellVarContext all'));
check('NSIS uninstaller protects user database with explicit retention prompt', nshContent.includes('customUnInstall') && nshContent.includes('MB_DEFBUTTON2'));

// 6. Verify Database Template Directory
const dataDir = path.resolve('programs/data');
check('PostgreSQL template PG_VERSION exists', fs.existsSync(path.join(dataDir, 'PG_VERSION')));
check('PostgreSQL template postgresql.conf exists', fs.existsSync(path.join(dataDir, 'postgresql.conf')));
check('PostgreSQL template pg_hba.conf exists', fs.existsSync(path.join(dataDir, 'pg_hba.conf')));
check('No stale current_logfiles in template', !fs.existsSync(path.join(dataDir, 'current_logfiles')));

// Clean any leftover dev/test postmaster files from working directory
try { if (fs.existsSync(path.join(dataDir, 'postmaster.pid'))) fs.unlinkSync(path.join(dataDir, 'postmaster.pid')); } catch {}
try { if (fs.existsSync(path.join(dataDir, 'postmaster.opts'))) fs.unlinkSync(path.join(dataDir, 'postmaster.opts')); } catch {}

// 7. Verify Frontend Client Build
const distRendererIndex = path.resolve('dist/renderer/index.html');
check('Frontend client production build exists (dist/renderer/index.html)', fs.existsSync(distRendererIndex));

// 8. Verify package.json build configuration
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
check('package.json has perMachine: true', pkg.build?.nsis?.perMachine === true);
check('package.json includes build/installer.nsh', pkg.build?.nsis?.include === 'build/installer.nsh');
check('package.json win target specifies x64', pkg.build?.win?.target?.[0]?.arch?.includes('x64'));

// Verify extraResources exclusions
const extraRes = pkg.build?.extraResources || [];
const pgRes = extraRes.find(r => r.from === 'postgresql');
const programsRes = extraRes.find(r => r.from === 'programs');
const nodeModulesRes = extraRes.find(r => r.from === 'node_modules');

check('package.json excludes duplicate postgresql/installer binaries', Boolean(pgRes?.filter?.includes('!installer/**/*')));
check('package.json excludes stale logs & current_logfiles from programs/data', Boolean(programsRes?.filter?.includes('!data/current_logfiles')));
check('package.json excludes dev native modules (@rolldown, lightningcss)', Boolean(nodeModulesRes?.filter?.includes('!@rolldown/**/*')));

// 9. Verify Generated Production Windows Installer
const installerExe = path.resolve(`dist/${pkg.build.productName} Setup ${pkg.version}.exe`);
const installerExists = fs.existsSync(installerExe);
const installerSize = installerExists ? fs.statSync(installerExe).size : 0;
check('Generated Windows NSIS installer exists', installerExists, installerExists ? `${(installerSize / (1024 * 1024)).toFixed(1)} MB` : 'Missing');

console.log('\n----------------------------------------------------');
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------');

if (failed > 0) {
  process.exit(1);
}
