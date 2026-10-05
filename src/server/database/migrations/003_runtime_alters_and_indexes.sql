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
