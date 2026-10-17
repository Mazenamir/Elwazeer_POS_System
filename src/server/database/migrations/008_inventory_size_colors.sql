-- Migration 008: Color per inventory size while retaining one product barcode.
ALTER TABLE inventory_sizes ADD COLUMN IF NOT EXISTS color_name VARCHAR(100);

-- Existing products keep their current product-level color on their size rows.
UPDATE inventory_sizes s
SET color_name = i.color
FROM inventory i
WHERE s.inventory_id = i.id
  AND (s.color_name IS NULL OR TRIM(s.color_name) = '');

CREATE INDEX IF NOT EXISTS idx_inventory_sizes_color_name
  ON inventory_sizes (LOWER(TRIM(color_name)));
