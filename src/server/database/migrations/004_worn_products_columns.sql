-- Migration 004: Add missing operational columns to worn_products, suppliers, and customers
-- Resolves DATA-01 schema drift and supports soft deletion for accounting integrity

-- 1. Worn products missing columns
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS occurred_at DATE DEFAULT CURRENT_DATE;
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'reported';

CREATE INDEX IF NOT EXISTS idx_worn_products_occurred_at ON worn_products(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_worn_products_status ON worn_products(status);

-- 2. Suppliers soft-delete / archiving column
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);

-- 3. Customers soft-delete column
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
