-- Per-item sizes/variants (e.g. fish or pork sold by size/weight): one menu item
-- with several named options, each its own price. The chosen size replaces the
-- item's base price — separate from modifiers. Own table so existing menu_items
-- reads stay safe on a lagging DB. Run in the Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS "menu_item_variants" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "menuItemId"   TEXT NOT NULL,
  "name"         TEXT NOT NULL,             -- "Small", "1/2 kilo", "Large", …
  "price"        INTEGER NOT NULL,          -- absolute price in centavos
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_item_variants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "menu_item_variants_menuItemId_idx" ON "menu_item_variants" ("menuItemId");
CREATE INDEX IF NOT EXISTS "menu_item_variants_restaurantId_idx" ON "menu_item_variants" ("restaurantId");

DO $$ BEGIN
  ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "menu_item_variants" ADD CONSTRAINT "menu_item_variants_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "menu_item_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_item_variants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "menu_item_variants";
CREATE POLICY tenant_isolation ON "menu_item_variants"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "menu_item_variants" TO app_user;
