-- Outreach CRM for the super-admin: clients messaged on Facebook, tracked
-- through a follow-up sequence until they reply. Run in the Supabase SQL editor.
-- Idempotent. Platform-level (super-admin only).

CREATE TABLE IF NOT EXISTS "crm_clients" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "facebookUrl" TEXT,
  "contactName" TEXT,
  "phone"       TEXT,
  "email"       TEXT,
  "notes"       TEXT,
  "stage"       TEXT NOT NULL DEFAULT 'new',
  "step"        INTEGER NOT NULL DEFAULT 0,
  "lastTouchAt" TIMESTAMP(3),
  "nextDueAt"   TIMESTAMP(3),
  "repliedAt"   TIMESTAMP(3),
  "source"      TEXT NOT NULL DEFAULT 'manual',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_clients_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_clients_stage_idx" ON "crm_clients"("stage");
CREATE INDEX IF NOT EXISTS "crm_clients_nextDueAt_idx" ON "crm_clients"("nextDueAt");
CREATE INDEX IF NOT EXISTS "crm_clients_createdAt_idx" ON "crm_clients"("createdAt");

CREATE TABLE IF NOT EXISTS "crm_touches" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "step"      INTEGER NOT NULL,
  "channel"   TEXT NOT NULL DEFAULT 'facebook',
  "label"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_touches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_touches_clientId_createdAt_idx" ON "crm_touches"("clientId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "crm_touches" ADD CONSTRAINT "crm_touches_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Platform-only: only the super-admin context may read/write (no tenant access).
ALTER TABLE "crm_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_clients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "crm_clients";
CREATE POLICY super_only ON "crm_clients" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "crm_touches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_touches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "crm_touches";
CREATE POLICY super_only ON "crm_touches" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
