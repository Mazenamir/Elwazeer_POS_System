-- Add commission_rate column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5, 2) DEFAULT 0;
