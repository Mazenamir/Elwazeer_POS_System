const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const ServerSupervisor = require('./server-supervisor');
const { createSystemTray } = require('./tray');

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

let mainWindow = null;
let serverSupervisor = null;
let tray = null;
let isQuiting = false;
let logPath = null;

function setupAutoUpdater() {
  // Never check for updates while running in development mode
  if (!app.isPackaged) {
    log('[UPDATER] Skipped: application is not packaged.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log('[UPDATER] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log(`[UPDATER] Update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', (info) => {
    log(`[UPDATER] No update available. Current version: ${info.version}`);
  });

  autoUpdater.on('download-progress', (progress) => {
    log(
      `[UPDATER] Download progress: ${Math.round(progress.percent)}%`
    );
  });

  autoUpdater.on('update-downloaded', (info) => {
    log(`[UPDATER] Update downloaded: ${info.version}`);
  });

  autoUpdater.on('error', (error) => {
    log(`[UPDATER] Error: ${error.message}`);
  });

  autoUpdater.checkForUpdates().catch((error) => {
    log(`[UPDATER] Check failed: ${error.message}`);
  });
}



function log(msg) {
  console.log(msg);
  if (logPath) {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    } catch { }
  }
}

// Global exception handler
process.on('uncaughtException', (error) => {
  log(`UNCAUGHT EXCEPTION: ${error.message}`);
  dialog.showErrorBox('خطأ في النظام', error.message || 'حدث خطأ غير متوقع');
});

// Performance and memory switches
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-gpu-rasterization');
// Enforce aggressive garbage collection to prevent memory bloat over time
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// Fix input focus freezing after modal alert/confirm
ipcMain.on('fix-focus', () => {
  if (mainWindow) {
    mainWindow.blur();
    mainWindow.focus();
  }
});

const net = require('net');

const isDev = !app.isPackaged && (process.argv.includes('--dev') || process.env.NODE_ENV === 'development');
const isExternalServer = process.argv.includes('--external-server');
const devClientPort = Number(process.env.VITE_DEV_PORT || 5173);

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function checkPortOpen(port) {
  if (await isPortOpen(port, '127.0.0.1')) return true;
  return await isPortOpen(port, 'localhost');
}

async function waitForPort(port, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(url, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isHttpReady(url)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function createWindow(targetUrl, isDevMode = false) {
  if (mainWindow) return;

  log(`Creating browser window for URL: ${targetUrl}`);
  const iconPath = path.join(__dirname, '../renderer/logos/app-icon.png');
  const preloadPath = path.join(__dirname, '../preload/index.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Bebyoon Center System' + (isDevMode ? ' [DEVELOPMENT - VITE HMR]' : ''),
    icon: iconPath,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'persist:bebyoon',
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    if (isDevMode) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  log(`Loading URL: ${targetUrl}`);
  mainWindow.loadURL(targetUrl).catch((err) => {
    log(`Failed to load URL: ${err.message}`);
  });

  // ELEC-01: Navigation security guards - allow local ports (6253, 5173)
  const port = process.env.PORT || '6253';
  const allowedOrigins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://127.0.0.1:${devClientPort}`,
    `http://localhost:${devClientPort}`,
  ]);

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (!allowedOrigins.has(parsed.origin)) {
        event.preventDefault();
        log(`Security: Blocked will-navigate to external URL: ${navigationUrl}`);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (allowedOrigins.has(parsed.origin)) {
        return { action: 'allow' };
      }
    } catch { }
    log(`Security: Blocked window.open to external URL: ${url}`);
    return { action: 'deny' };
  });

  Menu.setApplicationMenu(null);

  mainWindow.on('close', () => {
    isQuiting = true;
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Setup System Tray
  if (!tray) {
    tray = createSystemTray(mainWindow, () => {
      isQuiting = true;
      app.quit();
    }, iconPath);
  }
}

app.on('ready', async () => {
  logPath = path.join(app.getPath('userData'), 'debug.log');

  setupAutoUpdater();

  log('--- APP START (MODULAR ARCHITECTURE) ---');
  if (isDev) log('[DEV MODE] Running in Development mode');
  if (isExternalServer) log('[DEV MODE] External server mode enabled');

  const appRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../../');
  const envPath = path.join(appRoot, '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  const port = process.env.PORT || '6253';
  const serverScript = path.join(__dirname, '../server/server.js');

  const launchUI = async () => {
    if (mainWindow) return;
    if (isDev) {
      log(`[DEV MODE] Waiting for Vite dev server on port ${devClientPort}...`);
      const viteReady = await waitForPort(devClientPort, 15000);
      if (viteReady) {
        log(`[DEV MODE] Vite dev server ready on http://127.0.0.1:${devClientPort}`);
        createWindow(`http://127.0.0.1:${devClientPort}`, true);
        return;
      }
      log(`[DEV MODE] Vite server not detected on port ${devClientPort}. Falling back to Express port ${port}`);
    }
    createWindow(`http://127.0.0.1:${port}`, false);
  };

  if (isExternalServer) {
    log(`Waiting for external server on port ${port}...`);
    const serverReady = await waitForHttp(`http://127.0.0.1:${port}/api/server-time`, 60000);
    if (serverReady) {
      log(`External server on port ${port} is confirmed HTTP healthy.`);
    } else {
      log(`WARNING: External server on port ${port} did not respond to HTTP within 60s.`);
    }
    await launchUI();
  } else {
    serverSupervisor = new ServerSupervisor({
      appRoot,
      serverScript,
      port,
      logFile: logPath,
    });

    serverSupervisor.start(async () => {
      log('Server ready signal received, launching UI...');
      await launchUI();
    });

    // Fallback: If server takes too long to signal 'server-ready', try to open window after 60s
    setTimeout(async () => {
      if (!mainWindow) {
        log('Fallback: Server took too long, attempting to create window anyway...');
        await launchUI();
      }
    }, 60000);
  }
});

app.on('before-quit', () => {
  isQuiting = true;
  if (serverSupervisor) {
    serverSupervisor.stop();
  }
  // Only stop local postgres if Electron itself started its own internal server
  if (!isExternalServer && (!serverSupervisor || !serverSupervisor.isExternal)) {
    try {
      const pgCtl = path.resolve(__dirname, '../../postgresql/bin/pg_ctl.exe');
      const pgData = path.resolve(__dirname, '../../programs/data');
      if (fs.existsSync(pgCtl) && fs.existsSync(pgData)) {
        const { execFileSync } = require('child_process');
        execFileSync(pgCtl, ['stop', '-D', pgData, '-m', 'fast'], { windowsHide: true, timeout: 3000 });
      }
    } catch { }
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    const port = process.env.PORT || '6253';
    const targetUrl = isDev ? `http://127.0.0.1:${devClientPort}` : `http://127.0.0.1:${port}`;
    createWindow(targetUrl, isDev);
  }
});
