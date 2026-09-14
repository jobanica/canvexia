-- CANVEXIA Phase 4c — the settlement ledger (D15).
--
-- Run in the Supabase SQL editor, then `npm run db:rls` to install the policy
-- that keeps merchants out of it. Idempotent.
--
-- Every successful payment, recorded against the partner that owns the merchant.
-- Append-only: a refund is a new row, never an edit, so a past month's statement
-- recomputes to the same number instead of drifting as adjustments land.

CREATE TABLE IF NOT EXISTS "partner_ledger_entries" (
  "id"            TEXT PRIMARY KEY,
  "partnerId"     TEXT NOT NULL,
  -- Which product the merchant belongs to, and its id WITHIN that product.
  -- Not a foreign key and cannot be one: the table "merchantId" indexes
  -- depends on "productId". Defaults to 'servd' because that was the only
  -- product when this file was first written.
  "productId"     TEXT NOT NULL DEFAULT 'servd',
  "merchantId"    TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "providerRef"   TEXT NOT NULL,
  "grossAmount"   INTEGER NOT NULL,
  "partnerAmount" INTEGER NOT NULL,
  "hqAmount"      INTEGER NOT NULL,
  "sharePct"      INTEGER NOT NULL,
  "currency"      TEXT NOT NULL DEFAULT 'PHP',
  "occurredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The idempotency guarantee. Gateways replay webhooks; without this a replay
-- would credit a partner twice for one payment.
CREATE UNIQUE INDEX IF NOT EXISTS "partner_ledger_entries_providerRef_key"
  ON "partner_ledger_entries" ("providerRef");

CREATE INDEX IF NOT EXISTS "partner_ledger_entries_partnerId_occurredAt_idx"
  ON "partner_ledger_entries" ("partnerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "partner_ledger_entries_productId_merchantId_idx"
  ON "partner_ledger_entries" ("productId", "merchantId");

-- Rename forward for any database that applied the first version of this file.
-- No-ops on a table that already has the new shape.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'partner_ledger_entries'
                AND column_name = 'restaurantId') THEN
    ALTER TABLE "partner_ledger_entries" RENAME COLUMN "restaurantId" TO "merchantId";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'partner_ledger_entries'
                    AND column_name = 'productId') THEN
    ALTER TABLE "partner_ledger_entries" ADD COLUMN "productId" TEXT NOT NULL DEFAULT 'servd';
  END IF;
END $$;
DROP INDEX IF EXISTS "partner_ledger_entries_restaurantId_idx";

-- Expect one row, all true.
SELECT 'partner_ledger_entries' AS table,
       to_regclass('public.partner_ledger_entries') IS NOT NULL AS present,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'partner_ledger_entries'
                  AND column_name = 'merchantId') AS has_merchant_id,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'partner_ledger_entries'
                  AND column_name = 'productId') AS has_product_id;
