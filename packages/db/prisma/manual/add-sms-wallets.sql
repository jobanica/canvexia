-- A8.2: prepaid SMS credits for partner operators.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- ONE CREDIT IS ONE SEGMENT, not one message. A 200-character text is two
-- segments and costs two credits, because that is what the aggregator charges
-- for it; a wallet that counted messages would drift from the bill by exactly
-- the amount nobody notices until the month it matters.

-- ----------------------------------------------------------------------------
-- 1. The wallet.
--
-- A ROW PER PARTNER, with the balance ON it rather than derived from the
-- ledger. A derived balance is the "correct" design and the wrong one here: a
-- send has to answer "can I afford this?" in one indexed read, and a sum over
-- a growing ledger gets slower exactly as a partner sends more. The ledger
-- stays the audit trail, and `verify-sms-wallets.sql` is what proves the two
-- still agree.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sms_wallets" (
  "partnerId"       TEXT PRIMARY KEY REFERENCES "partners"("id") ON DELETE CASCADE,
  "balanceCredits"  INTEGER NOT NULL DEFAULT 0,
  /* Set when the 10%-remaining warning has gone out, cleared by a top-up, so
     the warning arrives once per drain rather than on every send. */
  "lowNotifiedAt"   TIMESTAMP(3),
  /* The size of the last top-up, which is what "10% remaining" is 10% OF. */
  "lastTopUpCredits" INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_wallets_balance_check" CHECK ("balanceCredits" >= 0)
);

-- ----------------------------------------------------------------------------
-- 2. The top-ups.
--
-- A row per attempted purchase, because the gateway reference has to point at
-- something on the way back. `providerRef` is UNIQUE: a webhook that arrives
-- twice — which they do — must credit the wallet once.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sms_topups" (
  "id"             TEXT PRIMARY KEY,
  "partnerId"      TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "credits"        INTEGER NOT NULL,
  /* Centavos, as everything else in this codebase stores money. */
  "amountCentavos" INTEGER NOT NULL,
  /* pending | paid | failed */
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "providerRef"    TEXT,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"         TIMESTAMP(3),

  CONSTRAINT "sms_topups_status_check" CHECK ("status" IN ('pending', 'paid', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_topups_providerRef_key"
  ON "sms_topups" ("providerRef") WHERE "providerRef" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "sms_topups_partnerId_idx" ON "sms_topups" ("partnerId");

-- ----------------------------------------------------------------------------
-- 3. What a segment costs US — deliberately NOT a new column.
--
-- The first version of this file added `platform_settings.smsProviderCostCentavos`.
-- That was a duplicate: `passthrough_costs` already holds a per-channel rate and
-- a margin, the HQ billing screen already edits it, and its reader already
-- reports NULL rather than zero when nobody has entered a rate — which is the
-- exact property this number needs. Two columns would be two things to keep in
-- step, and the one that drifts is the one on the statement.
--
-- So the SMS rate is a row in `passthrough_costs` with channel 'sms', and
-- `providerCostLine()` in packages/core takes centavos per THOUSAND segments to
-- match it. Nothing here creates that row: the rate is not in this repository
-- and will not be invented. Until somebody enters it, the statement says
-- "provider cost not configured".
