-- Customer note to the rider + uploaded online-payment receipt (online orders).
-- Idempotent: safe to run more than once.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "paymentReceiptUrl" text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "customerNote" text;
