-- Per-item daily servings cap. Admin sets how many servings of a menu item are
-- available per day; once that many are sold the item auto-marks sold out, and
-- the count resets each (Manila) day. Kept in its own table so existing
-- menu_items reads/writes are never touched on a lagging DB. Run in the Supabase
-- SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS "menu_item_servings" (
  "menuItemId"   TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "dailyLimit"   INTEGER,            -- null = unlimited (no cap)
  "soldToday"    INTEGER NOT NULL DEFAULT 0,
  "soldOn"       TEXT,               -- Manila day key (YYYY-MM-DD) the count belongs to
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_item_servings_pkey" PRIMARY KEY ("menuItemId")
);
CREATE INDEX IF NOT EXISTS "menu_item_servings_restaurantId_idx"
  ON "menu_item_servings" ("restaurantId");

DO $$ BEGIN
  ALTER TABLE "menu_item_servings" ADD CONSTRAINT "menu_item_servings_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "menu_item_servings" ADD CONSTRAINT "menu_item_servings_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "menu_item_servings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_item_servings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "menu_item_servings";
CREATE POLICY tenant_isolation ON "menu_item_servings"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "menu_item_servings" TO app_user;
