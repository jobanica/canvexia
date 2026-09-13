-- Personalized outreach video module (super-admin only). One row per video: the
-- operator picks a CRM prospect, records a personalized intro on their phone via
-- a QR handoff, and the finished clip is downloaded here and sent manually.
-- Run in the Supabase SQL editor. Idempotent.
--
-- Also create a PRIVATE Storage bucket named "outreach-videos" (Storage → New
-- bucket → uncheck Public). The app + worker use the service-role key.

CREATE TABLE IF NOT EXISTS "outreach_videos" (
  "id"                   TEXT NOT NULL,
  "crmClientId"          TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'awaiting_recording',
    -- awaiting_recording | uploading | rendering | ready | failed
  "recordToken"          TEXT,
  "recordTokenExpiresAt" TIMESTAMP(3),
  "introPath"            TEXT,  -- raw phone recording (storage path)
  "finalPath"            TEXT,  -- rendered / final MP4 (storage path)
  "errorMessage"         TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outreach_videos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "outreach_videos_recordToken_key" ON "outreach_videos" ("recordToken");
CREATE INDEX IF NOT EXISTS "outreach_videos_crmClientId_idx" ON "outreach_videos" ("crmClientId");

DO $$ BEGIN
  ALTER TABLE "outreach_videos" ADD CONSTRAINT "outreach_videos_crmClientId_fkey"
    FOREIGN KEY ("crmClientId") REFERENCES "crm_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Platform-only (super-admin). The app reaches this table via the service-role
-- key (systemDb), which bypasses RLS; this policy just blocks tenant app_user.
ALTER TABLE "outreach_videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outreach_videos" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "outreach_videos";
CREATE POLICY super_only ON "outreach_videos"
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "outreach_videos" TO app_user;
