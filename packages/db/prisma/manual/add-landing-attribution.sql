-- Ad attribution for the /create landing page.
--
-- Two halves of one question — "which Facebook creative produces paying
-- restaurants":
--   • utm_* columns on restaurants, so an ACTIVATION carries the ad that
--     produced it. Clicks are cheap; this is the number that matters.
--   • landing_stats, the view/CTA counters that sit above the builder in the
--     funnel, aggregated per Manila day and UTM combination.
--
-- Run in the Supabase SQL editor. Idempotent.
-- Requires add-diy-builder.sql first.

-- The landing page's how-it-works video, pasted in from super-admin rather than
-- set as an environment variable — changing the video shouldn't need a deploy.
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "landingVideoUrl" TEXT;

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "utmSource"   TEXT,
  ADD COLUMN IF NOT EXISTS "utmMedium"   TEXT,
  ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "utmContent"  TEXT;

-- Grouping the funnel by campaign is the whole point, so index for it.
CREATE INDEX IF NOT EXISTS "restaurants_utmCampaign_idx"
  ON "restaurants" ("utmCampaign");

CREATE TABLE IF NOT EXISTS "landing_stats" (
  "id"       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "day"      TEXT NOT NULL,
  "event"    TEXT NOT NULL,
  -- '' rather than NULL for a missing tag: Postgres treats NULLs as distinct
  -- in a unique index, which would split one campaign's counter into many rows
  -- and make every upsert insert instead of increment.
  "source"   TEXT NOT NULL DEFAULT '',
  "medium"   TEXT NOT NULL DEFAULT '',
  "campaign" TEXT NOT NULL DEFAULT '',
  "content"  TEXT NOT NULL DEFAULT '',
  "count"    INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "landing_stats_day_event_source_medium_campaign_content_key"
  ON "landing_stats" ("day", "event", "source", "medium", "campaign", "content");
CREATE INDEX IF NOT EXISTS "landing_stats_day_idx" ON "landing_stats" ("day");

-- Platform-level: the founder's own ad numbers, not any tenant's data.
ALTER TABLE "landing_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "landing_stats" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "landing_stats";
CREATE POLICY super_only ON "landing_stats"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "landing_stats" TO app_user;
