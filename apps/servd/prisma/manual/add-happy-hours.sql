-- Happy hour / scheduled pricing. Run in the Supabase SQL editor. Idempotent.
CREATE TABLE IF NOT EXISTS "happy_hours" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "discountType" TEXT NOT NULL DEFAULT 'percent',
  "value"        INTEGER NOT NULL DEFAULT 0,
  "scope"        TEXT NOT NULL DEFAULT 'all',
  "targetIds"    TEXT[] NOT NULL DEFAULT '{}',
  "days"         INTEGER[] NOT NULL DEFAULT '{}',
  "startMinute"  INTEGER NOT NULL DEFAULT 0,
  "endMinute"    INTEGER NOT NULL DEFAULT 0,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "happy_hours_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "happy_hours_restaurantId_active_idx"
  ON "happy_hours" ("restaurantId", "active");

DO $$ BEGIN
  ALTER TABLE "happy_hours" ADD CONSTRAINT "happy_hours_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "happy_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "happy_hours" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "happy_hours";
CREATE POLICY tenant_isolation ON "happy_hours"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "happy_hours" TO app_user;
