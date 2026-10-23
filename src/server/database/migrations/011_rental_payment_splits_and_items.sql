-- Migration 011: Rental Payment Splits and Multi-Item Custom Accessories Support
-- Enables split payment per rental booking (Cash + Card / Instapay / Wallet)
-- and custom accessories tracking

ALTER TABLE rentals ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS cash_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS card_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS wallet_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS bank_transfer_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS payment_splits JSONB;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS custom_items JSONB;

-- Backfill existing rentals
UPDATE rentals
SET cash_amount = deposit
WHERE (payment_method IN ('cash', 'نقدي', 'كاش') OR payment_method IS NULL)
  AND (cash_amount IS NULL OR cash_amount = 0)
  AND deposit > 0;

CREATE INDEX IF NOT EXISTS idx_rentals_payment_method ON rentals(payment_method);
CREATE INDEX IF NOT EXISTS idx_rentals_group_uuid ON rentals(rental_group_uuid);
