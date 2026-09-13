-- Reservations & waitlist. Run in the Supabase SQL editor. Idempotent.
CREATE TABLE IF NOT EXISTS "reservations" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "customerName"  TEXT NOT NULL,
  "customerPhone" TEXT,
  "partySize"     INTEGER NOT NULL DEFAULT 2,
  "reservedAt"    TIMESTAMP(3),
  "durationMin"   INTEGER NOT NULL DEFAULT 90,
  "status"        TEXT NOT NULL DEFAULT 'booked',
  "tableId"       TEXT,
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reservations_restaurantId_reservedAt_idx" ON "reservations" ("restaurantId", "reservedAt");
CREATE INDEX IF NOT EXISTS "reservations_restaurantId_status_idx" ON "reservations" ("restaurantId", "status");

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "reservations";
CREATE POLICY tenant_isolation ON "reservations"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "reservations" TO app_user;
