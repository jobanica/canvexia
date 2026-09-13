-- Platform email marketing: the DIY builder now requires an email address, and
-- the founder can send campaigns to those leads from super-admin.
--
-- Audience note: these are RESTAURANT OWNERS (people who built a preview), not
-- their diners. Per-restaurant customer messaging stays in the SMS system.
--
-- Run in the Supabase SQL editor. Idempotent.

-- 1. Lead contact + unsubscribe state on the restaurant row.
ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "unsubToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_unsubToken_key"
  ON "restaurants" ("unsubToken");

-- 2. Encrypted email-provider credentials, alongside the other platform keys.
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "emailCredsEnc" TEXT;

-- 3. Campaigns + per-recipient rows.
CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "subject"    TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "segment"    TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'draft',
  "recipients" INTEGER NOT NULL DEFAULT 0,
  "sent"       INTEGER NOT NULL DEFAULT 0,
  "failed"     INTEGER NOT NULL DEFAULT 0,
  "sentAt"     TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "email_campaigns_status_createdAt_idx"
  ON "email_campaigns" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "email_messages" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "campaignId"   TEXT NOT NULL,
  "restaurantId" TEXT,
  "email"        TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'queued',
  "error"        TEXT,
  "providerRef"  TEXT,
  "sentAt"       TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_messages_campaignId_fkey'
  ) THEN
    ALTER TABLE "email_messages"
      ADD CONSTRAINT "email_messages_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "email_messages_campaignId_status_idx"
  ON "email_messages" ("campaignId", "status");

-- 4. RLS. Both tables are platform-level (no tenant owns a campaign to the
--    platform's own leads), so only the super-admin may touch them.
ALTER TABLE "email_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_campaigns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "email_campaigns";
CREATE POLICY super_only ON "email_campaigns"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_campaigns" TO app_user;

ALTER TABLE "email_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "email_messages";
CREATE POLICY super_only ON "email_messages"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_messages" TO app_user;
