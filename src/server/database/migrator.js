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

  // Seed initial branches & users into PostgreSQL if empty (e.g. fresh installation or CI runner)
  try {
    const { rows: branchRows } = await db.query('SELECT COUNT(*) as count FROM branches');
    if (Number(branchRows[0].count) === 0) {
      const seedFile = path.join(__dirname, 'branch_initial_seed.json');
      if (fs.existsSync(seedFile)) {
        const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        if (Array.isArray(seedData.branches)) {
          for (const b of seedData.branches) {
            await db.query(`
              INSERT INTO branches (id, name, location, type, is_main_warehouse, phone, logo_url, invoice_logo_height, invoice_logo_spacing, invoice_logo_filter, invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end, allowed_gender)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
              ON CONFLICT (id) DO NOTHING
            `, [
              b.id, b.name, b.location || null, b.type || null, Boolean(b.is_main_warehouse),
              b.phone || null, b.logo_url || null, b.invoice_logo_height || 160, b.invoice_logo_spacing || 8,
              b.invoice_logo_filter || 'black', Boolean(b.invoice_logo_bg_enabled),
              b.invoice_logo_bg_start || '#ffffff', b.invoice_logo_bg_end || '#ffffff',
              b.allowed_gender || 'both'
            ]);
          }
          await db.query("SELECT setval(pg_get_serial_sequence('branches', 'id'), COALESCE(MAX(id), 1)) FROM branches");
        }
        if (Array.isArray(seedData.users)) {
          for (const u of seedData.users) {
            const perms = typeof u.permissions === 'object' ? JSON.stringify(u.permissions) : (u.permissions || '[]');
            await db.query(`
              INSERT INTO users (id, username, password_hash, role, branch_id, permissions, employee_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (id) DO NOTHING
            `, [u.id, u.username, u.password_hash, u.role, u.branch_id, perms, u.employee_id || null]);
          }
          await db.query("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users");
        }
        console.log(`🌱 Seeded initial branches & users into PostgreSQL.`);
      }
    }
  } catch (seedErr) {
    console.warn('Could not seed initial branches & users into PostgreSQL:', seedErr.message);
  }

  console.log('✨ All PostgreSQL migrations are up to date.');
}

