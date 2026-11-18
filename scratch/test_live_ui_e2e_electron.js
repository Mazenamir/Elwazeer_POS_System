/**
 * Live Full-Stack Interactive Electron UI E2E Stress Test
 * Spawns the real Express server under Node.js (which has built-in node:sqlite),
 * opens the built dist/renderer UI inside Electron Chromium, and drives real interactive UI flows.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

if (process.argv.includes('--server-only')) {
  // Server child running under Node.js (supports node:sqlite)
  const tmpDir = process.env.E2E_TMP_DIR;
  process.env.APP_MODE = 'branch';
  process.env.DATA_DIR = tmpDir;
  process.env.BRANCH_SQLITE_PATH = path.join(tmpDir, 'branch.sqlite');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-live-ui-jwt-secret';

  const jwt = require('jsonwebtoken');
  const config = require('../src/server/config/env');
  const db = require('../src/server/database/connection');
  const { runBranchSqliteMigrations } = require('../src/server/database/migrator');
  const expressApp = require('../src/server/app');
  const { getCairoDateTimeParts } = require('../src/shared/utils/date');

  (async () => {
    await runBranchSqliteMigrations();
    const { date: todayDate } = getCairoDateTimeParts();
    const adminRow = db.sqlite.prepare("SELECT id, username, role, branch_id, token_version FROM users WHERE role = 'admin' LIMIT 1").get();
    const empInfo = db.sqlite.prepare("INSERT INTO employees (name, position, branch_id, basic_salary, status) VALUES ('بائع UI', 'بائع', 1, 4000, 'active')").run();
    const empId = Number(empInfo.lastInsertRowid);
    db.sqlite.prepare("INSERT INTO attendance (employee_id, date, check_in) VALUES (?, ?, '09:00')").run(empId, todayDate);

    const invInfo = db.sqlite.prepare("INSERT INTO inventory (name, category, color, price, cost_price, stock_level, gender, is_deleted) VALUES ('بدلة اختبار UI', 'SUIT', 'كحلي', 1000, 500, 5, 'men', 0)").run();
    const invId = Number(invInfo.lastInsertRowid);
    db.sqlite.prepare('INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES (?, 1, 5)').run(invId);
    db.sqlite.prepare("INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id) VALUES (?, '48', 'كحلي', 3, 1)").run(invId);
    db.sqlite.prepare("INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id) VALUES (?, '50', 'كحلي', 2, 1)").run(invId);

    const token = jwt.sign({
      id: adminRow.id,
      username: adminRow.username,
      role: 'admin',
      branch_id: adminRow.branch_id || 1,
      branch_scope: 'all',
      token_version: adminRow.token_version || 1,
      permissions: ['*'],
    }, config.JWT_SECRET, { expiresIn: '1h' });

    const server = http.createServer(expressApp);
    server.listen(0, '127.0.0.1', () => {
      console.log(`E2E_READY:${JSON.stringify({ port: server.address().port, token })}`);
    });
    process.on('SIGTERM', () => {
      server.close();
      try { db.sqlite?.close(); } catch {}
      process.exit(0);
    });
  })();
} else {
  const { app: electronApp, BrowserWindow } = require('electron');

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForSelector(win, fnBody, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await win.webContents.executeJavaScript(`(() => { ${fnBody} })()`).catch(() => false);
      if (ok) return ok;
      await sleep(150);
    }
    return null;
  }

  function findNodeExe() {
    const localNode = path.resolve(__dirname, '../programs/node/node.exe');
    if (fs.existsSync(localNode)) return localNode;
    return 'node';
  }

  electronApp.whenReady().then(async () => {
    const tmpDir = path.resolve(__dirname, `../data/test_live_ui_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const serverProc = spawn(findNodeExe(), [__filename, '--server-only'], {
      env: { ...process.env, E2E_TMP_DIR: tmpDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const readyInfo = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('Server startup timeout: ' + buf)), 15000);
      serverProc.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        const line = buf.split(/\r?\n/).find((l) => l.startsWith('E2E_READY:'));
        if (line) {
          clearTimeout(timer);
          resolve(JSON.parse(line.slice('E2E_READY:'.length)));
        }
      });
      serverProc.stderr.on('data', (d) => { buf += d.toString(); });
      serverProc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited early (${code}): ${buf}`));
      });
    });

    const baseUrl = `http://127.0.0.1:${readyInfo.port}`;
    const token = readyInfo.token;

    const win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const consoleErrors = [];
    const networkFailures = [];

    win.webContents.on('console-message', (_e, level, msg) => {
      if (/Cannot access .* before initialization|ReferenceError|Uncaught/i.test(msg)) {
        consoleErrors.push(`[level=${level}] ${msg}`);
      }
    });

    win.webContents.session.webRequest.onCompleted({ urls: [`${baseUrl}/api/*`] }, (details) => {
      if (details.statusCode >= 500 || details.statusCode === 404) {
        networkFailures.push(`${details.method} ${details.url} -> HTTP ${details.statusCode}`);
      }
    });

    let exitCode = 0;
    try {
      await win.loadURL(`${baseUrl}/login`);
      await win.webContents.executeJavaScript(`
        localStorage.setItem('auth_token', ${JSON.stringify(token)});
        sessionStorage.setItem('auth_token', ${JSON.stringify(token)});
      `);

      // 1. Suppliers / Inventory displays product stock 5
      await win.loadURL(`${baseUrl}/suppliers`);
      const foundInSuppliers = await waitForSelector(win, `return document.body.innerText.includes('بدلة اختبار UI') && document.body.innerText.includes('5')`);
      assert.ok(foundInSuppliers, 'Suppliers page did not render test product stock 5');
      console.log('✓ [UI 1/5] Suppliers/Inventory page renders live product stock cleanly');

      // 2. POS interactive flow: pick size 50 -> test debt auto-0 -> test manual split + remaining debt -> checkout
      await win.loadURL(`${baseUrl}/pos`);
      const foundInPos = await waitForSelector(win, `return document.body.innerText.includes('بدلة اختبار UI')`);
      assert.ok(foundInPos, 'POS did not render test product');

      await win.webContents.executeJavaScript(`(() => {
        const h4 = [...document.querySelectorAll('h4')].find(el => el.innerText.includes('بدلة اختبار UI'));
        if (h4) h4.click();
      })()`);

      const sizeModalReady = await waitForSelector(win, `return document.body.innerText.includes('اختر اللون والمقاس') && document.body.innerText.includes('50')`);
      assert.ok(sizeModalReady, 'Size selection modal did not open with size 50');

      await win.webContents.executeJavaScript(`(() => {
        const btn50 = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('50') && (b.innerText || '').includes('متوفر'));
        if (btn50) btn50.click();
      })()`);
      await sleep(300);

      await win.webContents.executeJavaScript(`(() => {
        const checkoutBtn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('إتمام البيع') || (b.innerText || '').includes('الدفع والحفظ') || (b.innerText || '').includes('دفع'));
        if (checkoutBtn) checkoutBtn.click();
      })()`);

      const checkoutModalOpen = await waitForSelector(win, `return document.body.innerText.includes('طريقة الدفع') && document.body.innerText.includes('آجل (مديونية)')`);
      assert.ok(checkoutModalOpen, 'Checkout modal with آجل (مديونية) did not open');

      await win.webContents.executeJavaScript(`(() => {
        const debtBtn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('آجل (مديونية)'));
        if (debtBtn) debtBtn.click();
      })()`);
      await sleep(150);
      const debtPaidVal = await win.webContents.executeJavaScript(`(() => {
        const inp = [...document.querySelectorAll('input[type="number"]')].find(i => i.placeholder && i.placeholder.includes('آجل'));
        return inp ? inp.value : null;
      })()`);
      assert.strictEqual(debtPaidVal, '0', `Expected paidAmount='0' after clicking آجل, got '${debtPaidVal}'`);

      await win.webContents.executeJavaScript(`(() => {
        const splitBtn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('دفع مجزأ'));
        if (splitBtn) splitBtn.click();
      })()`);

      const splitReady = await waitForSelector(win, `return document.body.innerText.includes('حساب تلقائي للمتبقي') && document.body.innerText.includes('كتابة يدوية حرة')`);
      assert.ok(splitReady, 'Split payment Auto/Manual controls did not render');

      await win.webContents.executeJavaScript(`(() => {
        const setNative = (el, val) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const manualBtn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').includes('كتابة يدوية حرة'));
        if (manualBtn) manualBtn.click();

        const nameInp = [...document.querySelectorAll('input')].find(i => (i.placeholder || '').includes('اسم العميل'));
        const phoneInp = [...document.querySelectorAll('input')].find(i => (i.placeholder || '').includes('01'));
        if (nameInp) setNative(nameInp, 'عميل UI');
        if (phoneInp) setNative(phoneInp, '01033445566');

        const split1 = [...document.querySelectorAll('input[type="number"]')].find(i => (i.placeholder || '').includes('للوسيلة الأولى'));
        const split2 = [...document.querySelectorAll('input[type="number"]')].find(i => (i.placeholder || '').includes('للوسيلة الثانية'));
        if (split1) setNative(split1, '300');
        if (split2) setNative(split2, '200');
      })()`);
      await sleep(200);

      const manualSplitVals = await win.webContents.executeJavaScript(`(() => {
        const split1 = [...document.querySelectorAll('input[type="number"]')].find(i => (i.placeholder || '').includes('للوسيلة الأولى'));
        const split2 = [...document.querySelectorAll('input[type="number"]')].find(i => (i.placeholder || '').includes('للوسيلة الثانية'));
        return { v1: split1?.value, v2: split2?.value, hasDebtNote: document.body.innerText.includes('متبقي آجل على العميل') };
      })()`);
      assert.strictEqual(manualSplitVals.v1, '300', 'Manual mode must not overwrite splitAmount1');
      assert.strictEqual(manualSplitVals.v2, '200', 'Manual mode must preserve splitAmount2');
      assert.ok(manualSplitVals.hasDebtNote, 'Expected remaining debt summary note in Split payment');

      await win.webContents.executeJavaScript(`(() => {
        const form = [...document.querySelectorAll('form')].find(f => f.innerText.includes('الوسيلة الأولى'));
        if (form) form.requestSubmit();
      })()`);

      const orderSaved = await waitForSelector(win, `return (document.body.innerText || '').includes('تم تسجيل وحفظ الفاتورة') || document.body.innerText.includes('فاتورة مبيعات')`);
      assert.ok(orderSaved, 'POS interactive split+debt order did not complete');
      console.log('✓ [UI 2/5] POS size pick, debt auto-0, manual split+debt & checkout submission verified');

      // 3. Employee Sales Report Modal displays the sale
      await win.loadURL(`${baseUrl}/employees`);
      const empLoaded = await waitForSelector(win, `return document.body.innerText.includes('بائع UI')`);
      assert.ok(empLoaded, 'Employees page did not load seller');
      await win.webContents.executeJavaScript(`(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.title && b.title.includes('سجل مبيعات'));
        if (btn) btn.click();
      })()`);
      const salesModalLoaded = await waitForSelector(win, `return document.body.innerText.includes('عميل UI') && document.body.innerText.includes('1,000')`);
      assert.ok(salesModalLoaded, 'Employee Sales Report modal did not show live POS sale');
      console.log('✓ [UI 3/5] Employee Sales Report UI modal renders real sale immediately');

      // 4. Visit all other operational pages against live server
      for (const route of ['/dashboard', '/expenses', '/alterations', '/tailoring', '/rentals', '/rental-inventory', '/customers', '/reports', '/barcodes', '/worn-products', '/settings']) {
        await win.loadURL(`${baseUrl}${route}`);
        await sleep(350);
        const st = await win.webContents.executeJavaScript(`(() => {
          const text = document.body?.innerText || '';
          return {
            hasBoundary: text.includes('حدث خطأ أثناء تحميل النظام'),
            rootLen: (document.getElementById('root')?.innerHTML || '').length,
          };
        })()`);
        assert.ok(!st.hasBoundary && st.rootLen > 0, `Route ${route} crashed or rendered empty!`);
      }
      console.log('✓ [UI 4/5] All 11 additional pages rendered cleanly against live Express API');

      assert.strictEqual(consoleErrors.length, 0, `Console TDZ/Reference errors: ${consoleErrors.join('; ')}`);
      assert.strictEqual(networkFailures.length, 0, `HTTP 404/500 API errors during UI E2E: ${networkFailures.join('; ')}`);
      console.log('✓ [UI 5/5] Zero console JS errors and zero HTTP 404/500 responses');
    } catch (err) {
      console.error('LIVE UI E2E FAILED:', err);
      if (consoleErrors.length) console.error('Console errors:', consoleErrors);
      if (networkFailures.length) console.error('Network 404/500:', networkFailures);
      exitCode = 1;
    } finally {
      win.destroy();
      try { serverProc.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
        electronApp.exit(exitCode);
      }, 300);
    }
  });
}
