-- Migration 006: Multi-Size Inventory Support
-- Allows products to have multiple sizes with individual stock quantities under the same barcode.

CREATE TABLE IF NOT EXISTS inventory_sizes (
  id SERIAL PRIMARY KEY,
  inventory_id INTEGER NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  size_id INTEGER REFERENCES sizes(id) ON DELETE SET NULL,
  size_name VARCHAR(100) NOT NULL,
  stock_level INTEGER NOT NULL DEFAULT 0,
  branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sizes_unique 
  ON inventory_sizes (inventory_id, LOWER(TRIM(size_name)), COALESCE(branch_id, 1));

CREATE INDEX IF NOT EXISTS idx_inventory_sizes_inventory_id ON inventory_sizes(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sizes_branch_id ON inventory_sizes(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sizes_name ON inventory_sizes(LOWER(TRIM(size_name)));

-- Add size column to order_items to record the sold size
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size VARCHAR(100);

-- Backfill from inventory_branches for each branch
INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
SELECT 
  ib.inventory_id,
  i.size_id,
  COALESCE(NULLIF(TRIM(i.size_cut), ''), 'عادي') AS size_name,
  COALESCE(ib.stock_level, 0) AS stock_level,
  ib.branch_id
FROM inventory_branches ib
JOIN inventory i ON i.id = ib.inventory_id
WHERE i.is_deleted = FALSE
ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), COALESCE(branch_id, 1)) 
DO UPDATE SET stock_level = EXCLUDED.stock_level;

-- Also handle any active inventory items that have no inventory_branches rows
INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
SELECT 
  i.id,
  i.size_id,
  COALESCE(NULLIF(TRIM(i.size_cut), ''), 'عادي') AS size_name,
  COALESCE(i.stock_level, 0) AS stock_level,
  1 AS branch_id
FROM inventory i
WHERE i.is_deleted = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM inventory_sizes s WHERE s.inventory_id = i.id
  )
ON CONFLICT DO NOTHING;
