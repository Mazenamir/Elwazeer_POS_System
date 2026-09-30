const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
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

function log(msg) {
  console.log(msg);
  if (logPath) {
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    } catch {}
  }
}

// Global exception handler
process.on('uncaughtException', (error) => {
  log(`UNCAUGHT EXCEPTION: ${error.message}`);
  dialog.showErrorBox('خطأ في النظام', error.message || 'حدث خطأ غير متوقع');
});

// Disable native win occlusion to prevent windows from freezing background processes
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

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

function createWindow(port) {
  if (mainWindow) return;

  log('Creating browser window...');
  const iconPath = path.join(__dirname, '../renderer/logos/app-icon.png');
  const preloadPath = path.join(__dirname, '../preload/index.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Bebyoon Center System',
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
  });

  const appUrl = `http://127.0.0.1:${port}`;
  log(`Loading URL: ${appUrl}`);
  mainWindow.loadURL(appUrl).catch((err) => {
    log(`Failed to load URL: ${err.message}`);
  });

  Menu.setApplicationMenu(null);

  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
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

app.on('ready', () => {
  logPath = path.join(app.getPath('userData'), 'debug.log');
  log('--- APP START (MODULAR ARCHITECTURE) ---');

  const appRoot = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../../');
  const envPath = path.join(appRoot, '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  const port = process.env.PORT || '6253';
  const serverScript = path.join(__dirname, '../server/server.js');

  serverSupervisor = new ServerSupervisor({
    appRoot,
    serverScript,
    port,
    logFile: logPath,
  });

  serverSupervisor.start(() => {
    log('Server ready signal received, launching UI...');
    createWindow(port);
  });

  // Fallback: If server takes too long to signal 'server-ready', try to open window after 15s
  setTimeout(() => {
    if (!mainWindow) {
      log('Fallback: Server took too long, attempting to create window anyway...');
      createWindow(port);
    }
  }, 15000);
});

app.on('before-quit', () => {
  isQuiting = true;
  if (serverSupervisor) {
    serverSupervisor.stop();
  }
});

app.on('window-all-closed', () => {
  // Keep app running in the system tray
});

app.on('activate', () => {
  if (mainWindow === null) {
    const port = process.env.PORT || '6253';
    createWindow(port);
  }
});
