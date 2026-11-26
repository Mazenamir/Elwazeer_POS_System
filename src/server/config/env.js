const path = require('path');
const fs = require('fs');

// Determine env file path & persistent data directory
const appRoot = process.env.APP_ROOT || path.resolve(__dirname, '../../../');
const isPackaged = process.env.ELECTRON_RUN_AS_NODE === '1' && !fs.existsSync(path.join(appRoot, 'src'));

// Read shipped template config if present
let appEnvConfig = {};
const appEnvPath = path.join(appRoot, '.env');
if (fs.existsSync(appEnvPath)) {
  try {
    const dotenv = require('dotenv');
    appEnvConfig = dotenv.parse(fs.readFileSync(appEnvPath, 'utf8'));
  } catch {}
}

const isBranchApp = (appEnvConfig.APP_MODE === 'branch')
  || (process.env.APP_MODE === 'branch')
  || (process.env.BRANCH_MODE === 'branch');

const appDataFolderName = isBranchApp ? 'Bebyoon Branch System' : 'Bebyoon System';

const defaultDataDir = isPackaged
  ? (process.env.ProgramData ? path.join(process.env.ProgramData, appDataFolderName) : path.join(appRoot, 'data'))
  : appRoot;
const dataDir = process.env.DATA_DIR || defaultDataDir;

const dataEnvPath = path.join(dataDir, '.env');
let dataEnvConfig = {};
if (fs.existsSync(dataEnvPath)) {
  try {
    const dotenv = require('dotenv');
    dataEnvConfig = dotenv.parse(fs.readFileSync(dataEnvPath, 'utf8'));
  } catch {}
  require('dotenv').config({ path: dataEnvPath });
} else if (fs.existsSync(appEnvPath)) {
  require('dotenv').config({ path: appEnvPath });
} else {
  require('dotenv').config();
}

const fileEnvConfig = { ...appEnvConfig, ...dataEnvConfig };

// Clear ambient PostgreSQL driver variables when app .env supplies DB credentials so OS vars cannot cause 28P01
if (process.env.NODE_ENV !== 'test') {
  if (fileEnvConfig.DB_PASSWORD !== undefined) delete process.env.PGPASSWORD;
  if (fileEnvConfig.DB_USER !== undefined) delete process.env.PGUSER;
}

// Fallback: If packaged branch app, ensure essential branch parameters take priority over any stale local defaults
if (isBranchApp) {
  process.env.APP_MODE = 'branch';
  delete process.env.SYNC_TARGET;
  if (appEnvConfig.SYNC_SERVER_URL && (!process.env.SYNC_SERVER_URL || process.env.SYNC_SERVER_URL.includes('localhost'))) {
    process.env.SYNC_SERVER_URL = appEnvConfig.SYNC_SERVER_URL;
  }
  if (appEnvConfig.SYNC_API_KEY && !process.env.SYNC_API_KEY) {
    process.env.SYNC_API_KEY = appEnvConfig.SYNC_API_KEY;
  }
  if (appEnvConfig.BRANCH_ID && !process.env.BRANCH_ID) {
    process.env.BRANCH_ID = appEnvConfig.BRANCH_ID;
  }
}

function boundedEnvInt(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name], 10);
  const value = Number.isInteger(parsed) ? parsed : fallback;
  return Math.min(Math.max(value, min), max);
}

const IS_BRANCH_MODE = String(process.env.APP_MODE || process.env.BRANCH_MODE || '').toLowerCase() === 'branch'
  || String(process.env.BRANCH_LOCAL || '').toLowerCase() === 'true';

if (IS_BRANCH_MODE) {
  delete process.env.SYNC_TARGET;
}

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
const SYNC_API_KEY = process.env.SYNC_API_KEY || 'BebyoonSecretKey2026';
const BRANCH_ID = process.env.BRANCH_ID || '';
const SYNC_QUEUE_RETENTION_DAYS = boundedEnvInt('SYNC_QUEUE_RETENTION_DAYS', 30, 0, 365);
const SYNC_FETCH_TIMEOUT_MS = boundedEnvInt('SYNC_FETCH_TIMEOUT_MS', 15000, 1000, 120000);

