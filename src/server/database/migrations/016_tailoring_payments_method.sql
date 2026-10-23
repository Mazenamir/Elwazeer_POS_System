-- Migration 016: Tailoring Payments Method & Rental Payment Backfill
-- Adds payment_method column to tailoring_payments to accurately track payment methods
-- Backfills non-cash rentals where deposit > 0

ALTER TABLE tailoring_payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';

-- Backfill tailoring_payments from parent tailoring_orders
UPDATE tailoring_payments tp
SET payment_method = COALESCE(to_orders.payment_method, 'cash')
FROM tailoring_orders to_orders
WHERE tp.tailoring_order_id = to_orders.id
  AND (tp.payment_method IS NULL OR tp.payment_method = 'cash');

-- Backfill non-cash rentals that had deposit > 0 but split amounts not yet populated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rentals' AND column_name = 'deposit'
  ) THEN
    UPDATE rentals
    SET bank_transfer_amount = deposit
    WHERE payment_method IN ('bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي')
      AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
      AND (card_amount IS NULL OR card_amount = 0)
      AND (wallet_amount IS NULL OR wallet_amount = 0)
      AND (cash_amount IS NULL OR cash_amount = 0)
      AND deposit > 0;

    UPDATE rentals
    SET card_amount = deposit
    WHERE payment_method IN ('card', 'visa', 'بطاقة', 'فيزا', 'credit')
      AND (card_amount IS NULL OR card_amount = 0)
      AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
      AND (wallet_amount IS NULL OR wallet_amount = 0)
      AND (cash_amount IS NULL OR cash_amount = 0)
      AND deposit > 0;

    UPDATE rentals
    SET wallet_amount = deposit
    WHERE payment_method IN ('wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة', 'vodafone', 'vodafone_cash')
      AND (wallet_amount IS NULL OR wallet_amount = 0)
      AND (card_amount IS NULL OR card_amount = 0)
      AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
      AND (cash_amount IS NULL OR cash_amount = 0)
      AND deposit > 0;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rentals' AND column_name = 'deposit_amount'
  ) THEN
    UPDATE rentals
    SET bank_transfer_amount = deposit_amount
    WHERE payment_method IN ('bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي')
      AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
      AND (card_amount IS NULL OR card_amount = 0)
      AND (wallet_amount IS NULL OR wallet_amount = 0)
      AND (cash_amount IS NULL OR cash_amount = 0)
      AND deposit_amount > 0;

    UPDATE rentals
    SET card_amount = deposit_amount
    WHERE payment_method IN ('card', 'visa', 'بطاقة', 'فيزا', 'credit')
      AND (card_amount IS NULL OR card_amount = 0)
      AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
      AND (wallet_amount IS NULL OR wallet_amount = 0)
      AND (cash_amount IS NULL OR cash_amount = 0)
      AND deposit_amount > 0;

    UPDATE rentals
    SET wallet_amount = deposit_amount
    WHERE payment_method IN ('wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة', 'vodafone', 'vodafone_cash')
      AND (wallet_amount IS NULL OR wallet_amount = 0)
      AND (card_amount IS NULL OR card_amount = 0)
      AND (bank_transfer_amount IS NULL OR bank_transfer_amount = 0)
      AND (cash_amount IS NULL OR cash_amount = 0)
      AND deposit_amount > 0;
  END IF;
END $$;
