-- Migration 028: Widen inventory and rental_inventory size_cut and color columns
-- Prevents PostgreSQL VARCHAR length overflow during multi-size/multi-color product creation & branch sync.

ALTER TABLE inventory ALTER COLUMN size_cut TYPE TEXT;
ALTER TABLE inventory ALTER COLUMN color TYPE VARCHAR(150);

ALTER TABLE rental_inventory ALTER COLUMN size_cut TYPE TEXT;
ALTER TABLE rental_inventory ALTER COLUMN color TYPE VARCHAR(150);
