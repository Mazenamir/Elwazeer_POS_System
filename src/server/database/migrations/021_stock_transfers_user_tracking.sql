-- Migration 021: Add user tracking columns to stock_transfers
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS received_by_name VARCHAR(255);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_sender_id ON stock_transfers(sender_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_received_by ON stock_transfers(received_by);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_by ON stock_transfers(created_by);