async function runBranchSqliteMigrations(targetSqlite = null) {
  console.log('🔄 Initializing Branch SQLite schema...');
  const sqlite = targetSqlite || db.sqlite;
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
      invoice_logo_bg_end TEXT DEFAULT '#ffffff',
      allowed_gender TEXT DEFAULT 'both'
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      initials TEXT,
      category TEXT,
      contact_person TEXT,
      phone TEXT,
      supply_type TEXT,
      last_supply_date TEXT,
      balance REAL DEFAULT 0,
      total_purchases REAL DEFAULT 0,
      notes TEXT,
      gender_category TEXT DEFAULT 'مشترك',
      is_active INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
      is_active INTEGER DEFAULT 1,
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
      invoice_discount REAL DEFAULT 0,
      invoice_discount_type TEXT DEFAULT 'amount',
      branch_invoice_number TEXT,
      cash_amount REAL DEFAULT 0,
      card_amount REAL DEFAULT 0,
      wallet_amount REAL DEFAULT 0,
      bank_transfer_amount REAL DEFAULT 0,
      payment_splits TEXT,
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
      payment_method TEXT DEFAULT 'cash',
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_deleted INTEGER DEFAULT 0,
      deleted_by INTEGER,
      deleted_at TEXT,
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
      payment_method TEXT DEFAULT 'cash',
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
      reported_by INTEGER,
      occurred_at TEXT DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'reported',
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      offline_uuid TEXT UNIQUE,
      pending_sync INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory_branches (
      inventory_id INTEGER,
      branch_id INTEGER,
      stock_level INTEGER DEFAULT 0,
      PRIMARY KEY (inventory_id, branch_id)
    );

    CREATE TABLE IF NOT EXISTS rental_inventory_branches (
      rental_inventory_id INTEGER,
      branch_id INTEGER,
      stock_level INTEGER DEFAULT 0,
      PRIMARY KEY (rental_inventory_id, branch_id)
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER,
      from_branch_id INTEGER,
      to_branch_id INTEGER,
      quantity INTEGER NOT NULL,
      transfer_date TEXT DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'completed',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      sizes_data TEXT
    );

    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id TEXT PRIMARY KEY,
      user_id INTEGER,
      read_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_dismissed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS branch_heartbeats (
      branch_id INTEGER PRIMARY KEY,
      last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
      is_online INTEGER DEFAULT 1,
      meta TEXT
    );

    CREATE TABLE IF NOT EXISTS supply_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      inventory_id INTEGER,
      branch_id INTEGER DEFAULT 1,
      quantity INTEGER NOT NULL,
      supply_date TEXT DEFAULT CURRENT_DATE,
      cost_price REAL NOT NULL,
      notes TEXT,
      purchase_batch_id TEXT
    );

    CREATE TABLE IF NOT EXISTS supplier_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      transaction_type TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_date TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      purchase_batch_id TEXT
    );

    CREATE TABLE IF NOT EXISTS alterations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      customer_id INTEGER,
      branch_id INTEGER,
      description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      inventory_id INTEGER
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

  // Seed default system settings into SQLite
  const insertSetting = sqlite.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(key, value);
  }

  try {
    sqlite.exec("ALTER TABLE branches ADD COLUMN allowed_gender TEXT DEFAULT 'both'");
  } catch {}

  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN branch_invoice_number TEXT");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN invoice_discount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN invoice_discount_type TEXT DEFAULT 'amount'");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN cash_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN card_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN wallet_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN bank_transfer_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE orders ADD COLUMN payment_splits TEXT");
  } catch {}

  try {
    sqlite.exec(`
      UPDATE orders
      SET cash_amount = MAX(0, paid_amount - COALESCE(change_amount, 0))
      WHERE (payment_method IN ('cash', 'نقدي', 'كاش') OR payment_method IS NULL)
        AND (cash_amount IS NULL OR cash_amount = 0)
        AND paid_amount > 0
    `);
    sqlite.exec(`
      UPDATE orders
      SET card_amount = paid_amount
      WHERE payment_method IN ('card', 'visa', 'فيزا', 'بطاقة')
        AND (card_amount IS NULL OR card_amount = 0)
        AND paid_amount > 0
    `);
    sqlite.exec(`
      UPDATE orders
      SET wallet_amount = paid_amount
      WHERE payment_method IN ('wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة')
        AND (wallet_amount IS NULL OR wallet_amount = 0)
        AND paid_amount > 0
    `);
    sqlite.exec(`
      UPDATE orders
      SET bank_transfer_amount = paid_amount
      WHERE payment_method IN ('bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي', 'تحويل')
        AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
        AND paid_amount > 0
    `);
  } catch {}

  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN payment_method TEXT DEFAULT 'cash'");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN created_by INTEGER");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN updated_by INTEGER");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN is_deleted INTEGER DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN deleted_by INTEGER");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN deleted_at TEXT");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE notification_reads ADD COLUMN is_dismissed INTEGER DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE rentals ADD COLUMN cash_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE rentals ADD COLUMN card_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE rentals ADD COLUMN wallet_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE rentals ADD COLUMN bank_transfer_amount REAL DEFAULT 0");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE rentals ADD COLUMN payment_splits TEXT");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE rentals ADD COLUMN custom_items TEXT");
  } catch {}
  try {
    sqlite.exec("ALTER TABLE tailoring_payments ADD COLUMN payment_method TEXT DEFAULT 'cash'");
  } catch {}

  try {
    sqlite.exec("ALTER TABLE suppliers ADD COLUMN created_at TEXT");
  } catch {}
  try {
    sqlite.exec("UPDATE suppliers SET created_at = datetime('now') WHERE created_at IS NULL");
  } catch {}
  try {
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON suppliers(created_at DESC)");
  } catch {}

  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS colors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS inventory_sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_id INTEGER NOT NULL,
        size_id INTEGER,
        size_name TEXT NOT NULL,
        color_name TEXT DEFAULT '',
        barcode TEXT,
        stock_level INTEGER DEFAULT 0,
        branch_id INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sizes_unique 
        ON inventory_sizes (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1));
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_uuid TEXT UNIQUE NOT NULL,
      entity_type TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_id INTEGER,
      branch_id INTEGER,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status_attempts ON sync_queue(status, attempts);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at DESC);
  `);
  } catch (e) {
    console.warn('Error ensuring auxiliary SQLite tables:', e.message);
  }

  // Migrate legacy inventory_sizes if it has the single-color UNIQUE constraint
  try {
    const tableDef = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inventory_sizes'").get();
    if (tableDef && tableDef.sql && tableDef.sql.includes('UNIQUE(inventory_id, size_name, branch_id)')) {
      const cols = sqlite.prepare("PRAGMA table_info('inventory_sizes')").all().map((c) => c.name);
      const hasColor = cols.includes('color_name');
      const hasBarcode = cols.includes('barcode');
      const selectColor = hasColor ? "COALESCE(color_name, '')" : "''";
      const selectBarcode = hasBarcode ? "barcode" : "NULL";

      sqlite.exec(`
        CREATE TABLE inventory_sizes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inventory_id INTEGER NOT NULL,
          size_id INTEGER,
          size_name TEXT NOT NULL,
          color_name TEXT DEFAULT '',
          barcode TEXT,
          stock_level INTEGER DEFAULT 0,
          branch_id INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO inventory_sizes_new (id, inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id, created_at, updated_at)
        SELECT id, inventory_id, size_id, size_name, ${selectColor}, ${selectBarcode}, stock_level, branch_id, created_at, updated_at
        FROM inventory_sizes;
        DROP TABLE inventory_sizes;
        ALTER TABLE inventory_sizes_new RENAME TO inventory_sizes;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sizes_unique 
          ON inventory_sizes (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1));
      `);
    }
  } catch (err) {
    console.warn('Error migrating legacy inventory_sizes in SQLite:', err.message);
  }

  try {
    sqlite.exec('ALTER TABLE inventory_sizes ADD COLUMN color_name TEXT');
  } catch {}
  try {
    sqlite.exec('ALTER TABLE inventory_sizes ADD COLUMN barcode TEXT');
  } catch {}
  try {
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_inventory_sizes_barcode ON inventory_sizes(barcode)');
  } catch {}
  try {
    sqlite.exec(`
      UPDATE inventory_sizes
      SET color_name = (SELECT color FROM inventory WHERE inventory.id = inventory_sizes.inventory_id)
      WHERE color_name IS NULL OR TRIM(color_name) = ''
    `);
  } catch {}
  try {
    sqlite.exec('ALTER TABLE stock_transfers ADD COLUMN sizes_data TEXT');
  } catch {}

  // Seed initial users & branches into branch SQLite if empty
  try {
    const userCount = sqlite.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
    if (userCount === 0) {
      const seedFile = path.join(__dirname, 'branch_initial_seed.json');
      if (fs.existsSync(seedFile)) {
        const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
        if (Array.isArray(seedData.users)) {
          const insertUser = sqlite.prepare(`
            INSERT OR REPLACE INTO users (id, username, password_hash, role, branch_id, permissions, employee_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const u of seedData.users) {
            const perms = typeof u.permissions === 'object' ? JSON.stringify(u.permissions) : (u.permissions || '[]');
            insertUser.run(u.id, u.username, u.password_hash, u.role, u.branch_id, perms, u.employee_id || null);
          }
          console.log(`🌱 Seeded ${seedData.users.length} initial users into branch SQLite.`);
        }
        if (Array.isArray(seedData.branches)) {
          const insertBranch = sqlite.prepare(`
            INSERT OR REPLACE INTO branches (id, name, location, type, is_main_warehouse, phone, logo_url, invoice_logo_height, invoice_logo_spacing, invoice_logo_filter, invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end, allowed_gender)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const b of seedData.branches) {
            insertBranch.run(
              b.id, b.name, b.location || null, b.type || null, b.is_main_warehouse ? 1 : 0,
              b.phone || null, b.logo_url || null, b.invoice_logo_height || 160, b.invoice_logo_spacing || 8,
              b.invoice_logo_filter || 'black', b.invoice_logo_bg_enabled ? 1 : 0,
              b.invoice_logo_bg_start || '#ffffff', b.invoice_logo_bg_end || '#ffffff',
              b.allowed_gender || 'both'
            );
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not seed initial users into SQLite:', err.message);
  }

  // Always ensure clean static logo URLs for standard branches in SQLite
  try {
    sqlite.exec(`
      UPDATE branches SET logo_url = '/logos/app-icon.png' WHERE id = 1;
      UPDATE branches SET logo_url = '/logos/Antalya logo.png' WHERE id = 2;
      UPDATE branches SET logo_url = '/logos/elwazer.png' WHERE id = 3;
      UPDATE branches SET logo_url = '/logos/men.png' WHERE id IN (4, 5, 6, 7, 8, 9);
      UPDATE branches SET logo_url = '/logos/women.png' WHERE id = 10;
    `);
  } catch (err) {
    console.warn('Could not update static branch logos in SQLite:', err.message);
  }

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
  runBranchSqliteMigrations,
};
