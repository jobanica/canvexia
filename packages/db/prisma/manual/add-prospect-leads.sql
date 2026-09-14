-- Sales-prospecting leads discovered via OpenStreetMap, for the super-admin.
-- Run in the Supabase SQL editor. Safe to re-run. Platform-level (super-admin only).
CREATE TABLE IF NOT EXISTS "prospect_leads" (
  "id"         TEXT NOT NULL,
  "source"     TEXT NOT NULL DEFAULT 'osm',
  "sourceId"   TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "address"    TEXT,
  "latitude"   DOUBLE PRECISION,
  "longitude"  DOUBLE PRECISION,
  "phone"      TEXT,
  "website"    TEXT,
  "email"      TEXT,
  "facebook"   TEXT,
  "status"     TEXT NOT NULL DEFAULT 'new',
  "notes"      TEXT,
  "enrichedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prospect_leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "prospect_leads_source_sourceId_key" ON "prospect_leads"("source", "sourceId");
CREATE INDEX IF NOT EXISTS "prospect_leads_status_idx" ON "prospect_leads"("status");
CREATE INDEX IF NOT EXISTS "prospect_leads_createdAt_idx" ON "prospect_leads"("createdAt");

-- Platform-only: only the super-admin context may read/write (no tenant access).
ALTER TABLE "prospect_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospect_leads" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "prospect_leads";
CREATE POLICY super_only ON "prospect_leads" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
