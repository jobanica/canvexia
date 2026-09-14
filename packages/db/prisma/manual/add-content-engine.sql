-- Content Engine (platform/super-admin only): Taglish short-form video scripts
-- for Servd's own marketing (Jab-Jab-Jab-Right-Hook). Run in the Supabase SQL
-- editor. Idempotent. Platform-level — only the super-admin context may touch it.

DO $$ BEGIN
  CREATE TYPE "ContentPillarKind" AS ENUM ('JAB', 'RIGHT_HOOK');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ContentScriptStatus" AS ENUM ('IDEA', 'SCRIPTED', 'FILMED', 'POSTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "content_brand_profiles" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL DEFAULT 'Servd',
  "systemPrompt" TEXT NOT NULL,
  "jabRatio"     INTEGER NOT NULL DEFAULT 3,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_brand_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "content_pillars" (
  "id"          TEXT NOT NULL,
  "brandId"     TEXT NOT NULL,
  "kind"        "ContentPillarKind" NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "content_pillars_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "content_pillars_brandId_idx" ON "content_pillars"("brandId");

CREATE TABLE IF NOT EXISTS "content_scripts" (
  "id"           TEXT NOT NULL,
  "brandId"      TEXT NOT NULL,
  "pillarId"     TEXT,
  "type"         "ContentPillarKind" NOT NULL,
  "platform"     TEXT NOT NULL,
  "lengthSec"    INTEGER NOT NULL,
  "title"        TEXT NOT NULL,
  "hook"         JSONB NOT NULL,
  "body"         JSONB NOT NULL,
  "cta"          JSONB,
  "production"   JSONB NOT NULL,
  "status"       "ContentScriptStatus" NOT NULL DEFAULT 'IDEA',
  "saves"        INTEGER,
  "shares"       INTEGER,
  "dms"          INTEGER,
  "postedAt"     TIMESTAMP(3),
  "scheduledFor" TIMESTAMP(3),
  "createdById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_scripts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "content_scripts_brandId_createdAt_idx" ON "content_scripts"("brandId", "createdAt");
CREATE INDEX IF NOT EXISTS "content_scripts_status_idx" ON "content_scripts"("status");

DO $$ BEGIN
  ALTER TABLE "content_pillars" ADD CONSTRAINT "content_pillars_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "content_brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "content_scripts" ADD CONSTRAINT "content_scripts_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "content_brand_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "content_scripts" ADD CONSTRAINT "content_scripts_pillarId_fkey"
    FOREIGN KEY ("pillarId") REFERENCES "content_pillars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "content_generation_logs" (
  "id"           TEXT NOT NULL,
  "brandId"      TEXT,
  "model"        TEXT NOT NULL,
  "mode"         TEXT NOT NULL,
  "inputTokens"  INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "scriptId"     TEXT,
  "ok"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_generation_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "content_generation_logs_createdAt_idx" ON "content_generation_logs"("createdAt");

-- Platform-only: only the super-admin context may read/write (no tenant access).
ALTER TABLE "content_brand_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_brand_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "content_brand_profiles";
CREATE POLICY super_only ON "content_brand_profiles" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "content_pillars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_pillars" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "content_pillars";
CREATE POLICY super_only ON "content_pillars" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "content_scripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_scripts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "content_scripts";
CREATE POLICY super_only ON "content_scripts" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "content_generation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_generation_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "content_generation_logs";
CREATE POLICY super_only ON "content_generation_logs" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
