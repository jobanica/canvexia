-- A8.0: lift the SMS stack from one axis to two.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- WHAT THIS IS AND IS NOT. The SMS stack has existed and worked since the
-- merchant product shipped, scoped entirely to `restaurantId`. A8 is not "build
-- SMS" — it is "add a partner axis to a live system", the same job D29 did for
-- merchants, and the risk is not missing features but breaking something that
-- currently works. So this file adds NOTHING but the second axis.
--
-- EXACTLY ONE AXIS PER ROW, enforced by a CHECK rather than by convention. A
-- campaign belongs to a restaurant or to a partner operator, never both and
-- never neither: "neither" is a row nothing can ever read again, and "both" is a
-- row two different tenants can read.

-- ----------------------------------------------------------------------------
-- 1. The columns.
--
-- `restaurantId` becomes NULLABLE on these three. That is the only destructive-
-- looking statement here and it is safe in this direction: dropping NOT NULL
-- never rejects an existing row, and every existing row keeps its value.
-- ----------------------------------------------------------------------------
ALTER TABLE "sms_campaigns"     ADD COLUMN IF NOT EXISTS "partnerId" TEXT
  REFERENCES "partners"("id") ON DELETE CASCADE;
ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "partnerId" TEXT
  REFERENCES "partners"("id") ON DELETE CASCADE;

ALTER TABLE "sms_campaigns"     ALTER COLUMN "restaurantId" DROP NOT NULL;
ALTER TABLE "sms_credit_ledger" ALTER COLUMN "restaurantId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "sms_campaigns_partnerId_idx"     ON "sms_campaigns" ("partnerId");
CREATE INDEX IF NOT EXISTS "sms_credit_ledger_partnerId_idx" ON "sms_credit_ledger" ("partnerId");

-- ----------------------------------------------------------------------------
-- 2. Exactly one axis.
--
-- Written as a NOT-EQUAL on two null tests, which is XOR without the word: true
-- when precisely one of the two is present.
-- ----------------------------------------------------------------------------
DO $$
DECLARE bad INT;
BEGIN
  SELECT count(*) INTO bad FROM "sms_campaigns"
   WHERE ("restaurantId" IS NULL) = ("partnerId" IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'sms_campaigns has % row(s) with neither axis or both', bad;
  END IF;
  SELECT count(*) INTO bad FROM "sms_credit_ledger"
   WHERE ("restaurantId" IS NULL) = ("partnerId" IS NULL);
  IF bad > 0 THEN
    RAISE EXCEPTION 'sms_credit_ledger has % row(s) with neither axis or both', bad;
  END IF;
END $$;

ALTER TABLE "sms_campaigns" DROP CONSTRAINT IF EXISTS "sms_campaigns_one_axis";
ALTER TABLE "sms_campaigns"
  ADD CONSTRAINT "sms_campaigns_one_axis"
  CHECK (("restaurantId" IS NULL) <> ("partnerId" IS NULL));

ALTER TABLE "sms_credit_ledger" DROP CONSTRAINT IF EXISTS "sms_credit_ledger_one_axis";
ALTER TABLE "sms_credit_ledger"
  ADD CONSTRAINT "sms_credit_ledger_one_axis"
  CHECK (("restaurantId" IS NULL) <> ("partnerId" IS NULL));

-- ----------------------------------------------------------------------------
-- 3. sms_messages gets NO axis column, deliberately.
--
-- A message hangs off a campaign the way an order item hangs off an order, and
-- its RLS policy is already a semi-join to `sms_campaigns`. Copying the axis
-- onto the child would create a second place for the two to disagree — and a
-- message whose axis disagrees with its campaign's is a message readable by a
-- tenant the campaign was never for. The semi-join is widened in rls.sql
-- instead.
--
-- `contactId` DOES become nullable, because A8.1 introduces `sms_contacts` for
-- the partner axis and a partner's message has no `customer_contacts` row to
-- point at. The FK stays for the merchant axis.
-- ----------------------------------------------------------------------------
ALTER TABLE "sms_messages" ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "toPhone" TEXT;

-- Backfill: every existing message's recipient, copied from its contact, so the
-- column is true for history rather than only for rows written from now on.
UPDATE "sms_messages" m
   SET "toPhone" = c."phone"
  FROM "customer_contacts" c
 WHERE c."id" = m."contactId" AND m."toPhone" IS NULL;
