const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawnSync } = require('child_process');
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

async function ensurePostgresRunning() {
  if (config.IS_BRANCH_MODE) return;
  const dbHost = config.DB_HOST || '127.0.0.1';
  const dbPort = Number(config.DB_PORT) || 5432;

  if (dbHost === 'localhost' || dbHost === '127.0.0.1') {
    const open = await isPortOpen(dbPort, '127.0.0.1');
    if (!open) {
      console.log(`[Database] PostgreSQL is not running on port ${dbPort}. Checking for local engine...`);
      const pgCtl = path.resolve(__dirname, '../../postgresql/bin/pg_ctl.exe');
      const pgData = path.resolve(__dirname, '../../programs/data');

      if (fs.existsSync(pgCtl) && fs.existsSync(pgData)) {
        console.log(`[Database] Starting local PostgreSQL from: ${pgData}`);
        spawnSync(pgCtl, ['start', '-D', pgData, '-l', path.join(pgData, 'pg_server.log')], {
          windowsHide: true,
        });

        // Wait up to 15 seconds for PostgreSQL port to open
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (await isPortOpen(dbPort, '127.0.0.1')) {
            console.log(`[Database] PostgreSQL started successfully on port ${dbPort}.`);
            return;
          }
        }
        console.warn(`[Database] PostgreSQL startup timed out. Proceeding anyway...`);
      }
    }
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
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        try {
          await db.close();
        } catch {}
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