// Database Config (Postgres)
const isTestEnv = process.env.NODE_ENV === 'test';
const fileDbHost = String(fileEnvConfig.DB_HOST || '').trim();
const envDbHost = String(process.env.DB_HOST || '').trim();
const rawDbHost = (!isTestEnv && fileDbHost ? fileDbHost : envDbHost) || '127.0.0.1';
const DB_HOST = rawDbHost === 'localhost' ? '127.0.0.1' : rawDbHost;
const isLocalDbHost = DB_HOST === '127.0.0.1';
const pickDbSetting = (key, fallback) => {
  const fileVal = fileEnvConfig[key] !== undefined ? String(fileEnvConfig[key]).trim() : '';
  const procVal = process.env[key] !== undefined ? String(process.env[key]).trim() : '';
  if (!isTestEnv && isLocalDbHost && fileVal) return fileVal;
  return procVal || fileVal || fallback;
};
const DB_USER = pickDbSetting('DB_USER', 'postgres');
const DB_PASSWORD = pickDbSetting('DB_PASSWORD', isLocalDbHost ? 'ahmed1@' : '');
const fileDbPort = (!isTestEnv && isLocalDbHost && fileEnvConfig.DB_PORT !== undefined)
  ? Number.parseInt(String(fileEnvConfig.DB_PORT).trim(), 10)
  : NaN;
const DB_PORT = Number.isInteger(fileDbPort) && fileDbPort >= 1 && fileDbPort <= 65535
  ? fileDbPort
  : boundedEnvInt('DB_PORT', 5432, 1, 65535);
const DB_NAME = pickDbSetting('DB_NAME', 'pos_db');
const PG_DATA_DIR = process.env.PG_DATA_DIR || (
  dataDir === appRoot
    ? path.join(appRoot, 'programs', 'data')
    : path.join(dataDir, 'postgres_data')
);

// Database Config (SQLite)
const OFFLINE_DB_PATH = process.env.OFFLINE_DB_PATH || path.join(dataDir, 'data', 'offline.sqlite');
const BRANCH_SQLITE_PATH = process.env.BRANCH_SQLITE_PATH || path.join(dataDir, 'data', 'branch.sqlite');

// Uploads Config
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(dataDir, 'data', 'uploads');
const PRODUCT_UPLOADS_DIR = path.join(UPLOADS_DIR, 'products');

try {
  fs.mkdirSync(PRODUCT_UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.warn('Could not create uploads directory:', e.message);
}

const SUPPLIER_STATEMENT_LIMIT = boundedEnvInt('SUPPLIER_STATEMENT_LIMIT', 500, 50, 2000);
const EMPLOYEE_SALES_REPORT_DAYS = boundedEnvInt('EMPLOYEE_SALES_REPORT_DAYS', 180, 30, 730);
const EMPLOYEE_SALES_REPORT_LIMIT = boundedEnvInt('EMPLOYEE_SALES_REPORT_LIMIT', 1000, 100, 5000);
const TOP_PRODUCTS_LOOKBACK_DAYS = boundedEnvInt('TOP_PRODUCTS_LOOKBACK_DAYS', 90, 7, 3650);

module.exports = {
  appRoot,
  dataDir,
  PG_DATA_DIR,
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
  UPLOADS_DIR,
  PRODUCT_UPLOADS_DIR,
  SUPPLIER_STATEMENT_LIMIT,
  EMPLOYEE_SALES_REPORT_DAYS,
  EMPLOYEE_SALES_REPORT_LIMIT,
  TOP_PRODUCTS_LOOKBACK_DAYS,
  boundedEnvInt,
};


