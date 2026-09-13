-- Platform announcements: the owner tells every restaurant something.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Two NEW tables, deliberately. Nothing existing gains a column, so a database
-- that hasn't run this can't have an existing query broken by it — the app
-- treats a missing table as "no announcements" and carries on. That is the
-- opposite of what happened with storefront settings, and the reason this is
-- shaped the way it is.

CREATE TABLE IF NOT EXISTS "announcements" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "level"       TEXT NOT NULL DEFAULT 'info',   -- info | warning | incident
  "publishedAt" TIMESTAMP(3),                   -- NULL = draft, not sent
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "announcements_publishedAt_idx"
  ON "announcements" ("publishedAt");

-- One row per person per announcement they've read. Per STAFF USER, not per
-- restaurant: a manager reading it must not clear the badge for the owner.
CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "id"             TEXT PRIMARY KEY,
  "announcementId" TEXT NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "staffUserId"    TEXT NOT NULL,
  "readAt"         TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reads_announcementId_staffUserId_key"
  ON "announcement_reads" ("announcementId", "staffUserId");
CREATE INDEX IF NOT EXISTS "announcement_reads_staffUserId_idx"
  ON "announcement_reads" ("staffUserId");

-- RLS. Announcements are written by the super-admin and read by everyone, so
-- reads are open and writes are not. Reads-tracking rows belong to whoever
-- created them; the app scopes by staffUserId through systemDb, as it does for
-- other cross-tenant data.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE "announcement_reads" ENABLE ROW LEVEL SECURITY';
  IF to_regprocedure('app.is_super_admin()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS announcements_read ON "announcements"';
    EXECUTE 'CREATE POLICY announcements_read ON "announcements" FOR SELECT USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS announcements_write ON "announcements"';
    EXECUTE 'CREATE POLICY announcements_write ON "announcements" FOR ALL USING (app.is_super_admin()) WITH CHECK (app.is_super_admin())';
    EXECUTE 'DROP POLICY IF EXISTS announcement_reads_all ON "announcement_reads"';
    EXECUTE 'CREATE POLICY announcement_reads_all ON "announcement_reads" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Check it. Expect both true.
SELECT to_regclass('public.announcements')       IS NOT NULL AS announcements_table,
       to_regclass('public.announcement_reads')  IS NOT NULL AS reads_table;
