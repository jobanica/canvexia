-- CANVEXIA partner portal, Phase A1: identity, pipeline, milestones, prefs.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- THE IMPORTANT PART IS THE BACKFILL AT THE BOTTOM. Until now a partner WAS one
-- Supabase user — `partners.authUserId`, one row, one login. This adds
-- `partner_users` and moves identity there, but `partners.authUserId` STAYS and
-- keeps working: `getCurrentPartner()` reads the new table first and that column
-- second. The backfill gives every existing partner an `admin` seat so the two
-- paths agree from the first request. Nobody is logged out.

-- ----------------------------------------------------------------------------
-- Licence term and milestones on the partner itself.
-- ----------------------------------------------------------------------------
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "licenseStartedAt"     TIMESTAMP(3);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "exclusivityExpiresAt" TIMESTAMP(3);
-- A ladder, not two columns: [{"month":1,"target":10}, …]. NULL means "use the
-- platform default", not "no milestones" — a partner with no ladder would
-- silently always read as on track.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "milestones"           JSONB;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "onboardingSteps"      JSONB;

-- ----------------------------------------------------------------------------
-- Partner portal seats.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "partner_users" (
    "id"            TEXT NOT NULL,
    "partnerId"     TEXT NOT NULL,
    -- NULL while an invite is outstanding: the seat is visible and revocable
    -- before it has ever been used.
    "authUserId"    TEXT,
    "email"         TEXT NOT NULL,
    "name"          TEXT,
    "role"          TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'invited',
    "invitedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt"    TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "lastSeenAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_users_pkey" PRIMARY KEY ("id")
);

