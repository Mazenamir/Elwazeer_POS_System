-- Migration 001: Core Database Schema
-- Baseline schema extracted from legacy init_db.js

CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  type VARCHAR(50) DEFAULT 'men',
  is_main_warehouse BOOLEAN DEFAULT FALSE,
  phone TEXT,
  logo_url TEXT,
  invoice_logo_height INTEGER DEFAULT 160,
  invoice_logo_spacing INTEGER DEFAULT 8,
  invoice_logo_filter VARCHAR(50) DEFAULT 'black',
  invoice_logo_bg_enabled BOOLEAN DEFAULT FALSE,
  invoice_logo_bg_start VARCHAR(20) DEFAULT '#ffffff',
  invoice_logo_bg_end VARCHAR(20) DEFAULT '#ffffff'
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  initials VARCHAR(10),
  category VARCHAR(100),
  contact_person VARCHAR(255),
  phone VARCHAR(50),
  supply_type VARCHAR(100),
  last_supply_date DATE,
  balance NUMERIC(10, 2) DEFAULT 0,
  total_purchases NUMERIC(10, 2) DEFAULT 0,
  notes TEXT,
  gender_category VARCHAR(50) DEFAULT 'مشترك',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  initials VARCHAR(10),
  email VARCHAR(255),
  phone VARCHAR(50),
  national_id VARCHAR(20),
  join_date DATE DEFAULT CURRENT_DATE,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'نشط',
  branch_id INTEGER REFERENCES branches(id) DEFAULT 1,
  offline_uuid UUID UNIQUE
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  size_cut VARCHAR(100),
  color VARCHAR(50),
  barcode VARCHAR(100) UNIQUE,
  stock_level INTEGER DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  preferred_supplier_id INTEGER REFERENCES suppliers(id),
  price DECIMAL(10, 2),
  cost_price DECIMAL(10, 2) DEFAULT 0,
  image_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  offline_uuid UUID UNIQUE
);

CREATE TABLE IF NOT EXISTS inventory_branches (
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  stock_level INTEGER DEFAULT 0,
  PRIMARY KEY (inventory_id, branch_id)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
  from_branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  to_branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'completed'
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  seller_id INTEGER,
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_amount DECIMAL(10, 2) NOT NULL,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  change_amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'completed',
  branch_id INTEGER REFERENCES branches(id) DEFAULT 1,
  payment_method VARCHAR(50) DEFAULT 'cash',
  total_cost_price DECIMAL(10, 2) DEFAULT 0,
  profit DECIMAL(10, 2) DEFAULT 0,
  offline_uuid UUID UNIQUE,
  order_source VARCHAR(20) DEFAULT 'pos'
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  inventory_id INTEGER REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  price_at_time DECIMAL(10, 2) NOT NULL,
  discount DECIMAL(10, 2) DEFAULT 0,
  discount_type VARCHAR(20) DEFAULT 'amount'
);

CREATE TABLE IF NOT EXISTS supply_records (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id),
  inventory_id INTEGER REFERENCES inventory(id),
  branch_id INTEGER REFERENCES branches(id) DEFAULT 1,
  quantity INTEGER NOT NULL,
  supply_date DATE DEFAULT CURRENT_DATE,
  cost_price DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  purchase_batch_id UUID
);

CREATE TABLE IF NOT EXISTS supplier_transactions (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  purchase_batch_id UUID
);

CREATE TABLE IF NOT EXISTS rental_inventory (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  size_cut VARCHAR(100),
  color VARCHAR(50),
  barcode VARCHAR(100) UNIQUE,
  price DECIMAL(10, 2) DEFAULT 0,
  image_url TEXT,
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS rental_inventory_branches (
  rental_inventory_id INTEGER REFERENCES rental_inventory(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  stock_level INTEGER DEFAULT 0,
  PRIMARY KEY (rental_inventory_id, branch_id)
);

CREATE TABLE IF NOT EXISTS rentals (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  inventory_id INTEGER REFERENCES inventory(id),
  rental_inventory_id INTEGER REFERENCES rental_inventory(id),
  seller_id INTEGER,
  branch_id INTEGER REFERENCES branches(id),
  booking_date DATE DEFAULT CURRENT_DATE,
  pickup_date DATE NOT NULL,
  return_date DATE NOT NULL,
  actual_return_date DATE,
  total_price DECIMAL(10, 2) NOT NULL,
  deposit_amount DECIMAL(10, 2) DEFAULT 0,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  remaining_amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'booked',
  notes TEXT,
  daily_fine DECIMAL(10, 2) DEFAULT 50,
  fine_amount DECIMAL(10, 2) DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'cash',
  offline_uuid UUID UNIQUE,
  rental_group_uuid UUID
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(100),
  branch_id INTEGER REFERENCES branches(id),
  basic_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
  phone VARCHAR(50),
  join_date DATE DEFAULT CURRENT_DATE,
  shift_start TIME,
  shift_end TIME,
  status VARCHAR(50) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  check_in TIME,
  check_out TIME,
  status VARCHAR(50) DEFAULT 'present',
  notes TEXT,
  total_hours NUMERIC(5, 2) DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  early_departure_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS employee_transactions (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  transaction_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  offline_uuid UUID UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  expense_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  offline_uuid UUID UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'branch_user',
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  permissions JSONB DEFAULT '[]',
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS alterations (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  customer_id INTEGER REFERENCES customers(id),
  branch_id INTEGER REFERENCES branches(id),
  description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  due_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  inventory_id INTEGER
);

CREATE TABLE IF NOT EXISTS tailoring_orders (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  product_description TEXT NOT NULL,
  measurements TEXT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivery_date DATE,
  notes TEXT,
  seller_id INTEGER REFERENCES employees(id),
  branch_id INTEGER REFERENCES branches(id),
  created_by INTEGER REFERENCES users(id),
  offline_uuid UUID UNIQUE,
  pending_sync BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worn_products (
  id SERIAL PRIMARY KEY,
  product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('sales', 'rental')),
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  rental_inventory_id INTEGER REFERENCES rental_inventory(id) ON DELETE SET NULL,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  condition VARCHAR(50) DEFAULT 'worn',
  reason TEXT,
  estimated_loss NUMERIC(10, 2) DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  offline_uuid UUID UNIQUE,
  pending_sync BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id BIGSERIAL PRIMARY KEY,
  operation_uuid UUID UNIQUE NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  branch_id INTEGER,
  payload JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced_at TIMESTAMP
);
