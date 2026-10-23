-- Migration 013: Individual barcode per inventory size and multi-color size support

ALTER TABLE inventory_sizes ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_inventory_sizes_barcode ON inventory_sizes(barcode);

-- Update unique constraint to allow different colors for the same size in the same product
DROP INDEX IF EXISTS idx_inventory_sizes_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sizes_unique 
  ON inventory_sizes (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1));
