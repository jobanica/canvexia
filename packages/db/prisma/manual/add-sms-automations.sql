-- A8.5: automations, and the one irreversible thing in A8.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.

-- ----------------------------------------------------------------------------
-- 1. The three automations, as partner settings.
--
-- OFF BY DEFAULT, every one of them. An automation that starts sending the day
-- it ships is an automation nobody chose — and the first anybody would know is
-- a contact asking why they got a text they never asked for.
--
-- The follow-up and trial reminders are stored as DAYS, with 0 meaning off, so
-- a partner turning one on has to say when rather than inherit a number we
-- picked for them.
-- ----------------------------------------------------------------------------
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsAutoWelcome"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsAutoWelcomeText" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsAutoVisitDays"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsAutoVisitText"   TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsAutoTrialDays"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "smsAutoTrialText"   TEXT;

-- ----------------------------------------------------------------------------
-- 2. What has already fired.
--
-- ONE ROW PER (partner, automation, subject), UNIQUE. Without it, a daily job
-- re-sends the same follow-up every day for as long as the condition holds —
-- which for "visited 7 days ago and never converted" is forever.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sms_automation_log" (
  "id"           TEXT PRIMARY KEY,
  "partnerId"    TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  /* welcome | visit_follow_up | trial_ending */
  "kind"         TEXT NOT NULL,
  /* The thing it fired ABOUT: a contact id, a visit id, a merchant id. */
  "subjectId"    TEXT NOT NULL,
  "smsContactId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_automation_once_key"
  ON "sms_automation_log" ("partnerId", "kind", "subjectId");

-- ----------------------------------------------------------------------------
-- 3. Tombstones. THE IRREVERSIBLE PART.
--
-- "Forget this person" deletes their contact row and everything attached to it,
-- and keeps a SHA-256 of the number so an import cannot quietly put them back.
-- A hash, not the number: keeping the number would mean a table of exactly the
-- people who asked to be forgotten, which is the opposite of forgetting them.
--
-- It cannot be undone. That is the point — a deletion request is not a
-- suggestion — and it is why the screen makes somebody type the number out.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sms_tombstones" (
  "id"         TEXT PRIMARY KEY,
  "partnerId"  TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  /* SHA-256 of the E.164 number. Never the number. */
  "mobileHash" TEXT NOT NULL,
  "reason"     TEXT,
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "sms_tombstones_partner_hash_key"
  ON "sms_tombstones" ("partnerId", "mobileHash");
