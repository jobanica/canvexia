-- Per-feature monthly subscriptions (e.g. content scheduler PHP 499/mo).
--
-- SAFE TO RE-RUN, and worth re-running: an earlier version of this file didn't
-- create every column, so a database set up from it is missing "renewUrl" and
-- rejects writes to this table. The ADD COLUMN statements at the bottom repair
-- that. Re-run the whole file whenever a query here complains that a column
-- doesn't exist.
--
-- Run in the Supabase SQL editor. Idempotent.
CREATE TABLE IF NOT EXISTS "feature_subscriptions" (
  "id"               TEXT NOT NULL,
  "restaurantId"     TEXT NOT NULL,
  "feature"          TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "priceMonthly"     INTEGER NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3),
  "providerRef"      TEXT,
  "renewUrl"         TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_subscriptions_providerRef_key"
  ON "feature_subscriptions" ("providerRef");
CREATE UNIQUE INDEX IF NOT EXISTS "feature_subscriptions_restaurantId_feature_key"
  ON "feature_subscriptions" ("restaurantId", "feature");
CREATE INDEX IF NOT EXISTS "feature_subscriptions_status_periodEnd_idx"
  ON "feature_subscriptions" ("status", "currentPeriodEnd");

DO $$ BEGIN
  ALTER TABLE "feature_subscriptions" ADD CONSTRAINT "feature_subscriptions_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "feature_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "feature_subscriptions";
CREATE POLICY tenant_isolation ON "feature_subscriptions"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "feature_subscriptions" TO app_user;

-- Repair a table created by an older version of this file. CREATE TABLE IF NOT
-- EXISTS does nothing when the table is already there, so every column has to
-- be named again here or an older install stays broken forever.
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "status"           TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "priceMonthly"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "providerRef"      TEXT;
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "renewUrl"         TEXT;
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "feature_subscriptions" ADD COLUMN IF NOT EXISTS "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Check it worked. Should list all seven columns above plus id and restaurantId.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'feature_subscriptions' ORDER BY column_name;
