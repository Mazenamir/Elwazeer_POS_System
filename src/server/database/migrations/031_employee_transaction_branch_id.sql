-- Migration 031: Track actual branch_id on employee_transactions for drawer attribution
ALTER TABLE employee_transactions ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employee_trans_branch_date ON employee_transactions(branch_id, transaction_date DESC);
