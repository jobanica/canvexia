-- Floor plan / table status + audit-log foundation.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).

-- 1) Table status + floor-plan layout ---------------------------------------
DO $$ BEGIN
  CREATE TYPE "TableStatus" AS ENUM ('empty', 'occupied', 'needs_cleaning', 'reserved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "status" "TableStatus" NOT NULL DEFAULT 'empty';
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "posX" INTEGER;
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "posY" INTEGER;
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "seats" INTEGER;

-- 2) Audit log ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "actorStaffId"  TEXT,
  "actorEmail"    TEXT,
  "action"        TEXT NOT NULL,
  "entityType"    TEXT NOT NULL,
  "entityId"      TEXT,
  "reason"        TEXT,
  "before"        JSONB,
  "after"         JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_restaurantId_createdAt_idx"
  ON "audit_logs" ("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_restaurantId_entityType_entityId_idx"
  ON "audit_logs" ("restaurantId", "entityType", "entityId");

DO $$ BEGIN
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) RLS + app_user grants for the new table (matches prisma/rls.sql) --------
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "audit_logs";
CREATE POLICY tenant_isolation ON "audit_logs"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_logs" TO app_user;
