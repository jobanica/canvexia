-- CANVEXIA HQ Admin, Phase H1: roles, territory assignment, partner profile,
-- feature flags, HQ announcements, impersonation grants, cron runs.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- READ THIS FIRST. Every table touched here already has rows in production, so
-- every column added is nullable or database-defaulted. A plain Prisma default
-- is written into the INSERT of every create() in the codebase and breaks
-- creates on a database that has not run this file yet — the failure mode
-- described at length on Restaurant.autoPrintReceipt.
--
-- SEPARATELY: `bootstrap-hq-admin.sql` in this directory must be run after this
-- one. `platform_admins` has ZERO rows on this database, so nobody can sign
-- into the HQ console at all; there is no seat to invite the first seat from.

-- ----------------------------------------------------------------------------
-- 1. HQ roles.
--
-- The column exists and is already NULL | 'ops'. What is missing is the CHECK,
-- and the vocabulary written down somewhere both sides can see.
--
-- NULL stays meaning super_admin. Backfilling it to the string would be a
-- migration whose only purpose is to make a column look neater, and it would
-- have to run before the code that reads it or the founder loses their own back
-- office for the length of a deploy.
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "platform_admins"
    ADD CONSTRAINT "platform_admins_role_check"
    CHECK ("role" IS NULL OR "role" IN ('super_admin', 'ops'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rows written before the vocabulary existed used 'ops' already; nothing else
-- has ever been stored. This normalises anything that is neither to NULL rather
-- than failing the ALTER above on a database that has something unexpected.
UPDATE "platform_admins"
   SET "role" = NULL
 WHERE "role" IS NOT NULL
   AND "role" NOT IN ('super_admin', 'ops');

ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "status"        TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "invitedBy"     TEXT;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "lastSeenAt"    TIMESTAMP(3);
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "platform_admins"
    ADD CONSTRAINT "platform_admins_status_check"
    CHECK ("status" IN ('active', 'deactivated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Territories: assignment, and the parent/child split.
--
-- `partners.territory` is FREE TEXT today — "Davao", "Tagum City" — with no key
-- to the 143 rows in this table. That column STAYS (the same trade as
-- partners.authUserId): it is what every existing screen reads, and breaking it
-- to normalise a string is not worth an outage. H3 reconciles the live rows
-- onto territoryId and the text becomes the fallback.
-- ----------------------------------------------------------------------------
ALTER TABLE "territories" ADD COLUMN IF NOT EXISTS "partnerId"  TEXT;
-- A split parent (Quezon City → its districts) stops being sellable itself.
-- Default true so all 143 existing rows stay exactly as assignable as they were.
ALTER TABLE "territories" ADD COLUMN IF NOT EXISTS "parentId"   TEXT;
ALTER TABLE "territories" ADD COLUMN IF NOT EXISTS "assignable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "territories" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "territories_partnerId_idx" ON "territories"("partnerId");
CREATE INDEX IF NOT EXISTS "territories_parentId_idx"  ON "territories"("parentId");

DO $$ BEGIN
  ALTER TABLE "territories"
    ADD CONSTRAINT "territories_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Self-reference. ON DELETE SET NULL rather than CASCADE: deleting a parent
-- must not silently delete the districts somebody is licensed for.
DO $$ BEGIN
  ALTER TABLE "territories"
    ADD CONSTRAINT "territories_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Territory assignment history.
--
-- APPEND-ONLY, and the reason is the same as the ledger's. "Who had Cebu before
-- this operator, and why did they stop" is a question that gets asked when
-- there is a dispute, which is exactly when a mutable row would have been
-- overwritten. A release sets releasedAt on the open row; it does not delete it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "territory_assignments" (
    "id"          TEXT NOT NULL,
    "territoryId" TEXT NOT NULL,
    "partnerId"   TEXT NOT NULL,
    "assignedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt"  TIMESTAMP(3),
    -- Required when releasing. A territory taken back with no reason recorded
    -- is the one an operator will contest.
    "reason"      TEXT,
    "actorEmail"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "territory_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "territory_assignments_territoryId_idx" ON "territory_assignments"("territoryId");
CREATE INDEX IF NOT EXISTS "territory_assignments_partnerId_idx"   ON "territory_assignments"("partnerId");

-- One OPEN assignment per territory. A partial unique index rather than a plain
-- one: the history deliberately holds many closed rows for the same territory,
-- and only the live one has to be unique.
CREATE UNIQUE INDEX IF NOT EXISTS "territory_assignments_one_open"
    ON "territory_assignments"("territoryId") WHERE "releasedAt" IS NULL;

DO $$ BEGIN
  ALTER TABLE "territory_assignments"
    ADD CONSTRAINT "territory_assignments_territoryId_fkey"
    FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "territory_assignments"
    ADD CONSTRAINT "territory_assignments_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Partner profile, the house account, and referrals.
--
-- `isHouse` exists because "reassign to the house partner" and "flag as a
-- national account" both need a target and there is nothing in this schema that
-- names one. CANVEXIA Davao is a real, approved, 70%-share operator row and is
-- indistinguishable from any other partner without this.
--
-- `tin` is a placeholder text field, as the brief asks. It is NOT encrypted and
-- NOT masked, and that is deliberate: a TIN is a business registration number
-- that appears on every invoice the partner issues, not a secret. The things
-- that ARE secret here — payout account numbers — stay in payoutDetailsEnc and
-- are displayed masked in HQ exactly as they are in the portal.
-- ----------------------------------------------------------------------------
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "isHouse"                 BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "referralPartnerId"       TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "legalName"               TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "businessName"            TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "tin"                     TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "address"                 TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "contactMobile"           TEXT;
-- Storage PATH, never a URL. The bucket is private; HQ serves it through a
-- signed URL, the same pattern as employee-documents.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "agreementPath"           TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "agreementUploadedAt"     TIMESTAMP(3);
-- Centavos, unlike territories."licenseFee" which is whole pesos. They are
-- different quantities: the fee is a quoted price, this is money that arrived.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "licenseFeePaidCentavos"  INTEGER;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "licenseFeePaidAt"        TIMESTAMP(3);
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "licenseFeeRef"           TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "territoryId"             TEXT;
-- Which products this partner may provision into. NULL means "every live
-- product", which is what every existing partner has today — an empty array
-- would silently switch them all off.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "enabledProducts"         JSONB;

CREATE INDEX IF NOT EXISTS "partners_territoryId_idx" ON "partners"("territoryId");

-- Exactly one house account, enforced rather than agreed. Partial unique index:
-- many rows are false, at most one is true.
CREATE UNIQUE INDEX IF NOT EXISTS "partners_one_house" ON "partners"(("isHouse")) WHERE "isHouse";

DO $$ BEGIN
  ALTER TABLE "partners"
    ADD CONSTRAINT "partners_referralPartnerId_fkey"
    FOREIGN KEY ("referralPartnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "partners"
    ADD CONSTRAINT "partners_territoryId_fkey"
    FOREIGN KEY ("territoryId") REFERENCES "territories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A partner cannot refer itself. Cheap to state, and the alternative is a
-- referral fee line on a statement pointing at the partner it is deducted from.
DO $$ BEGIN
  ALTER TABLE "partners"
    ADD CONSTRAINT "partners_referral_not_self"
    CHECK ("referralPartnerId" IS NULL OR "referralPartnerId" <> "id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The house account. Matched by id, not by name: "CANVEXIA Davao" is a display
-- string somebody may well edit, and this is the row the reassign target
-- resolves to. Its 70% share is left alone — confirmed as intended.
UPDATE "partners"
   SET "isHouse" = true
 WHERE "id" = 'da4357c2-e5b0-45da-b38b-cbefc3be2ef6'
   AND NOT EXISTS (SELECT 1 FROM "partners" WHERE "isHouse");

-- ----------------------------------------------------------------------------
-- 5. Feature flags.
--
-- Global on/off in this phase, as the brief asks. `partnerId` is nullable and
-- present from the start so a per-partner flag is a row, not a migration during
-- a launch — the same reasoning as notification_prefs.messenger.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "feature_flags" (
    "id"         TEXT NOT NULL,
    "productId"  TEXT NOT NULL,
    "key"        TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT false,
    -- NULL = the global value for this product. A row WITH a partnerId
    -- overrides it for that partner only.
    "partnerId"  TEXT,
    "note"       TEXT,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- Two partial indexes rather than one over (productId, key, partnerId): NULL is
-- not equal to NULL in a unique index, so a plain one would happily accept two
-- global rows for the same flag.
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_global_key"
    ON "feature_flags"("productId", "key") WHERE "partnerId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_partner_key"
    ON "feature_flags"("productId", "key", "partnerId") WHERE "partnerId" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "feature_flags"
    ADD CONSTRAINT "feature_flags_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Ledger adjustments — columns, NOT a second table.
--
-- The brief asks for credit / debit / refund / waiver with a reason and an
-- optional attachment, and says "history is never edited". partner_ledger_entries
-- is ALREADY append-only and immutable, and it is what computeStatement reads.
-- A parallel adjustments table is how a statement and its explanation come to
-- disagree: one of them gets recomputed and the other does not.
--
-- So an adjustment is a ledger row with a kind that says so. The existing kinds
-- (subscription, addon, feature, activation) are money that arrived; these four
-- are money moved by hand, which is why they carry an actor and a reason and
-- those columns are NULL on every settlement row.
--
-- providerRef is UNIQUE on this table and that is what makes settlement
-- idempotent. An adjustment has no gateway reference, so it gets a synthetic
-- one — `adj:<uuid>` — generated by the writer, never reused.
-- ----------------------------------------------------------------------------
ALTER TABLE "partner_ledger_entries" ADD COLUMN IF NOT EXISTS "adjustmentReason" TEXT;
ALTER TABLE "partner_ledger_entries" ADD COLUMN IF NOT EXISTS "actorEmail"       TEXT;
ALTER TABLE "partner_ledger_entries" ADD COLUMN IF NOT EXISTS "attachmentPath"   TEXT;

DO $$ BEGIN
  ALTER TABLE "partner_ledger_entries"
    ADD CONSTRAINT "partner_ledger_entries_kind_check"
    CHECK ("kind" IN ('subscription', 'addon', 'feature', 'activation',
                      'credit', 'debit', 'refund', 'waiver', 'referral'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- An adjustment without a reason is an unexplained movement of money, and the
-- person who would have to explain it is not the person who made it.
DO $$ BEGIN
  ALTER TABLE "partner_ledger_entries"
    ADD CONSTRAINT "partner_ledger_entries_adjustment_reason"
    CHECK ("kind" NOT IN ('credit', 'debit', 'refund', 'waiver')
           OR ("adjustmentReason" IS NOT NULL AND "actorEmail" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 7. HQ announcements.
--
-- A SEPARATE pair of tables from `announcements` / `announcement_reads`, which
-- are Servd's own merchant-facing notices and key their read receipts on
-- staffUserId. The audience here is partners, the receipt is per partner, and
-- the targeting is a segment. Reusing the merchant tables would mean one table
-- whose rows mean different things depending on a column, and a read receipt
-- that cannot say which it is.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "hq_announcements" (
    "id"           TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    -- Markdown. Rendered by the portal, never by dangerouslySetInnerHTML.
    "body"         TEXT NOT NULL,
    "level"        TEXT NOT NULL DEFAULT 'info',
    -- NULL = every partner. Otherwise { "tier": [...], "status": [...],
    -- "productId": [...] } — shape lives in packages/core.
    "segment"      JSONB,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt"  TIMESTAMP(3),
    "authorEmail"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hq_announcements_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "hq_announcements"
    ADD CONSTRAINT "hq_announcements_level_check"
    CHECK ("level" IN ('info', 'warning', 'incident'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "hq_announcements_publishedAt_idx" ON "hq_announcements"("publishedAt");

CREATE TABLE IF NOT EXISTS "hq_announcement_reads" (
    "id"             TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    -- Per PARTNER, not per seat. The receipt answers "has Cebu seen this",
    -- which is the question HQ is actually asking.
    "partnerId"      TEXT NOT NULL,
    "partnerUserId"  TEXT,
    "readAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hq_announcement_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hq_announcement_reads_key"
    ON "hq_announcement_reads"("announcementId", "partnerId");
CREATE INDEX IF NOT EXISTS "hq_announcement_reads_partnerId_idx"
    ON "hq_announcement_reads"("partnerId");

DO $$ BEGIN
  ALTER TABLE "hq_announcement_reads"
    ADD CONSTRAINT "hq_announcement_reads_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "hq_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "hq_announcement_reads"
    ADD CONSTRAINT "hq_announcement_reads_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 8. Impersonation grants.
--
-- "View as partner" puts HQ inside an operator's own console. The token is
-- signed and short-lived, but a signature alone cannot be revoked and leaves
-- nothing to audit, which is why the grant is a ROW: it can be killed, it can
-- be listed, and the audit log has something to point at.
--
-- `usedAt` plus the partial unique index below make it single-use. `readOnly`
-- is stored rather than assumed so that a future writable grant — if it is ever
-- justified — is a different value here and not a silent change in meaning of
-- every row already written.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "impersonation_grants" (
    "id"           TEXT NOT NULL,
    -- Which HQ seat asked. platform_admins.id.
    "hqAdminId"    TEXT NOT NULL,
    "hqAdminEmail" TEXT NOT NULL,
    "partnerId"    TEXT NOT NULL,
    -- SHA-256 of the token, never the token. A row that can be read back into a
    -- working session is a row that turns a database leak into a login.
    "tokenHash"    TEXT NOT NULL,
    "readOnly"     BOOLEAN NOT NULL DEFAULT true,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "usedAt"       TIMESTAMP(3),
    "endedAt"      TIMESTAMP(3),
    "revokedAt"    TIMESTAMP(3),
    "reason"       TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impersonation_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "impersonation_grants_tokenHash_key" ON "impersonation_grants"("tokenHash");
CREATE INDEX IF NOT EXISTS "impersonation_grants_partnerId_idx"        ON "impersonation_grants"("partnerId");
CREATE INDEX IF NOT EXISTS "impersonation_grants_hqAdminId_idx"        ON "impersonation_grants"("hqAdminId");

DO $$ BEGIN
  ALTER TABLE "impersonation_grants"
    ADD CONSTRAINT "impersonation_grants_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 9. Cron runs.
--
-- So the billing screen's "last run / next run" reads a fact. Inferring the
-- last run from the newest statement's frozenAt is wrong in the one case that
-- matters: a run that fired and produced nothing looks identical to a run that
-- never fired, and the freeze cron on this project has never once succeeded
-- (CRON_SECRET is unset — see implementation_plan.md §0.6).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cron_runs" (
    "id"         TEXT NOT NULL,
    "job"        TEXT NOT NULL,
    "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok"         BOOLEAN,
    -- Counts and failures as JSON, not prose: this is read by a screen.
    "detail"     JSONB,
    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cron_runs_job_startedAt_idx" ON "cron_runs"("job", "startedAt" DESC);

-- ----------------------------------------------------------------------------
-- 10. Program settings: the overdue threshold.
--
-- Config, not a constant, because "when does a payout become overdue" is a
-- commercial decision and changing it should not be a deploy. 15 days.
-- ----------------------------------------------------------------------------
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "overdueDays"  INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "hqBookingUrl" TEXT;

INSERT INTO "program_settings" ("id", "overdueDays", "hqBookingUrl", "updatedAt")
VALUES ('program', 15, 'https://calendar.app.google/rYoC3ZLKZFvUYrfz5', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE
    SET "hqBookingUrl" = COALESCE("program_settings"."hqBookingUrl", EXCLUDED."hqBookingUrl");

-- ----------------------------------------------------------------------------
-- 11. RLS.
--
-- Three groups, because these tables are not all the same shape:
--
--   a) partner-scoped  — an operator may read its own rows.
--   b) HQ-only         — nothing outside a super-admin context sees them.
--   c) partner-READ    — the operator sees it but cannot write it.
--
-- rls.sql carries the same policies so that a re-run of `db:rls` does not
-- quietly drop what this file created. The backstop sweep there would otherwise
-- lock every new table to super-admin, which is the SAFE failure and also a
-- portal that shows a partner nothing.
--
-- Supabase grants `anon` full DML on public by default and the anon key ships in
-- every browser. `authenticated` too: it is the role PostgREST runs a signed-in
-- user as, and every merchant cashier in this database can obtain it. These
-- tables hold territory licences, money movements and impersonation grants.
-- ----------------------------------------------------------------------------

-- (a) partner-scoped: the operator's own rows, read and write.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['territory_assignments']
  LOOP
    EXECUTE format('alter table %I enable row level security;', t);
    EXECUTE format('alter table %I force row level security;', t);
    EXECUTE format('drop policy if exists partner_scope on %I;', t);
    EXECUTE format($f$
      create policy partner_scope on %1$I for all
        using (app.is_super_admin() or "partnerId" = app.current_partner_id())
        with check (app.is_super_admin() or "partnerId" = app.current_partner_id());
    $f$, t);
    EXECUTE format('revoke all on %I from anon;', t);
    EXECUTE format('revoke all on %I from authenticated;', t);
  END LOOP;
END $$;

-- (c) partner-READ: visible to the operator, written only by HQ.
--
-- feature_flags: a partner's own app has to know whether a feature is on. The
-- global rows (partnerId IS NULL) are readable by everyone for that reason; a
-- partner override is readable only by that partner, because "Cebu has the beta
-- and you do not" is not information Cebu's competitor should be able to pull.
--
-- hq_announcements: a partner reads what was published to it. The segment is
-- evaluated in the app, not in the policy — a policy that parses JSON to decide
-- visibility is a policy nobody can verify. What the policy does guarantee is
-- that an UNPUBLISHED announcement is invisible, which is the part that would
-- actually leak.
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flags" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flags_read"  ON "feature_flags";
DROP POLICY IF EXISTS "flags_write" ON "feature_flags";
CREATE POLICY "flags_read" ON "feature_flags" FOR SELECT
  USING (app.is_super_admin()
         OR "partnerId" IS NULL
         OR "partnerId" = app.current_partner_id());
CREATE POLICY "flags_write" ON "feature_flags" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
REVOKE ALL ON "feature_flags" FROM anon;
REVOKE ALL ON "feature_flags" FROM authenticated;

ALTER TABLE "hq_announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hq_announcements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcement_read"  ON "hq_announcements";
DROP POLICY IF EXISTS "announcement_write" ON "hq_announcements";
CREATE POLICY "announcement_read" ON "hq_announcements" FOR SELECT
  USING (app.is_super_admin()
         OR ("publishedAt" IS NOT NULL AND app.current_partner_id() IS NOT NULL));
CREATE POLICY "announcement_write" ON "hq_announcements" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
REVOKE ALL ON "hq_announcements" FROM anon;
REVOKE ALL ON "hq_announcements" FROM authenticated;

-- The receipt is the one thing a partner WRITES here: reading an announcement
-- is the partner's own act.
ALTER TABLE "hq_announcement_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hq_announcement_reads" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_scope" ON "hq_announcement_reads";
CREATE POLICY "partner_scope" ON "hq_announcement_reads" FOR ALL
  USING (app.is_super_admin() OR "partnerId" = app.current_partner_id())
  WITH CHECK (app.is_super_admin() OR "partnerId" = app.current_partner_id());
REVOKE ALL ON "hq_announcement_reads" FROM anon;
REVOKE ALL ON "hq_announcement_reads" FROM authenticated;

-- (b) HQ-only. A partner must not be able to enumerate the grants that let HQ
-- into its console, nor read another territory's assignment history, nor see
-- when a job last ran.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['impersonation_grants', 'cron_runs']
  LOOP
    EXECUTE format('alter table %I enable row level security;', t);
    EXECUTE format('alter table %I force row level security;', t);
    EXECUTE format('drop policy if exists super_only on %I;', t);
    EXECUTE format($f$
      create policy super_only on %1$I for all
        using (app.is_super_admin()) with check (app.is_super_admin());
    $f$, t);
    EXECUTE format('revoke all on %I from anon;', t);
    EXECUTE format('revoke all on %I from authenticated;', t);
  END LOOP;
END $$;

-- territories is reference data — 143 Philippine cities and what they cost.
-- Readable by anyone in an app context (the waitlist form needs the list), and
-- writable only by HQ. It carried no policy before this file, which meant the
-- backstop sweep locked it to super-admin and the public city list could not be
-- read at all.
ALTER TABLE "territories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "territory_read"  ON "territories";
DROP POLICY IF EXISTS "territory_write" ON "territories";
-- And the backstop's lock, which is what territories carried until now. Left in
-- place it is harmless — permissive policies are OR'd and both write policies
-- demand the same thing — but a stale policy on a table is a thing the next
-- person has to reason about before they can trust the two below.
DROP POLICY IF EXISTS "super_only"     ON "territories";
CREATE POLICY "territory_read" ON "territories" FOR SELECT USING (true);
CREATE POLICY "territory_write" ON "territories" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
-- "Anyone in an app context" means a Postgres session this codebase opened, NOT
-- the browser. anon and authenticated get nothing here for the same reason they
-- get nothing on partner_waitlist: every read and write goes through a server
-- action, so those roles need no grant — and a territory row now says who owns
-- a city and for how much.
REVOKE ALL ON "territories" FROM anon;
REVOKE ALL ON "territories" FROM authenticated;
