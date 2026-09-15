-- CANVEXIA HQ Admin, Phase H3: applications, conversion, territory reconciliation.
--
-- Run AFTER add-hq-admin.sql, then `pnpm --filter @servd/db db:rls`. Idempotent.

-- ----------------------------------------------------------------------------
-- 1. The fifth waitlist status.
--
-- The brief's transitions are new → contacted → shortlisted → rejected /
-- converted. The enum has the first four; `converted` does not exist, and
-- without it a converted applicant would have to sit in `shortlisted` forever
-- or be deleted — and deleting the row loses the only record of where a partner
-- came from.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older
-- Postgres and cannot be undone. IF NOT EXISTS makes the re-run safe.
-- ----------------------------------------------------------------------------
ALTER TYPE "WaitlistStatus" ADD VALUE IF NOT EXISTS 'converted';

-- ----------------------------------------------------------------------------
-- 2. What HQ records against an application.
--
-- `notes` is HQ's own, never shown to the applicant. `contactedAt` and
-- `convertedPartnerId` are facts about the conversation, and the second is what
-- makes "where did this partner come from" answerable in one join instead of by
-- matching on an email address that may since have changed.
-- ----------------------------------------------------------------------------
ALTER TABLE "partner_waitlist" ADD COLUMN IF NOT EXISTS "notes"              TEXT;
ALTER TABLE "partner_waitlist" ADD COLUMN IF NOT EXISTS "contactedAt"        TIMESTAMP(3);
ALTER TABLE "partner_waitlist" ADD COLUMN IF NOT EXISTS "convertedPartnerId" TEXT;
ALTER TABLE "partner_waitlist" ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  ALTER TABLE "partner_waitlist"
    ADD CONSTRAINT "partner_waitlist_convertedPartnerId_fkey"
    FOREIGN KEY ("convertedPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Queued email.
--
-- The welcome email in the brief's §3 cannot send: CREDENTIALS_ENCRYPTION_KEY
-- is not set on this project, so the Resend credentials cannot even be stored
-- (see implementation_plan.md §0.7). A conversion that silently sends nothing
-- is worse than one that says so, and a conversion that FAILS because email is
-- unconfigured would be worse still.
--
-- So it queues. The row is written inside the conversion transaction; a sender
-- drains it the day the key exists. `sentAt IS NULL AND failedAt IS NULL` is
-- the queue.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "outbound_emails" (
    "id"        TEXT NOT NULL,
    -- A template key, not a rendered body: the copy belongs in code, where it
    -- can be changed without rewriting rows that have not been sent yet.
    "template"  TEXT NOT NULL,
    "toEmail"   TEXT NOT NULL,
    "toName"    TEXT,
    -- Template variables. NEVER a token or a password — an invite link is
    -- composed by the sender from the invite row, so a leak of this table is
    -- not a leak of anybody's account.
    "payload"   JSONB,
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt"    TIMESTAMP(3),
    "failedAt"  TIMESTAMP(3),
    "error"     TEXT,
    "attempts"  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "outbound_emails_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "outbound_emails_pending_idx"
    ON "outbound_emails"("createdAt") WHERE "sentAt" IS NULL AND "failedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "outbound_emails_partnerId_idx" ON "outbound_emails"("partnerId");

DO $$ BEGIN
  ALTER TABLE "outbound_emails"
    ADD CONSTRAINT "outbound_emails_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 4. RECONCILE the free-text territory onto real rows.
--
-- `partners.territory` is text — "Davao", "Tagum City" — with no key to the 143
-- rows in `territories`. This matches on the name and fills in `territoryId`,
-- `territories.partnerId` and an open assignment row, WITHOUT touching the text
-- column: it stays as the fallback, the same trade as partners.authUserId.
--
-- Matching is case- and whitespace-insensitive and nothing else. A partner
-- whose text does not match a seeded city keeps a NULL territoryId and shows as
-- "no territory" in HQ, which is the honest answer — guessing at a near-match
-- would silently license somebody for the wrong city.
-- ----------------------------------------------------------------------------
UPDATE "partners" p
   SET "territoryId" = t."id"
  FROM "territories" t
 WHERE p."territoryId" IS NULL
   AND p."territory" IS NOT NULL
   AND lower(btrim(p."territory")) = lower(btrim(t."name"));

-- KNOWN ALIASES, named one at a time rather than matched by a rule.
--
-- Both live partners fail the exact match above: "Davao" against the seeded
-- "Davao City", and "Tagum City" against the seeded "Tagum". A fuzzy rule —
-- strip a trailing " City", or a similarity threshold — would fix these two and
-- silently license somebody for the wrong place the first time two cities have
-- names that are close. There are 143 rows and "Santa Cruz" appears in more
-- than one province.
--
-- So each alias is written down and can be read. A partner whose text matches
-- nothing here keeps a NULL territoryId, shows as "no territory" in HQ, and is
-- assigned by hand from /hq/territories — which produces a better audit row
-- than this migration can anyway, because it names a real person.
WITH aliases(free_text, seeded) AS (
  VALUES ('davao', 'davao city'),
         ('tagum city', 'tagum')
)
UPDATE "partners" p
   SET "territoryId" = t."id"
  FROM aliases a
  JOIN "territories" t ON lower(btrim(t."name")) = a.seeded
 WHERE p."territoryId" IS NULL
   AND lower(btrim(p."territory")) = a.free_text;

UPDATE "territories" t
   SET "partnerId" = p."id",
       "status"    = 'taken',
       "assignedAt" = COALESCE(t."assignedAt", p."createdAt")
  FROM "partners" p
 WHERE p."territoryId" = t."id"
   AND t."partnerId" IS NULL
   AND p."status" IN ('approved', 'pending');

-- The history row for each reconciled assignment. `assignedAt` is the partner's
-- own creation date rather than now(): recording today would assert a handover
-- that did not happen.
INSERT INTO "territory_assignments" ("id", "territoryId", "partnerId", "assignedAt", "actorEmail")
SELECT gen_random_uuid()::text, t."id", t."partnerId", COALESCE(t."assignedAt", now()), 'reconciled-by-migration'
  FROM "territories" t
 WHERE t."partnerId" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "territory_assignments" a
      WHERE a."territoryId" = t."id" AND a."releasedAt" IS NULL
   );

-- ----------------------------------------------------------------------------
-- 5. RLS.
--
-- outbound_emails is HQ-ONLY. It holds the email address and name of every
-- person the platform has ever written to, which is precisely the shape of data
-- D27 found exposed on prospect_leads.
-- ----------------------------------------------------------------------------
ALTER TABLE "outbound_emails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbound_emails" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_only" ON "outbound_emails";
CREATE POLICY "super_only" ON "outbound_emails" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
REVOKE ALL ON "outbound_emails" FROM anon;
REVOKE ALL ON "outbound_emails" FROM authenticated;
