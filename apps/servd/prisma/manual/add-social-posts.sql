-- Content scheduler: posts composed in the app and published via Upload-Post.
-- Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "uploadPostUser" TEXT;
DO $$ BEGIN
  ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_uploadPostUser_key" UNIQUE ("uploadPostUser");
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "caption"      TEXT NOT NULL,
  "mediaUrl"     TEXT,
  "platforms"    TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3),
  "status"       TEXT NOT NULL DEFAULT 'scheduled',
  "providerRef"  TEXT,
  "error"        TEXT,
  "postedAt"     TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "social_posts_restaurantId_scheduledFor_idx"
  ON "social_posts" ("restaurantId", "scheduledFor");

DO $$ BEGIN
  ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "social_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_posts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "social_posts";
CREATE POLICY tenant_isolation ON "social_posts"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "social_posts" TO app_user;

-- Platform-wide Upload-Post API key (encrypted, like the Xendit creds).
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS "uploadPostKeyEnc" text;
