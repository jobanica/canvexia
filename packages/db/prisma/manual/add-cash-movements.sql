-- Cash drawer movements (cash-outs). Run in the Supabase SQL editor.
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS "cash_movements" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'cash_out',
  "amount" INTEGER NOT NULL,
  "note" TEXT,
  "staffEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cash_movements_restaurantId_createdAt_idx"
  ON "cash_movements"("restaurantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tenant isolation (matches the rest of the schema).
ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cash_movements";
CREATE POLICY tenant_isolation ON "cash_movements"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
