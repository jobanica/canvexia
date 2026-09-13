-- Abandoned-cart recovery for online ordering. Run in the Supabase SQL editor.
-- Idempotent.
CREATE TABLE IF NOT EXISTS "cart_leads" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "customerName"  TEXT,
  "customerPhone" TEXT NOT NULL,
  "itemCount"     INTEGER NOT NULL DEFAULT 0,
  "total"         INTEGER NOT NULL DEFAULT 0,
  "status"        TEXT NOT NULL DEFAULT 'open',
  "recoveredAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cart_leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cart_leads_restaurantId_status_idx" ON "cart_leads" ("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "cart_leads_restaurantId_customerPhone_idx" ON "cart_leads" ("restaurantId", "customerPhone");

DO $$ BEGIN
  ALTER TABLE "cart_leads" ADD CONSTRAINT "cart_leads_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "cart_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_leads" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cart_leads";
CREATE POLICY tenant_isolation ON "cart_leads"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "cart_leads" TO app_user;
