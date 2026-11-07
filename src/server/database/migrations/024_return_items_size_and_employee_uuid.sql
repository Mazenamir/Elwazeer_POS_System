-- Migration 024: Add size to return_items and offline_uuid to employees

ALTER TABLE return_items ADD COLUMN IF NOT EXISTS size VARCHAR(50);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS offline_uuid VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_return_items_size ON return_items(size);
CREATE INDEX IF NOT EXISTS idx_employees_offline_uuid ON employees(offline_uuid);
