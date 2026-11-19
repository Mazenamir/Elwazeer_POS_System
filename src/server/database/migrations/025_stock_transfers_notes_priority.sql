-- 025_stock_transfers_notes_priority.sql
-- Adds notes and priority ('normal' | 'urgent') to stock_transfers for smart inter-branch requests

ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';
