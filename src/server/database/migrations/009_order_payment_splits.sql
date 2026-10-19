-- Migration 009: Split Payments and Non-Cash (Instapay/Bank Transfer/Wallet) Tracking
-- Enables split payment per order and exact non-cash separation from cash drawer

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bank_transfer_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_splits JSONB;

-- Backfill existing orders so cash drawer queries remain consistent
UPDATE orders
SET cash_amount = GREATEST(0, paid_amount - COALESCE(change_amount, 0))
WHERE (payment_method IN ('cash', 'نقدي', 'كاش') OR payment_method IS NULL)
  AND (cash_amount IS NULL OR cash_amount = 0)
  AND paid_amount > 0;

UPDATE orders
SET card_amount = paid_amount
WHERE payment_method IN ('card', 'visa', 'فيزا', 'بطاقة')
  AND (card_amount IS NULL OR card_amount = 0)
  AND paid_amount > 0;

UPDATE orders
SET wallet_amount = paid_amount
WHERE payment_method IN ('wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة')
  AND (wallet_amount IS NULL OR wallet_amount = 0)
  AND paid_amount > 0;

UPDATE orders
SET bank_transfer_amount = paid_amount
WHERE payment_method IN ('bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي', 'تحويل')
  AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
  AND paid_amount > 0;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_cash_amount ON orders(cash_amount);
CREATE INDEX IF NOT EXISTS idx_orders_bank_transfer_amount ON orders(bank_transfer_amount);
