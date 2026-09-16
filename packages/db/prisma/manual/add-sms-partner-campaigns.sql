-- A8.3: the composer, the audience, the schedule and the queue.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- A8.0 gave `sms_campaigns` and `sms_messages` a partner axis. This adds what a
-- campaign needs to be composed, costed, scheduled and drained — and the two
-- partner-level limits that exist to stop a marketing tool becoming a nuisance:
-- a send window and a frequency cap.

-- ----------------------------------------------------------------------------
-- 1. The campaign.
--
-- `status` is the spine: draft → scheduled → sending → sent. A campaign is
-- DRAINED BY A CRON rather than sent inside a request, because sending to two
-- thousand people takes minutes and a serverless function does not have
-- minutes. `sending` is a claim, so two cron ticks cannot both drain one.
-- ----------------------------------------------------------------------------
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "name"        TEXT;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "audience"    JSONB;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "segments"    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "creditsSpent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "sentCount"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "createdBy"   TEXT;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "startedAt"   TIMESTAMP(3);

-- DEFAULT 'sent', not 'draft'. Every campaign that existed before this file ran
-- was sent the moment it was created — that is what the old code did — and
-- defaulting them to 'draft' would resurrect finished campaigns as unsent ones
-- the moment a drainer looks at the table.
ALTER TABLE "sms_campaigns" DROP CONSTRAINT IF EXISTS "sms_campaigns_status_check";
ALTER TABLE "sms_campaigns"
  ADD CONSTRAINT "sms_campaigns_status_check"
  CHECK ("status" IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'));

CREATE INDEX IF NOT EXISTS "sms_campaigns_due_idx"
  ON "sms_campaigns" ("status", "scheduledAt");

-- ----------------------------------------------------------------------------
-- 2. The messages.
--
-- `smsContactId` beside the existing `contactId`: the merchant axis points at
-- `customer_contacts` and the partner axis at `sms_contacts`. Two nullable
-- columns rather than one polymorphic id, because a foreign key that sometimes
-- means one table and sometimes another is a foreign key the database cannot
-- check.
-- ----------------------------------------------------------------------------
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "smsContactId" TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "segments"     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "sentAt"       TIMESTAMP(3);
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "error"        TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "attempts"     INTEGER NOT NULL DEFAULT 0;
/* The rendered body, per recipient. Merge fields mean two people did not get
   the same text, and "what did you actually send me" has to be answerable. */
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "body"         TEXT;

CREATE INDEX IF NOT EXISTS "sms_messages_contact_idx" ON "sms_messages" ("smsContactId");
CREATE INDEX IF NOT EXISTS "sms_messages_campaign_status_idx"
  ON "sms_messages" ("campaignId", "status");

-- ----------------------------------------------------------------------------
-- 3. Saved audiences.
--
-- The filters as JSON rather than columns: they are a saved SEARCH, they change
-- shape as the product grows, and a table with a column per filter would need a
-- migration every time somebody wants to segment on something new.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sms_segments" (
  "id"        TEXT PRIMARY KEY,
  "partnerId" TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "name"      TEXT NOT NULL,
  "filters"   JSONB NOT NULL DEFAULT '{}',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "sms_segments_partnerId_idx" ON "sms_segments" ("partnerId");

-- ----------------------------------------------------------------------------
-- 4. The two limits.
--
-- 09:00–20:00 Manila and two marketing texts per seven days, per the brief's
-- defaults. Stored as MINUTES PAST MIDNIGHT rather than a time: the comparison
-- is arithmetic on a number in one timezone, and a `time` column tempts
-- somebody into comparing it against the server's clock, which is UTC.
-- ----------------------------------------------------------------------------
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsWindowStartMin" INTEGER NOT NULL DEFAULT 540;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsWindowEndMin"   INTEGER NOT NULL DEFAULT 1200;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsCapCount"       INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsCapDays"        INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "partners" DROP CONSTRAINT IF EXISTS "partners_sms_window_check";
ALTER TABLE "partners"
  ADD CONSTRAINT "partners_sms_window_check"
  CHECK ("smsWindowStartMin" >= 0 AND "smsWindowEndMin" <= 1440
         AND "smsWindowStartMin" < "smsWindowEndMin");
