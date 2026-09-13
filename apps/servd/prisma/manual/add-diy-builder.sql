-- DIY self-serve builder: a public, no-login funnel where an owner builds their
-- own ordering page, previews it, and pays ₱499 to activate it as a real
-- account. Runs ALONGSIDE the manual super-admin onboarding — existing rows are
-- untouched (they stay status='active' / builtVia='manual').
--
-- Run in the Supabase SQL editor. Idempotent.

-- 1. New restaurant states. 'preview' = built but not paid for; 'archived' =
--    a stale preview whose media we dropped. Postgres requires enum values to
--    be added outside a transaction block, one at a time.
ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'preview';
ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'archived';

-- 2. Builder columns on the existing restaurants table.
ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "buildToken" TEXT,
  ADD COLUMN IF NOT EXISTS "builtVia" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "contactPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "contactFb" TEXT,
  ADD COLUMN IF NOT EXISTS "previewCreatedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "previewReachedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "activationRequestedAt" TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_buildToken_key"
  ON "restaurants" ("buildToken");

-- 3. The activation queue. One row per "activate for ₱499" attempt; its id is
--    the Xendit invoice external_id.
CREATE TABLE IF NOT EXISTS "activation_requests" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "restaurantId"  TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "amount"        INTEGER NOT NULL DEFAULT 49900,
  "contactPhone"  TEXT,
  "contactFb"     TEXT,
  "note"          TEXT,
  "providerRef"   TEXT,
  "checkoutUrl"   TEXT,
  "loginUsername" TEXT,
  "paidAt"        TIMESTAMPTZ,
  "activatedAt"   TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activation_requests_restaurantId_fkey'
  ) THEN
    ALTER TABLE "activation_requests"
      ADD CONSTRAINT "activation_requests_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "activation_requests_providerRef_key"
  ON "activation_requests" ("providerRef");
CREATE INDEX IF NOT EXISTS "activation_requests_status_createdAt_idx"
  ON "activation_requests" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "activation_requests_restaurantId_idx"
  ON "activation_requests" ("restaurantId");

ALTER TABLE "activation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activation_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "activation_requests";
CREATE POLICY tenant_isolation ON "activation_requests"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "activation_requests" TO app_user;

-- 4. Fixed-window rate limiting for the unauthenticated builder endpoints.
--    Platform-level: only ever written through the service role.
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "id"       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "bucket"   TEXT NOT NULL,
  "key"      TEXT NOT NULL,
  "windowAt" TIMESTAMPTZ NOT NULL,
  "count"    INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limits_bucket_key_windowAt_key"
  ON "rate_limits" ("bucket", "key", "windowAt");
CREATE INDEX IF NOT EXISTS "rate_limits_windowAt_idx" ON "rate_limits" ("windowAt");

ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "rate_limits";
CREATE POLICY super_only ON "rate_limits"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limits" TO app_user;
