-- Migration 012: Add created_at timestamp to suppliers table and backfill existing records
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing suppliers with NULL created_at
UPDATE suppliers
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_created_at ON suppliers(created_at DESC);