-- A CHECK rather than a Postgres enum. The role vocabulary belongs to
-- packages/core; an enum would make adding a role a schema migration coupled to
-- a code release, while a CHECK is one ALTER and still refuses a typo.
DO $$ BEGIN
  ALTER TABLE "partner_users"
    ADD CONSTRAINT "partner_users_role_check"
    CHECK ("role" IN ('admin', 'sales', 'support'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "partner_users"
    ADD CONSTRAINT "partner_users_status_check"
    CHECK ("status" IN ('invited', 'active', 'deactivated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "partner_users_authUserId_key" ON "partner_users"("authUserId");
-- One seat per email per partner. The same person may hold a seat at two
-- partners — an HQ operator who also runs a city is exactly that.
CREATE UNIQUE INDEX IF NOT EXISTS "partner_users_partnerId_email_key" ON "partner_users"("partnerId", "email");
CREATE INDEX IF NOT EXISTS "partner_users_partnerId_status_idx" ON "partner_users"("partnerId", "status");

DO $$ BEGIN
  ALTER TABLE "partner_users"
    ADD CONSTRAINT "partner_users_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- Outstanding invitations.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "partner_invites" (
    "id"              TEXT NOT NULL,
    "partnerId"       TEXT NOT NULL,
    "email"           TEXT NOT NULL,
    "role"            TEXT NOT NULL,
    -- A SHA-256 of the token, never the token. It is shown once, in the email,
    -- so a leaked database cannot be used to accept invitations. Same reasoning
    -- as the hashed IP in rate_limits.
    "tokenHash"       TEXT NOT NULL,
    "invitedByUserId" TEXT,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "acceptedAt"      TIMESTAMP(3),
    "revokedAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_invites_tokenHash_key" ON "partner_invites"("tokenHash");
CREATE INDEX IF NOT EXISTS "partner_invites_partnerId_expiresAt_idx" ON "partner_invites"("partnerId", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "partner_invites"
    ADD CONSTRAINT "partner_invites_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- The pipeline.
--
-- NOT `prospect_leads` — that is HQ's OpenStreetMap scraping list, super-admin
-- only, with no partner scope. The names are close enough to be worth saying
-- out loud once: this table belongs to a partner, that one to HQ.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "ProspectStage" AS ENUM ('lead', 'contacted', 'demo_booked', 'trial', 'paid', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProspectSource" AS ENUM ('walk_in', 'referral', 'lead_form', 'ads', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "prospects" (
    "id"                  TEXT NOT NULL,
    "partnerId"           TEXT NOT NULL,
    "businessName"        TEXT NOT NULL,
    "ownerName"           TEXT,
    "mobile"              TEXT,
    "address"             TEXT,
    -- A registry id ("servd", "pharmacy"), not a foreign key. Products are code.
    "productId"           TEXT NOT NULL,
    "stage"               "ProspectStage"  NOT NULL DEFAULT 'lead',
    "source"              "ProspectSource" NOT NULL DEFAULT 'other',
    "nextFollowUpAt"      TIMESTAMP(3),
    "notes"               TEXT,
    "assignedToId"        TEXT,
    "lostReason"          TEXT,
    -- Two columns, because a merchant id is only unique WITHIN a product — the
    -- same reason partner_ledger_entries carries productId beside merchantId.
    "convertedMerchantId" TEXT,
    "convertedProductId"  TEXT,
    "convertedAt"         TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prospects_partnerId_stage_idx" ON "prospects"("partnerId", "stage");
CREATE INDEX IF NOT EXISTS "prospects_partnerId_nextFollowUpAt_idx" ON "prospects"("partnerId", "nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "prospects_assignedToId_idx" ON "prospects"("assignedToId");

DO $$ BEGIN
  ALTER TABLE "prospects"
    ADD CONSTRAINT "prospects_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SET NULL, not CASCADE: deactivating a salesperson must not delete the
-- prospects they were working.
DO $$ BEGIN
  ALTER TABLE "prospects"
    ADD CONSTRAINT "prospects_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "partner_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- Notification preferences.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notification_prefs" (
    "id"            TEXT NOT NULL,
    -- Denormalised from the user so the RLS policy below is a column comparison
    -- rather than a subquery into partner_users. A policy that joins is a policy
    -- that can be got wrong; this one cannot.
    "partnerId"     TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "event"         TEXT NOT NULL,
    "email"         BOOLEAN NOT NULL DEFAULT true,
    "messenger"     BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_prefs_partnerUserId_event_key" ON "notification_prefs"("partnerUserId", "event");
CREATE INDEX IF NOT EXISTS "notification_prefs_partnerId_idx" ON "notification_prefs"("partnerId");

DO $$ BEGIN
  ALTER TABLE "notification_prefs"
    ADD CONSTRAINT "notification_prefs_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- THE BACKFILL.
--
-- Every partner that can log in today gets an `admin` seat carrying the same
-- auth user, so the new identity path and the old column agree from the first
-- request. Without this, the first deploy logs every partner out of a portal
-- they are mid-shift in.
--
-- `status = 'active'` and `acceptedAt = now()`: these people did not accept an
-- invitation, they already had the account. Recording an invite they never got
-- would be a lie in the audit trail.
-- ----------------------------------------------------------------------------
INSERT INTO "partner_users" ("id", "partnerId", "authUserId", "email", "name", "role", "status", "invitedAt", "acceptedAt")
SELECT gen_random_uuid()::text, p."id", p."authUserId", p."email", p."name", 'admin', 'active', p."createdAt", p."createdAt"
  FROM "partners" p
 WHERE p."authUserId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "partner_users" u WHERE u."partnerId" = p."id" AND u."email" = p."email");

-- ----------------------------------------------------------------------------
-- RLS. Every table here is partner-scoped; rls.sql carries the same policies so
-- a re-run of that script does not undo this one.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_users', 'partner_invites', 'prospects', 'notification_prefs']
  LOOP
    EXECUTE format('alter table %I enable row level security;', t);
    EXECUTE format('alter table %I force row level security;', t);
    EXECUTE format('drop policy if exists partner_scope on %I;', t);
    EXECUTE format($f$
      create policy partner_scope on %1$I for all
        using (app.is_super_admin() or "partnerId" = app.current_partner_id())
        with check (app.is_super_admin() or "partnerId" = app.current_partner_id());
    $f$, t);
    -- Supabase grants `anon` full DML on public by default and the anon key
    -- ships in every browser. These tables hold names, mobile numbers and
    -- addresses of people who have agreed to nothing. `authenticated` too: it is
    -- the role PostgREST runs a signed-in user as, and every merchant cashier in
    -- this database can obtain it.
    EXECUTE format('revoke all on %I from anon;', t);
    EXECUTE format('revoke all on %I from authenticated;', t);
  END LOOP;
END $$;
