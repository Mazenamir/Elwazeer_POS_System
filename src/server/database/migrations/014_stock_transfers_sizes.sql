-- Migration 014: Add sizes_data column to stock_transfers for tracking size/color variants in transfers
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS sizes_data TEXT;
