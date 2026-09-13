-- Ticking items off in the kitchen, and refunding them at the till.
--
-- Two features, one file, because a shorter list of things to run by hand is a
-- list that actually gets run.
--
-- Every column is NULLABLE with NO DEFAULT, deliberately. A defaulted column is
-- one Prisma writes into the INSERT of every order item, which breaks order
-- creation outright on any database that hasn't run this file yet. Null reads
-- as "not prepared" and "nothing refunded", which is exactly right.
--
-- Run in the Supabase SQL editor. Idempotent; safe to run twice.

ALTER TABLE "order_items"
  -- Struck through on the kitchen display once it's plated. A working aid for
  -- the pass: it does not move the order's status and does not touch stock.
  ADD COLUMN IF NOT EXISTS "preparedAt"     TIMESTAMP(3),
  -- How many of this line were handed back, and what that came to in centavos.
  ADD COLUMN IF NOT EXISTS "refundedQty"    INTEGER,
  ADD COLUMN IF NOT EXISTS "refundedAmount" INTEGER;

-- The refunded money itself is a NEGATIVE row in payments, not a column here.
-- Every report in the app — dashboard, accounting, the shift Z-report — already
-- sums payments, so a refund lands in all three at once with no special-casing
-- and no risk of the three disagreeing again.
--
-- Nothing to add for that: payments.amount is already a signed integer.

-- ---------------------------------------------------------------------------
-- Check it.
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE column_name = 'preparedAt')     AS prepared_column,
  count(*) FILTER (WHERE column_name = 'refundedQty')    AS refunded_qty_column,
  count(*) FILTER (WHERE column_name = 'refundedAmount') AS refunded_amount_column
FROM information_schema.columns
WHERE table_name = 'order_items';
