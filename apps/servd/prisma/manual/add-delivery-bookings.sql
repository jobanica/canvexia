-- Third-party delivery rider booking. Two standalone tables (FKs to orders /
-- restaurants enforced here in SQL, no Prisma relations) so existing order /
-- restaurant reads are never affected on a lagging DB. Run in the Supabase SQL
-- editor. Idempotent.

-- Per-restaurant provider choice + (encrypted) API credentials.
CREATE TABLE IF NOT EXISTS "delivery_settings" (
  "id"               TEXT NOT NULL,
  "restaurantId"     TEXT NOT NULL,
  "provider"         TEXT NOT NULL DEFAULT 'manual', -- manual | deeplink | api
  "providerKey"      TEXT,                            -- informational, e.g. 'lalamove'
  "deepLinkTemplate" TEXT,                            -- URL with {pickup}/{dropoff}/... tokens
  "apiBaseUrl"       TEXT,
  "credentialsEnc"   TEXT,                            -- encryptJson({ apiKey, webhookSecret })
  "enabled"          BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_settings_restaurantId_key" ON "delivery_settings" ("restaurantId");

-- One rider booking per order (re-booking updates the row).
CREATE TABLE IF NOT EXISTS "delivery_bookings" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "provider"     TEXT NOT NULL,
  "providerKey"  TEXT,
  "bookingRef"   TEXT,                          -- provider's booking id
  "status"       TEXT NOT NULL DEFAULT 'manual', -- searching|assigned|picked_up|delivered|cancelled|failed|manual
  "fee"          INTEGER,                        -- centavos
  "etaMinutes"   INTEGER,
  "riderName"    TEXT,
  "riderPhone"   TEXT,
  "riderLat"     DOUBLE PRECISION,
  "riderLng"     DOUBLE PRECISION,
  "trackingUrl"  TEXT,
  "raw"          JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_bookings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_bookings_orderId_key" ON "delivery_bookings" ("orderId");
CREATE INDEX IF NOT EXISTS "delivery_bookings_restaurantId_idx" ON "delivery_bookings" ("restaurantId");
CREATE INDEX IF NOT EXISTS "delivery_bookings_bookingRef_idx" ON "delivery_bookings" ("bookingRef");

DO $$ BEGIN
  ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "delivery_bookings" ADD CONSTRAINT "delivery_bookings_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "delivery_bookings" ADD CONSTRAINT "delivery_bookings_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "delivery_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "delivery_settings";
CREATE POLICY tenant_isolation ON "delivery_settings"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "delivery_settings" TO app_user;

ALTER TABLE "delivery_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_bookings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "delivery_bookings";
CREATE POLICY tenant_isolation ON "delivery_bookings"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "delivery_bookings" TO app_user;
