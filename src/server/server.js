const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const app = require('./app');
const config = require('./config/env');
const db = require('./database/connection');
const { runMigrations } = require('./database/migrator');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
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

function getPostmasterPid(pidPath) {
  try {
    if (!fs.existsSync(pidPath)) return null;
    const content = fs.readFileSync(pidPath, 'utf8');
    const firstLine = content.split('\n')[0].trim();
    const pid = parseInt(firstLine, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isPostgresProcessRunning(pid) {
  if (!pid) return false;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FI', 'IMAGENAME eq postgres.exe', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.includes('postgres.exe');
  } catch {
    return false;
  }
}

function checkPgCtlStatus(pgCtl, pgData) {
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(pgCtl, ['status', '-D', pgData], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.includes('server is running');
  } catch {
    return false;
  }
}

async function waitForPostgresReady(timeoutMs = 60000, pollIntervalMs = 500) {
  const startTime = Date.now();
  let lastLogTime = startTime;

  while (Date.now() - startTime < timeoutMs) {
    if (await db.isPrimaryDbAvailable()) {
      return true;
    }

    if (Date.now() - lastLogTime >= 5000) {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Database] PostgreSQL is starting up / performing recovery... (${elapsedSec}s elapsed)`);
      lastLogTime = Date.now();
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return false;
}

async function ensurePostgresRunning() {
  if (config.IS_BRANCH_MODE) return;
  const dbHost = config.DB_HOST || '127.0.0.1';
  const dbPort = Number(config.DB_PORT) || 5432;

  // Remote database - wait for availability
  if (dbHost !== 'localhost' && dbHost !== '127.0.0.1') {
    const isReady = await waitForPostgresReady(30000, 500);
    if (!isReady) {
      throw new Error(`[Database] Remote PostgreSQL server at ${dbHost}:${dbPort} failed to accept connections.`);
    }
    return;
  }

  const pgCtl = path.resolve(__dirname, '../../postgresql/bin/pg_ctl.exe');
  const pgData = path.resolve(__dirname, '../../programs/data');
  const pidPath = path.join(pgData, 'postmaster.pid');

  if (!fs.existsSync(pgCtl) || !fs.existsSync(pgData)) {
    const isReady = await waitForPostgresReady(30000, 500);
    if (!isReady) {
      throw new Error(`[Database] PostgreSQL failed to accept connections on port ${dbPort}. Please check server status.`);
    }
    return;
  }

  // 1. Check if database is ALREADY up, healthy, and accepting queries
  if (await db.isPrimaryDbAvailable()) {
    console.log(`[Database] PostgreSQL is ready and accepting queries on port ${dbPort}.`);
    return;
  }

  // If port is currently open, wait a short moment (up to 4s) in case it's mid-startup or completing recovery
  const portOpenInitially = await isPortOpen(dbPort, '127.0.0.1');
  if (portOpenInitially) {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await db.isPrimaryDbAvailable()) {
        console.log(`[Database] PostgreSQL is ready and accepting queries on port ${dbPort}.`);
        return;
      }
    }
  }

  // 2. Database is NOT answering queries on port dbPort. Heal local engine state:
  console.log(`[Database] PostgreSQL is not answering queries on port ${dbPort}. Healing local engine state...`);

  const recordedPid = getPostmasterPid(pidPath);
  const isPostgresAlive = isPostgresProcessRunning(recordedPid);
  const isCtlRunning = checkPgCtlStatus(pgCtl, pgData);

  // If pg_ctl status says server is running, or recorded PID is active but unresponsive, attempt graceful fast stop
  if (isCtlRunning || isPostgresAlive) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync(pgCtl, ['stop', '-D', pgData, '-m', 'fast'], {
        windowsHide: true,
        timeout: 4000,
        stdio: 'ignore',
      });
      console.log('[Database] Stopped unresponsive PostgreSQL instance.');
    } catch {}
  }

  // Clean up any orphaned user-session worker processes (e.g. io_worker lingering from previous crash)
  // Targets user session processes only - never touches Session 0 Windows Services
  try {
    const { execFileSync } = require('child_process');
    execFileSync('taskkill.exe', ['/F', '/FI', 'SESSION ne 0', '/IM', 'postgres.exe'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch {}

  // Remove stale postmaster.pid lock file if it remains
  if (fs.existsSync(pidPath)) {
    try {
      fs.unlinkSync(pidPath);
      console.log('[Database] Cleaned up stale postmaster.pid lock file.');
    } catch (e) {
      console.warn(`[Database] Note: Could not unlink postmaster.pid: ${e.message}`);
    }
  }

  // Allow Windows kernel a brief moment to release bound sockets and file handles
  await new Promise((r) => setTimeout(r, 800));

  // 3. Start local PostgreSQL engine
  console.log(`[Database] Starting local PostgreSQL from: ${pgData}`);
  const p = spawn(pgCtl, ['start', '-D', pgData], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  p.unref();

  // 4. Wait for PostgreSQL to complete WAL crash recovery and become fully ready
  const isReady = await waitForPostgresReady(60000, 500);
  if (isReady) {
    console.log(`[Database] PostgreSQL is ready and accepting queries on port ${dbPort}.`);
  } else {
    throw new Error(`[Database] PostgreSQL failed to accept connections on port ${dbPort} within 60 seconds. Please check logs in programs/data/log.`);
  }
}

async function startServer() {
  try {
    console.log(`🚀 Starting Bebyoon Server in ${config.IS_BRANCH_MODE ? 'BRANCH' : 'MASTER'} mode...`);

    // 0. Ensure PostgreSQL is active if in Master mode
    await ensurePostgresRunning();

    // 1. Run automated database migrations
    await runMigrations();

    // 2. Start HTTP listener
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`✅ Server is running on http://127.0.0.1:${config.PORT}`);
      console.log(`📡 Operational Mode: ${config.IS_BRANCH_MODE ? 'Branch (SQLite Offline-First)' : 'Master (PostgreSQL Server)'}`);

      // Notify parent Electron process if running under fork()
      if (typeof process.send === 'function') {
        process.send('server-ready');
      }
    });

    // 3. Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await db.close();
        } catch {}

        // Gracefully stop local PostgreSQL engine so WAL is cleanly checkpointed and postmaster.pid is removed
        if (!config.IS_BRANCH_MODE && (config.DB_HOST === 'localhost' || config.DB_HOST === '127.0.0.1')) {
          try {
            const pgCtl = path.resolve(__dirname, '../../postgresql/bin/pg_ctl.exe');
            const pgData = path.resolve(__dirname, '../../programs/data');
            if (fs.existsSync(pgCtl) && fs.existsSync(pgData)) {
              const { execFileSync } = require('child_process');
              execFileSync(pgCtl, ['stop', '-D', pgData, '-m', 'fast'], {
                windowsHide: true,
                timeout: 5000,
                stdio: 'ignore',
              });
              console.log('[Database] Local PostgreSQL stopped gracefully.');
            }
          } catch {}
        }

        console.log('Server and database connections closed. Bye.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
};
