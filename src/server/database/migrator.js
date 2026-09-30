const fs = require('fs');
const path = require('path');
const db = require('./connection');
const config = require('../config/env');
const { DEFAULT_SETTINGS } = require('../../shared/constants/system');

async function runPostgresMigrations() {
  console.log('🔄 Checking PostgreSQL migrations...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const { rows: appliedRows } = await db.query('SELECT version FROM schema_migrations');
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

    console.log(`⏳ Applying migration: ${file}...`);
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });

    console.log(`✅ Applied migration: ${file}`);
  }

  // Ensure default system settings exist
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
    `, [key, value]);
  }

  console.log('✨ All PostgreSQL migrations are up to date.');
}

async function runBranchSqliteMigrations() {
  console.log('🔄 Initializing Branch SQLite schema...');
  const sqlite = db.sqlite;
  if (!sqlite) return;

  // Execute baseline SQLite schema with WAL mode
  sqlite.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      type TEXT,
      is_main_warehouse INTEGER DEFAULT 0,
      phone TEXT,
      logo_url TEXT,
      invoice_logo_height INTEGER DEFAULT 160,
      invoice_logo_spacing INTEGER DEFAULT 8,
      invoice_logo_filter TEXT DEFAULT 'black',
      invoice_logo_bg_enabled INTEGER DEFAULT 0,
      invoice_logo_bg_start TEXT DEFAULT '#ffffff',
      invoice_logo_bg_end TEXT DEFAULT '#ffffff'
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      initials TEXT,
      email TEXT,
      phone TEXT,
      national_id TEXT,
      join_date TEXT DEFAULT CURRENT_DATE,
      total_spent REAL DEFAULT 0,
      status TEXT DEFAULT 'نشط',
      branch_id INTEGER DEFAULT 1,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      size_cut TEXT,
      color TEXT,
      barcode TEXT UNIQUE,
      stock_level INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      preferred_supplier_id INTEGER,
      price REAL,
      cost_price REAL DEFAULT 0,
      image_url TEXT,
      is_deleted INTEGER DEFAULT 0,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      seller_id INTEGER,
      order_date TEXT DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL NOT NULL,
      paid_amount REAL DEFAULT 0,
      change_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      branch_id INTEGER DEFAULT 1,
      payment_method TEXT DEFAULT 'cash',
      total_cost_price REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      offline_uuid TEXT UNIQUE,
      order_source TEXT DEFAULT 'pos',
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      inventory_id INTEGER,
      quantity INTEGER NOT NULL,
      price_at_time REAL NOT NULL,
      discount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'amount'
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      return_date TEXT DEFAULT CURRENT_TIMESTAMP,
      total_return_amount REAL NOT NULL,
      reason TEXT,
      seller_id INTEGER,
      branch_id INTEGER,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER,
      inventory_id INTEGER,
      quantity INTEGER NOT NULL,
      price_at_time REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      inventory_id INTEGER,
      rental_inventory_id INTEGER,
      seller_id INTEGER,
      branch_id INTEGER,
      booking_date TEXT DEFAULT CURRENT_DATE,
      pickup_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      actual_return_date TEXT,
      total_price REAL NOT NULL,
      deposit_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      remaining_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'booked',
      notes TEXT,
      daily_fine REAL DEFAULT 50,
      fine_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      offline_uuid TEXT UNIQUE,
      rental_group_uuid TEXT,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS rental_inventory (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      size_cut TEXT,
      color TEXT,
      barcode TEXT UNIQUE,
      price REAL DEFAULT 0,
      image_url TEXT,
      is_deleted INTEGER DEFAULT 0,
      stock_level INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT,
      branch_id INTEGER,
      basic_salary REAL NOT NULL DEFAULT 0,
      phone TEXT,
      join_date TEXT DEFAULT CURRENT_DATE,
      shift_start TEXT,
      shift_end TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      date TEXT DEFAULT CURRENT_DATE,
      check_in TEXT,
      check_out TEXT,
      status TEXT DEFAULT 'present',
      notes TEXT,
      total_hours REAL DEFAULT 0,
      late_minutes INTEGER DEFAULT 0,
      early_departure_minutes INTEGER DEFAULT 0,
      overtime_minutes INTEGER DEFAULT 0,
      UNIQUE (employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS employee_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_date TEXT DEFAULT CURRENT_DATE,
      notes TEXT,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT DEFAULT CURRENT_DATE,
      notes TEXT,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tailoring_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      product_description TEXT NOT NULL,
      measurements TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'pending',
      order_date TEXT DEFAULT CURRENT_TIMESTAMP,
      delivery_date TEXT,
      notes TEXT,
      seller_id INTEGER,
      branch_id INTEGER,
      created_by INTEGER,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tailoring_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tailoring_order_id INTEGER,
      amount REAL NOT NULL,
      branch_id INTEGER,
      payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
      is_remainder INTEGER DEFAULT 0,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS worn_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL,
      inventory_id INTEGER,
      rental_inventory_id INTEGER,
      branch_id INTEGER,
      quantity INTEGER NOT NULL,
      condition TEXT DEFAULT 'worn',
      reason TEXT,
      estimated_loss REAL DEFAULT 0,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'branch_user',
      branch_id INTEGER,
      permissions TEXT DEFAULT '[]',
      employee_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  console.log('✨ Branch SQLite schema initialized successfully.');
}

async function runMigrations() {
  if (config.IS_BRANCH_MODE) {
    await runBranchSqliteMigrations();
  } else {
    await runPostgresMigrations();
  }
}

module.exports = {
  runMigrations,
};
