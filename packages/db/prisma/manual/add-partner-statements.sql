-- Partner portal A4: frozen monthly statements and per-partner plan pricing.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- partner_statements holds ONLY what recomputation cannot produce: the moment a
-- month was closed, and the payout status HQ edits. Every number in it is
-- derivable from partner_ledger_entries, which is append-only and carries the
-- share percentage that applied when each payment settled — so this table is a
-- cache of an answer, never the answer.

CREATE TABLE IF NOT EXISTS "partner_statements" (
    "id"              TEXT NOT NULL,
    "partnerId"       TEXT NOT NULL,
    -- "2026-06", in Asia/Manila. Computing the boundary in UTC would put eight
    -- hours of 31 December into January.
    "month"           TEXT NOT NULL,
    "grossCentavos"   INTEGER NOT NULL,
    "partnerCentavos" INTEGER NOT NULL,
    "hqCentavos"      INTEGER NOT NULL,
    "merchantCount"   INTEGER NOT NULL,
    "frozenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payoutStatus"    TEXT NOT NULL DEFAULT 'pending',
    "paidAt"          TIMESTAMP(3),
    "note"            TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_statements_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "partner_statements"
    ADD CONSTRAINT "partner_statements_status_check"
    CHECK ("payoutStatus" IN ('pending', 'paid', 'overdue'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One statement per partner per month. This is what makes the freeze job
-- idempotent: a cron that runs twice cannot double anything.
CREATE UNIQUE INDEX IF NOT EXISTS "partner_statements_partnerId_month_key"
  ON "partner_statements"("partnerId", "month");
CREATE INDEX IF NOT EXISTS "partner_statements_partnerId_month_idx"
  ON "partner_statements"("partnerId", "month");

DO $$ BEGIN
  ALTER TABLE "partner_statements"
    ADD CONSTRAINT "partner_statements_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "partner_plan_prices" (
    "id"              TEXT NOT NULL,
    "partnerId"       TEXT NOT NULL,
    "planId"          TEXT NOT NULL,
    "priceMonthly"    INTEGER NOT NULL,
    "applyToExisting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_plan_prices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_plan_prices_partnerId_planId_key"
  ON "partner_plan_prices"("partnerId", "planId");

DO $$ BEGIN
  ALTER TABLE "partner_plan_prices"
    ADD CONSTRAINT "partner_plan_prices_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "partner_plan_prices"
    ADD CONSTRAINT "partner_plan_prices_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- RLS.
--
-- Pricing is READ-WRITE to the partner: it is their price. Statements are
-- READ-ONLY — a partner able to write here is a partner writing their own
-- statement, which is the same reason partner_ledger_entries is read-only to
-- them.
-- ----------------------------------------------------------------------------
ALTER TABLE "partner_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_statements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS statement_read ON "partner_statements";
DROP POLICY IF EXISTS statement_write ON "partner_statements";
CREATE POLICY statement_read ON "partner_statements" FOR SELECT
  USING (app.is_super_admin() OR "partnerId" = app.current_partner_id());
CREATE POLICY statement_write ON "partner_statements" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "partner_plan_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_plan_prices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_scope ON "partner_plan_prices";
CREATE POLICY partner_scope ON "partner_plan_prices" FOR ALL
  USING (app.is_super_admin() OR "partnerId" = app.current_partner_id())
  WITH CHECK (app.is_super_admin() OR "partnerId" = app.current_partner_id());

-- Both carry commercial terms between CANVEXIA and the operator. Neither is any
-- browser's business.
REVOKE ALL ON "partner_statements" FROM anon, authenticated;
REVOKE ALL ON "partner_plan_prices" FROM anon, authenticated;
