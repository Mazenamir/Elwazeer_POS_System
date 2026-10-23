-- Migration 003: Performance Indexes and Schema Integrity
-- Consolidates all 27 runtime ALTER TABLE statements and performance indexes

-- 1. Ensure columns exist across existing tables (safe IF NOT EXISTS)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(20) DEFAULT 'pos';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cost_price DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS rental_group_uuid UUID;
ALTER TABLE employee_transactions ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE supply_records ADD COLUMN IF NOT EXISTS purchase_batch_id UUID;
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS purchase_batch_id UUID;
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS pending_sync BOOLEAN DEFAULT FALSE;
ALTER TABLE tailoring_payments ADD COLUMN IF NOT EXISTS offline_uuid UUID UNIQUE;

-- 2. Branch Invoice Logo & Print Settings
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_logo_height INTEGER DEFAULT 160;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_logo_spacing INTEGER DEFAULT 8;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_logo_filter VARCHAR(50) DEFAULT 'black';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_logo_bg_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_logo_bg_start VARCHAR(20) DEFAULT '#ffffff';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS invoice_logo_bg_end VARCHAR(20) DEFAULT '#ffffff';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS allowed_gender VARCHAR(20) DEFAULT 'both';
ALTER TABLE branches ADD COLUMN IF NOT EXISTS cashier_footer TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS rental_footer TEXT;

-- 2b. Domain Specific Schema Compatibility Columns
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS semi_wholesale_price NUMERIC(10, 2);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10, 2);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_invoice_number INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_discount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_discount_type VARCHAR(20) DEFAULT 'amount';

ALTER TABLE rental_inventory ADD COLUMN IF NOT EXISTS gender VARCHAR(50);

ALTER TABLE rentals ADD COLUMN IF NOT EXISTS deposit NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS remaining NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS id_card_guarantee BOOLEAN DEFAULT FALSE;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS sale_order_id INTEGER;

ALTER TABLE return_items ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'amount';

ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS branch_id INTEGER;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS extra_phone VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_type VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms INTEGER;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS moq INTEGER DEFAULT 1;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS lead_time INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 5;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS total_paid NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS purchase_count INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE supply_records ADD COLUMN IF NOT EXISTS supplier_transaction_id INTEGER;

ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS due_date DATE;

-- 3. Core Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_branch_date ON orders(branch_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_orders_offline_uuid ON orders(offline_uuid);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_inventory_id ON order_items(inventory_id);

CREATE INDEX IF NOT EXISTS idx_rentals_branch_pickup_return ON rentals(branch_id, pickup_date, return_date);
CREATE INDEX IF NOT EXISTS idx_rentals_pickup_return ON rentals(pickup_date, return_date);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status);
CREATE INDEX IF NOT EXISTS idx_rentals_offline_uuid ON rentals(offline_uuid);
CREATE INDEX IF NOT EXISTS idx_rentals_group_uuid ON rentals(rental_group_uuid);

CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory(name);
CREATE INDEX IF NOT EXISTS idx_inventory_is_deleted ON inventory(is_deleted);

CREATE INDEX IF NOT EXISTS idx_rental_inventory_barcode ON rental_inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_rental_inventory_category ON rental_inventory(category);
CREATE INDEX IF NOT EXISTS idx_rental_inventory_name ON rental_inventory(name);
CREATE INDEX IF NOT EXISTS idx_rental_inventory_is_deleted ON rental_inventory(is_deleted);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_offline_uuid ON customers(offline_uuid);

CREATE INDEX IF NOT EXISTS idx_returns_branch_date ON returns(branch_id, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_offline_uuid ON returns(offline_uuid);

CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON expenses(branch_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_offline_uuid ON expenses(offline_uuid);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_employee_trans_emp_date ON employee_transactions(employee_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_trans_offline_uuid ON employee_transactions(offline_uuid);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status_attempts ON sync_queue(status, attempts);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tailoring_orders_offline_uuid ON tailoring_orders(offline_uuid);
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_invoice ON tailoring_orders(invoice_number);
CREATE INDEX IF NOT EXISTS idx_tailoring_payments_order ON tailoring_payments(tailoring_order_id);

CREATE INDEX IF NOT EXISTS idx_worn_products_branch ON worn_products(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worn_products_offline_uuid ON worn_products(offline_uuid);
