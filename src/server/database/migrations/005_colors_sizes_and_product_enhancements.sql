-- Migration 005: Colors, Sizes, and Product Enhancements
-- Adds relational colors and sizes tables, preserves backward compatibility on inventory table,
-- and backfills existing colors and sizes.

-- 1. Create colors table
CREATE TABLE IF NOT EXISTS colors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_colors_name_lower ON colors (LOWER(TRIM(name)));

-- 2. Create sizes table
CREATE TABLE IF NOT EXISTS sizes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sizes_name_lower ON sizes (LOWER(TRIM(name)));

-- 3. Add foreign keys to inventory
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS color_id INTEGER REFERENCES colors(id) ON DELETE SET NULL;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS size_id INTEGER REFERENCES sizes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_color_id ON inventory(color_id);
CREATE INDEX IF NOT EXISTS idx_inventory_size_id ON inventory(size_id);

-- Also add columns to rental_inventory for relational consistency
ALTER TABLE rental_inventory ADD COLUMN IF NOT EXISTS color_id INTEGER REFERENCES colors(id) ON DELETE SET NULL;
ALTER TABLE rental_inventory ADD COLUMN IF NOT EXISTS size_id INTEGER REFERENCES sizes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rental_inventory_color_id ON rental_inventory(color_id);
CREATE INDEX IF NOT EXISTS idx_rental_inventory_size_id ON rental_inventory(size_id);

-- 4. Seed/Backfill distinct colors from existing inventory and rental_inventory
INSERT INTO colors (name)
SELECT DISTINCT TRIM(sub.color)
FROM (
  SELECT color FROM inventory WHERE color IS NOT NULL AND TRIM(color) != ''
  UNION
  SELECT color FROM rental_inventory WHERE color IS NOT NULL AND TRIM(color) != ''
) sub
WHERE NOT EXISTS (
  SELECT 1 FROM colors WHERE LOWER(TRIM(colors.name)) = LOWER(TRIM(sub.color))
)
ON CONFLICT DO NOTHING;

-- 5. Seed/Backfill distinct sizes from existing inventory and rental_inventory
INSERT INTO sizes (name)
SELECT DISTINCT TRIM(sub.size_cut)
FROM (
  SELECT size_cut FROM inventory WHERE size_cut IS NOT NULL AND TRIM(size_cut) != ''
  UNION
  SELECT size_cut FROM rental_inventory WHERE size_cut IS NOT NULL AND TRIM(size_cut) != ''
) sub
WHERE NOT EXISTS (
  SELECT 1 FROM sizes WHERE LOWER(TRIM(sizes.name)) = LOWER(TRIM(sub.size_cut))
)
ON CONFLICT DO NOTHING;

-- 6. Link color_id in inventory
UPDATE inventory i
SET color_id = c.id
FROM colors c
WHERE i.color IS NOT NULL 
  AND TRIM(i.color) != '' 
  AND LOWER(TRIM(i.color)) = LOWER(TRIM(c.name))
  AND i.color_id IS NULL;

-- 7. Link size_id in inventory
UPDATE inventory i
SET size_id = s.id
FROM sizes s
WHERE i.size_cut IS NOT NULL 
  AND TRIM(i.size_cut) != '' 
  AND LOWER(TRIM(i.size_cut)) = LOWER(TRIM(s.name))
  AND i.size_id IS NULL;

-- 8. Link color_id in rental_inventory
UPDATE rental_inventory ri
SET color_id = c.id
FROM colors c
WHERE ri.color IS NOT NULL 
  AND TRIM(ri.color) != '' 
  AND LOWER(TRIM(ri.color)) = LOWER(TRIM(c.name))
  AND ri.color_id IS NULL;

-- 9. Link size_id in rental_inventory
UPDATE rental_inventory ri
SET size_id = s.id
FROM sizes s
WHERE ri.size_cut IS NOT NULL 
  AND TRIM(ri.size_cut) != '' 
  AND LOWER(TRIM(ri.size_cut)) = LOWER(TRIM(s.name))
  AND ri.size_id IS NULL;
