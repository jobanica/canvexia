-- Storefront settings: online-ordering opening hours, delivery zones & fees,
-- and the "pause orders when closed" toggle. One row per restaurant. Ships in
-- its own migration so an admin can Save storefront settings even if the big
-- full-schema-sync hasn't been run. Run in the Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS "storefront_settings" (
  "id"              TEXT NOT NULL,
  "restaurantId"    TEXT NOT NULL,
  "hours"           JSONB,                          -- [{open,close,closed}] index 0=Sun … 6=Sat
  "deliveryZones"   JSONB,                          -- [{name, fee}] fee in centavos
  "pauseWhenClosed" BOOLEAN NOT NULL DEFAULT false, -- block online orders outside hours
  CONSTRAINT "storefront_settings_pkey" PRIMARY KEY ("id")
);

-- Backfill columns on a table that already exists in a partial state.
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "hours" JSONB;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "deliveryZones" JSONB;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "pauseWhenClosed" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "storefront_settings_restaurantId_key"
  ON "storefront_settings" ("restaurantId");

DO $$ BEGIN
  ALTER TABLE "storefront_settings" ADD CONSTRAINT "storefront_settings_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "storefront_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "storefront_settings";
CREATE POLICY tenant_isolation ON "storefront_settings"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "storefront_settings" TO app_user;
