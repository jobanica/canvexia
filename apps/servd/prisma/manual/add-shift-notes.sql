-- Shift handover notes. Run in the Supabase SQL editor. Idempotent.
CREATE TABLE IF NOT EXISTS "shift_notes" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "authorStaffId" TEXT,
  "authorName"    TEXT,
  "body"          TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "shift_notes_restaurantId_createdAt_idx" ON "shift_notes" ("restaurantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "shift_notes" ADD CONSTRAINT "shift_notes_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "shift_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "shift_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "shift_notes";
CREATE POLICY tenant_isolation ON "shift_notes"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "shift_notes" TO app_user;
