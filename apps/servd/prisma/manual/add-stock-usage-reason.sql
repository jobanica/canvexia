-- Stock movement reason for manually taken/requested ingredients (prep, staff
-- meal, etc.) so withdrawals are distinct from corrections. Run in the Supabase
-- SQL editor. Idempotent.
ALTER TYPE "StockReason" ADD VALUE IF NOT EXISTS 'usage';
