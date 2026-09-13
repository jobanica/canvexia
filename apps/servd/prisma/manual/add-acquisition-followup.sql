-- Acquisition follow-up: two behavioural tracks of scheduled emails to
-- UN-ACTIVATED leads only.
--
--   Track A — gave an email, never finished a preview → "come back and finish"
--   Track B — built a preview, hasn't paid            → "activate for ₱499"
--
-- Post-activation lifecycle stays in-app. Nothing here ever emails a paying
-- merchant.
--
-- Run in the Supabase SQL editor. Idempotent.
-- Requires add-email-marketing.sql first.

-- Replaces the earlier day-offset drip, which was never switched on. Dropping
-- rather than leaving it dormant, because two systems mailing the same leads is
-- exactly the failure this feature exists to avoid.
DROP TABLE IF EXISTS "email_automation_sends";
DROP TABLE IF EXISTS "email_automation_steps";

ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "emailAutomationOn" BOOLEAN NOT NULL DEFAULT false;

-- Editable copy. The schedule itself is code, not data.
CREATE TABLE IF NOT EXISTS "email_templates" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "stepKey"   TEXT NOT NULL,
  "subject"   TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_stepKey_key"
  ON "email_templates" ("stepKey");

-- One scheduled send per (lead, step).
CREATE TABLE IF NOT EXISTS "email_sends" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "restaurantId" TEXT NOT NULL,
  "track"        TEXT NOT NULL,
  "stepKey"      TEXT NOT NULL,
  "sendAt"       TIMESTAMPTZ NOT NULL,
  "sentAt"       TIMESTAMPTZ,
  -- scheduled | sending | sent | skipped | failed. A run claims a row by moving
  -- it to 'sending' before it hands anything to the provider.
  "status"       TEXT NOT NULL DEFAULT 'scheduled',
  "skipReason"   TEXT,
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "error"        TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_sends_restaurantId_fkey'
  ) THEN
    ALTER TABLE "email_sends"
      ADD CONSTRAINT "email_sends_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- THE no-double-send guarantee: enforced by the database, not by the runner
-- remembering. Overlapping cron passes cannot both claim the same step.
CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_restaurantId_stepKey_key"
  ON "email_sends" ("restaurantId", "stepKey");
CREATE INDEX IF NOT EXISTS "email_sends_status_sendAt_idx"
  ON "email_sends" ("status", "sendAt");
CREATE INDEX IF NOT EXISTS "email_sends_restaurantId_idx"
  ON "email_sends" ("restaurantId");

-- Platform-level: these are the founder's own leads, not any tenant's data.
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "email_templates";
CREATE POLICY super_only ON "email_templates"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_templates" TO app_user;

ALTER TABLE "email_sends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_sends" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "email_sends";
CREATE POLICY super_only ON "email_sends"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_sends" TO app_user;
