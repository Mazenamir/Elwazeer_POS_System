-- 026_worn_products_variants.sql
-- Adds color_name, size_name, sizes_data, and deduct_stock columns to worn_products

ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS color_name VARCHAR(100);
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS size_name VARCHAR(100);
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS sizes_data TEXT;
ALTER TABLE worn_products ADD COLUMN IF NOT EXISTS deduct_stock BOOLEAN DEFAULT TRUE;
