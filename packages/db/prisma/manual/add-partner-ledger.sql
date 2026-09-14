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
  "restaurantId"  TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS "partner_ledger_entries_restaurantId_idx"
  ON "partner_ledger_entries" ("restaurantId");

-- Expect one row, true.
SELECT 'partner_ledger_entries' AS table,
       to_regclass('public.partner_ledger_entries') IS NOT NULL AS present;
