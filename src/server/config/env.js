const path = require('path');
const fs = require('fs');

// Determine env file path
const appRoot = process.env.APP_ROOT || path.resolve(__dirname, '../../../');
const envPath = path.join(appRoot, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

function boundedEnvInt(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name], 10);
  const value = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(Math.max(value, min), max);
}

const IS_BRANCH_MODE = String(process.env.APP_MODE || process.env.BRANCH_MODE || '').toLowerCase() === 'branch'
  || String(process.env.BRANCH_LOCAL || '').toLowerCase() === 'true';

const IS_SYNC_TARGET = process.env.SYNC_TARGET === 'true';

if (IS_BRANCH_MODE && IS_SYNC_TARGET) {
  throw new Error('Configuration error: Cannot be both branch (APP_MODE=branch) and sync target (SYNC_TARGET=true)');
}

const PORT = boundedEnvInt('PORT', 6253, 1000, 65535);
const JWT_SECRET = process.env.JWT_SECRET || 'bebyoon-default-dev-secret-key-change-in-production-123456789';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_PRODUCTION = NODE_ENV === 'production';
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '250mb';

// Sync Configuration
const SYNC_SERVER_URL = (process.env.SYNC_SERVER_URL || process.env.REMOTE_SERVER_URL || '').replace(/\/+$/, '');
const SYNC_API_KEY = process.env.SYNC_API_KEY || '';
const BRANCH_ID = process.env.BRANCH_ID || '';
const SYNC_QUEUE_RETENTION_DAYS = boundedEnvInt('SYNC_QUEUE_RETENTION_DAYS', 30, 0, 365);
const SYNC_FETCH_TIMEOUT_MS = boundedEnvInt('SYNC_FETCH_TIMEOUT_MS', 15000, 1000, 120000);

// Database Config (Postgres)
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = boundedEnvInt('DB_PORT', 5432, 1, 65535);
const DB_NAME = process.env.DB_NAME || 'pos_db';

// Database Config (SQLite)
const OFFLINE_DB_PATH = process.env.OFFLINE_DB_PATH || path.join(appRoot, 'data', 'offline.sqlite');
const BRANCH_SQLITE_PATH = process.env.BRANCH_SQLITE_PATH || path.join(appRoot, 'data', 'branch.sqlite');

const SUPPLIER_STATEMENT_LIMIT = boundedEnvInt('SUPPLIER_STATEMENT_LIMIT', 500, 50, 2000);
const EMPLOYEE_SALES_REPORT_DAYS = boundedEnvInt('EMPLOYEE_SALES_REPORT_DAYS', 180, 30, 730);
const EMPLOYEE_SALES_REPORT_LIMIT = boundedEnvInt('EMPLOYEE_SALES_REPORT_LIMIT', 1000, 100, 5000);

module.exports = {
  appRoot,
  IS_BRANCH_MODE,
  IS_SYNC_TARGET,
  PORT,
  JWT_SECRET,
  CORS_ORIGIN,
  NODE_ENV,
  IS_PRODUCTION,
  REQUEST_BODY_LIMIT,
  SYNC_SERVER_URL,
  SYNC_API_KEY,
  BRANCH_ID,
  SYNC_QUEUE_RETENTION_DAYS,
  SYNC_FETCH_TIMEOUT_MS,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  OFFLINE_DB_PATH,
  BRANCH_SQLITE_PATH,
  SUPPLIER_STATEMENT_LIMIT,
  EMPLOYEE_SALES_REPORT_DAYS,
  EMPLOYEE_SALES_REPORT_LIMIT,
  boundedEnvInt,
};


