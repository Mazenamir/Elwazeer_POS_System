-- Migration 022: Elwazeer Accounting & Operations Enhancements
-- Adds refund_method to returns, actual_pickup_date to rentals, wallet_balance to customers, and payment tracking tables

-- 1. Returns refund method
ALTER TABLE returns ADD COLUMN IF NOT EXISTS refund_method VARCHAR(50) DEFAULT 'cash';

-- 2. Rental actual pickup date
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS actual_pickup_date TIMESTAMP;

-- 3. Customer wallet balance
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;

-- 4. Order Remaining Payments tracking
CREATE TABLE IF NOT EXISTS order_payments (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'cash',
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  branch_id INT REFERENCES branches(id),
  seller_id INT REFERENCES employees(id),
  notes TEXT,
  offline_uuid UUID
);
CREATE INDEX IF NOT EXISTS idx_order_payments_date ON order_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

-- 5. Rental Remaining Payments tracking
CREATE TABLE IF NOT EXISTS rental_payments (
  id SERIAL PRIMARY KEY,
  rental_id INT REFERENCES rentals(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'cash',
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  branch_id INT REFERENCES branches(id),
  seller_id INT REFERENCES employees(id),
  notes TEXT,
  offline_uuid UUID
);
CREATE INDEX IF NOT EXISTS idx_rental_payments_date ON rental_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_rental_payments_rental ON rental_payments(rental_id);
