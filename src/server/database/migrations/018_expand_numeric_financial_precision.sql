-- Migration 018: Expand financial columns from NUMERIC(10, 2) to NUMERIC(16, 2)
-- Resolves numeric field overflow error (22003) when adding large stock quantities or supplier batches

ALTER TABLE suppliers ALTER COLUMN balance TYPE NUMERIC(16, 2);
ALTER TABLE suppliers ALTER COLUMN total_purchases TYPE NUMERIC(16, 2);
ALTER TABLE suppliers ALTER COLUMN total_paid TYPE NUMERIC(16, 2);

ALTER TABLE supplier_transactions ALTER COLUMN amount TYPE NUMERIC(16, 2);
ALTER TABLE supply_records ALTER COLUMN cost_price TYPE NUMERIC(16, 2);

ALTER TABLE orders ALTER COLUMN total_amount TYPE NUMERIC(16, 2);
ALTER TABLE orders ALTER COLUMN paid_amount TYPE NUMERIC(16, 2);
ALTER TABLE orders ALTER COLUMN total_cost_price TYPE NUMERIC(16, 2);
ALTER TABLE orders ALTER COLUMN profit TYPE NUMERIC(16, 2);

ALTER TABLE customers ALTER COLUMN total_spent TYPE NUMERIC(16, 2);
