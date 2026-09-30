const app = require('./app');
const config = require('./config/env');
const db = require('./database/connection');
const { runMigrations } = require('./database/migrator');

async function startServer() {
  try {
    console.log(`🚀 Starting Bebyoon Server in ${config.IS_BRANCH_MODE ? 'BRANCH' : 'MASTER'} mode...`);

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
