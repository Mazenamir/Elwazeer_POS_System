-- Migration 020: Add payment_method and paid_from_drawer to supplier_transactions
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';
ALTER TABLE supplier_transactions ADD COLUMN IF NOT EXISTS paid_from_drawer BOOLEAN DEFAULT TRUE;
