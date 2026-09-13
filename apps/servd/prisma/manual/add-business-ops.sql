-- Super-admin business-operations layer — Phase 1.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- One NEW table and a handful of NULLABLE columns on the existing CRM. Nothing
-- existing is modified or dropped, no column becomes NOT NULL, no CHECK is
-- added to existing data, and no large table is rewritten — so this is safe to
-- run during service.
--
-- ids are TEXT, not uuid. Every id in this schema is a Prisma
-- `String @default(uuid())`, which Postgres stores as TEXT; declaring these
-- columns as uuid would fail on the foreign key.

-- ---------------------------------------------------------------- new table
-- The customer event timeline. Written fire-and-forget from live paths, so a
-- failure here can never fail the order or payment it was describing.
CREATE TABLE IF NOT EXISTS "customer_events" (
  "id"           TEXT PRIMARY KEY,
  "leadId"       TEXT,
  "restaurantId" TEXT,
  "eventType"    TEXT NOT NULL,
  "actor"        TEXT,
  "amount"       INTEGER,            -- centavos, like every other money column
  "meta"         JSONB,
  "occurredAt"   TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "customer_events_restaurantId_occurredAt_idx"
  ON "customer_events" ("restaurantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "customer_events_leadId_occurredAt_idx"
  ON "customer_events" ("leadId", "occurredAt");
CREATE INDEX IF NOT EXISTS "customer_events_eventType_occurredAt_idx"
  ON "customer_events" ("eventType", "occurredAt");

-- Super-admin only, matching how the other platform tables are fenced. The app
-- reaches this through the service role, which bypasses RLS; the policy exists
-- so nothing else can read it if the anon key ever sees this table.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE "customer_events" ENABLE ROW LEVEL SECURITY';
  IF to_regprocedure('app.is_super_admin()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS customer_events_super ON "customer_events"';
    EXECUTE 'CREATE POLICY customer_events_super ON "customer_events" FOR ALL USING (app.is_super_admin()) WITH CHECK (app.is_super_admin())';
  END IF;
END $$;

-- -------------------------------------------------- columns on the live CRM
-- All nullable, no defaults. A default is a value Prisma writes into the
-- INSERT of every crm_clients row, which would break adding an outreach client
-- on a database that hasn't run this file.
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "restaurantId"  TEXT;
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "materialsAt"   TIMESTAMP(3);
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "productionAt"  TIMESTAMP(3);
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "previewSentAt" TIMESTAMP(3);
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "paidAt"        TIMESTAMP(3);
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "activatedAt"   TIMESTAMP(3);
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "assignedTo"    TEXT;
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "lostReason"    TEXT;

CREATE INDEX IF NOT EXISTS "crm_clients_restaurantId_idx"
  ON "crm_clients" ("restaurantId");

-- Check it. Expect all true.
SELECT
  to_regclass('public.customer_events') IS NOT NULL AS events_table,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='crm_clients' AND column_name='restaurantId')  AS crm_restaurant_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='crm_clients' AND column_name='previewSentAt') AS crm_preview_sent_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='crm_clients' AND column_name='paidAt')        AS crm_paid_at;

-- ------------------------------------------------------- Phase 3: ad spend
-- Typed in by hand so cost-per-lead and CAC have a real numerator. Centavos,
-- like every other money column here — the dashboard divides it by a lead
-- count, and mixing pesos and centavos in one division is how a CAC figure
-- ends up a hundred times wrong.
CREATE TABLE IF NOT EXISTS "ad_spend" (
  "id"        TEXT PRIMARY KEY,
  "spendDate" TIMESTAMP(3) NOT NULL,
  "platform"  TEXT NOT NULL DEFAULT 'facebook',
  "campaign"  TEXT,
  "amount"    INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ad_spend_spendDate_idx" ON "ad_spend" ("spendDate");

DO $$
BEGIN
  EXECUTE 'ALTER TABLE "ad_spend" ENABLE ROW LEVEL SECURITY';
  IF to_regprocedure('app.is_super_admin()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS ad_spend_super ON "ad_spend"';
    EXECUTE 'CREATE POLICY ad_spend_super ON "ad_spend" FOR ALL USING (app.is_super_admin()) WITH CHECK (app.is_super_admin())';
  END IF;
END $$;

SELECT to_regclass('public.ad_spend') IS NOT NULL AS ad_spend_table;
