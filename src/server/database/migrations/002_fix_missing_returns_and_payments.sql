-- Migration 002: Fix Missing Returns and Tailoring Payments Tables
-- Resolves the legacy bug where 'returns' table was referenced by 'return_items' but never declared in init_db.js

CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  return_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_return_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reason TEXT,
  seller_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  offline_uuid UUID UNIQUE,
  pending_sync BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS return_items (
  id SERIAL PRIMARY KEY,
  return_id INTEGER REFERENCES returns(id) ON DELETE CASCADE,
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_time NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS tailoring_payments (
  id SERIAL PRIMARY KEY,
  tailoring_order_id INTEGER REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_remainder BOOLEAN DEFAULT FALSE,
  offline_uuid UUID UNIQUE
);
