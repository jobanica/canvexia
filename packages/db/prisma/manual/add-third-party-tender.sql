-- Settling a Grab / Foodpanda ticket.
--
-- Nothing is tendered at the counter on a third-party order: the rider collects
-- the food and the platform remits later. Until now the only way to close that
-- ticket was to ring it up as cash, card or GCash — money nobody took — which
-- put it in the wrong column of every report and left the drawer over by the
-- amount at cash-out.
--
-- This adds one value to the payment-method enum so those sales can be closed
-- as what they are, and counted on their own line.
--
-- NOTE ON ENUMS. `ALTER TYPE ... ADD VALUE` cannot run inside a transaction
-- block on PostgreSQL before 12, and the Supabase SQL editor wraps statements.
-- Run this file ON ITS OWN, not pasted together with another migration. If the
-- editor complains about a transaction block, run just the ALTER TYPE line by
-- itself.
--
-- Idempotent (IF NOT EXISTS); safe to run twice.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'third_party';

-- ---------------------------------------------------------------------------
-- Check it. Should list every method including third_party.
-- ---------------------------------------------------------------------------
SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder) AS payment_methods
FROM pg_enum
WHERE enumtypid = 'public."PaymentMethod"'::regtype;
