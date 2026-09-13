-- Cashier payment details.
--
--  • bank_transfer as an in-person payment method. The online storefront
--    already accepted a bank transfer; the POS had no way to record one, so a
--    walk-in who paid by transfer had to be rung up as something else.
--  • cashTendered: what a customer says they'll pay with on a cash order, so
--    the cashier can count the change before they arrive rather than asking at
--    the door. Previously this had to be typed into the special-instructions
--    box, which in practice nobody did.
--
-- Run in the Supabase SQL editor. Idempotent, and safe to run live.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'bank_transfer';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "cashTendered" INTEGER;
