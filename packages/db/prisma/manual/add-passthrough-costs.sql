-- CANVEXIA HQ Admin, Phase H6: pass-through cost config and usage.
--
-- Run AFTER add-hq-admin.sql, then `pnpm --filter @servd/db db:rls`. Idempotent.

-- ----------------------------------------------------------------------------
-- 1. What a unit of SMS or email costs, and what CANVEXIA adds.
--
-- ONE ROW PER CHANNEL, not per partner. These are what the PROVIDER charges and
-- what HQ marks it up by — a platform-wide commercial decision, not a per
-- partner term. Per-partner pricing, if it is ever wanted, is a `partnerId`
-- column added the same way feature_flags carries one.
--
-- CENTAVOS, and fractional units are why: a single SMS costs well under a peso,
-- so a per-unit cost in pesos would round every message to zero or to one.
-- `unitCostCentavos` is per 1000 units for the same reason — storing 0.41 as an
-- integer is not possible, storing 410 per thousand is exact.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "passthrough_costs" (
    "channel"              TEXT NOT NULL,
    -- What the provider charges, in centavos per 1000 units.
    "unitCostCentavos"     INTEGER NOT NULL DEFAULT 0,
    -- What CANVEXIA charges on top, as a percentage of the cost.
    "marginPct"            INTEGER NOT NULL DEFAULT 0,
    "note"                 TEXT,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "passthrough_costs_pkey" PRIMARY KEY ("channel")
);

DO $$ BEGIN
  ALTER TABLE "passthrough_costs"
    ADD CONSTRAINT "passthrough_costs_channel_check"
    CHECK ("channel" IN ('sms', 'email'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "passthrough_costs"
    ADD CONSTRAINT "passthrough_costs_margin_check"
    CHECK ("marginPct" >= 0 AND "marginPct" <= 500);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ZEROS, not guesses. Nobody has told this codebase what Semaphore or Resend
-- charge, and a plausible-looking default would be read off the screen as fact
-- and invoiced to a partner. HQ fills these in; until then the usage table
-- reports units and says the cost is unset.
INSERT INTO "passthrough_costs" ("channel", "unitCostCentavos", "marginPct", "note", "updatedAt")
VALUES ('sms',   0, 0, 'Not set. Enter what the provider actually charges.', CURRENT_TIMESTAMP),
       ('email', 0, 0, 'Not set. Enter what the provider actually charges.', CURRENT_TIMESTAMP)
ON CONFLICT ("channel") DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Usage, per partner per month.
--
-- A ROLLUP, written by whatever sends. It is not derived from sms_messages on
-- read because that table is merchant-scoped and has no partner arm — counting
-- across it for every partner on every page load is a table scan that grows
-- forever, and the answer for a closed month never changes.
--
-- `units` is the countable thing (messages sent). The peso figures are computed
-- from passthrough_costs at read time rather than stored, so correcting a rate
-- fixes every open month instead of only the next one.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "passthrough_usage" (
    "id"        TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    -- "2026-06", Asia/Manila, the same key partner_statements uses.
    "month"     TEXT NOT NULL,
    "channel"   TEXT NOT NULL,
    "units"     INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "passthrough_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "passthrough_usage_key"
    ON "passthrough_usage"("partnerId", "month", "channel");
CREATE INDEX IF NOT EXISTS "passthrough_usage_month_idx" ON "passthrough_usage"("month");

DO $$ BEGIN
  ALTER TABLE "passthrough_usage"
    ADD CONSTRAINT "passthrough_usage_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 3. RLS.
--
-- passthrough_costs is HQ-only: it is CANVEXIA's margin, which is nobody
-- else's business. Usage is partner-scoped — an operator may see what their own
-- merchants sent, and must not see another city's volume.
-- ----------------------------------------------------------------------------
ALTER TABLE "passthrough_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passthrough_costs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_only" ON "passthrough_costs";
CREATE POLICY "super_only" ON "passthrough_costs" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
REVOKE ALL ON "passthrough_costs" FROM anon;
REVOKE ALL ON "passthrough_costs" FROM authenticated;

ALTER TABLE "passthrough_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passthrough_usage" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_read" ON "passthrough_usage";
DROP POLICY IF EXISTS "hq_write" ON "passthrough_usage";
CREATE POLICY "partner_read" ON "passthrough_usage" FOR SELECT
  USING (app.is_super_admin() OR "partnerId" = app.current_partner_id());
-- Written by the sender running as the system. A partner writing their own
-- usage is a partner writing their own bill.
CREATE POLICY "hq_write" ON "passthrough_usage" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
REVOKE ALL ON "passthrough_usage" FROM anon;
REVOKE ALL ON "passthrough_usage" FROM authenticated;
