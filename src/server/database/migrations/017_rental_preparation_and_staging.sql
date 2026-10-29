-- Adds preparation tracking columns to rentals
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS is_prepared BOOLEAN DEFAULT FALSE;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMP;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS prepared_by INTEGER REFERENCES employees(id);
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS prep_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_rentals_prep_status ON rentals (is_prepared, pickup_date);
