-- One-time add-on purchases (the ₱500 custom-domain unlock for Free/trial
-- accounts). Kept separate from "restaurant_invoices" so paying one never
-- activates a subscription. Run in the Supabase SQL editor. Idempotent.
CREATE TABLE IF NOT EXISTS "addon_purchases" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "addon"        TEXT NOT NULL,
  "amount"       INTEGER NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "providerRef"  TEXT,
  "paidAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "addon_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "addon_purchases_providerRef_key"
  ON "addon_purchases" ("providerRef");
CREATE INDEX IF NOT EXISTS "addon_purchases_restaurantId_addon_idx"
  ON "addon_purchases" ("restaurantId", "addon");

DO $$ BEGIN
  ALTER TABLE "addon_purchases" ADD CONSTRAINT "addon_purchases_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "addon_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addon_purchases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "addon_purchases";
CREATE POLICY tenant_isolation ON "addon_purchases"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "addon_purchases" TO app_user;
