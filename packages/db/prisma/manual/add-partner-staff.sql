-- Partner Portal A7.1: the fourth role, editable permissions, staff records,
-- field attendance, visits, targets and commissions.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- READ THIS FIRST. Every table touched here already has rows in production, so
-- every column added is nullable or database-defaulted. A plain Prisma default
-- is written into the INSERT of every create() in the codebase and breaks
-- creates on a database that has not run this file yet.
--
-- Check-in selfies and visit photos go in a PRIVATE Storage bucket named
-- "partner-attendance". You do not have to create it by hand: the uploader
-- calls ensureBucket() the way clock-photos.ts already does. Creating it in the
-- dashboard first is fine too — ensureBucket is a no-op when it exists.

-- ----------------------------------------------------------------------------
-- 1. The fourth seat role.
--
-- `ops_manager`, not `partner_ops_manager`: the row already knows it belongs to
-- a partner, and the three existing values are short for the same reason.
--
-- The brief also asks to migrate partner_sales → sales and partner_support →
-- support. There is NOTHING TO MIGRATE: this CHECK has said admin|sales|support
-- since add-partner-portal.sql and no row has ever held the long form. The
-- assertion below proves that rather than assuming it — if some row somewhere
-- does hold a long name, this file stops instead of silently dropping the
-- constraint that would have caught it.
-- ----------------------------------------------------------------------------
DO $$
DECLARE stray INT;
BEGIN
  SELECT count(*) INTO stray FROM "partner_users"
   WHERE "role" NOT IN ('admin', 'ops_manager', 'sales', 'support');
  IF stray > 0 THEN
    RAISE EXCEPTION 'partner_users holds % row(s) with an unexpected role; fix those first', stray;
  END IF;
END $$;

ALTER TABLE "partner_users" DROP CONSTRAINT IF EXISTS "partner_users_role_check";
ALTER TABLE "partner_users"
  ADD CONSTRAINT "partner_users_role_check"
  CHECK ("role" IN ('admin', 'ops_manager', 'sales', 'support'));

-- ----------------------------------------------------------------------------
-- 2. Staff profile columns.
--
-- On partner_users rather than a parallel `staff_profiles` table. A seat and a
-- staff member are the same person here — there is no such thing in this
-- product as a field salesperson without a login — and a 1:1 table would only
-- add a join and a way for the two to disagree.
--
-- The emergency contact is the sensitive pair. It is never selected unless the
-- reader holds hr.view_all, which is enforced in the query rather than by
-- fetching and hiding: a value that reaches the client hidden is a value in the
-- payload.
-- ----------------------------------------------------------------------------
ALTER TABLE "partner_users" ADD COLUMN IF NOT EXISTS "mobile"          TEXT;
ALTER TABLE "partner_users" ADD COLUMN IF NOT EXISTS "zone"            TEXT;
ALTER TABLE "partner_users" ADD COLUMN IF NOT EXISTS "startDate"       TIMESTAMP(3);
ALTER TABLE "partner_users" ADD COLUMN IF NOT EXISTS "photoPath"       TEXT;
ALTER TABLE "partner_users" ADD COLUMN IF NOT EXISTS "emergencyName"   TEXT;
ALTER TABLE "partner_users" ADD COLUMN IF NOT EXISTS "emergencyMobile" TEXT;

-- ----------------------------------------------------------------------------
-- 3. The permission grid.
--
-- OVERRIDES ONLY. A missing row means "use the default in packages/core", not
-- "denied" — so adding a thirtieth permission key in a later release does not
-- silently deny it to every partner that has already been seeded.
--
-- Primary key is (partnerId, role, permission): one answer per partner per role
-- per key, and an upsert target that cannot produce two.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "partner_role_permissions" (
  "partnerId"  TEXT        NOT NULL,
  "role"       TEXT        NOT NULL,
  "permission" TEXT        NOT NULL,
  "allowed"    BOOLEAN     NOT NULL,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy"  TEXT,
  CONSTRAINT "partner_role_permissions_pkey" PRIMARY KEY ("partnerId", "role", "permission"),
  CONSTRAINT "partner_role_permissions_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "partner_role_permissions_role_check"
    CHECK ("role" IN ('admin', 'ops_manager', 'sales', 'support'))
);

-- ----------------------------------------------------------------------------
-- 4. Staff events — what a person DID.
--
-- Deliberately NOT audit_logs. An audit row answers "what changed and who
-- changed it"; half of what the activity tab shows changed nothing at all — a
-- call placed, a visit where the owner was out, a demo walked through. Writing
-- those into audit_logs would bury the rows that exist to be reviewed.
--
-- `kind` is a free string with a CHECK, not an enum: adding a kind should be
-- one ALTER, not a schema migration coupled to a code release. Same reasoning
-- as partner_users.role.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "staff_events" (
  "id"            TEXT         NOT NULL,
  "partnerId"     TEXT         NOT NULL,
  "partnerUserId" TEXT         NOT NULL,
  "kind"          TEXT         NOT NULL,
  -- What it was about, when there is one. Product-scoped for merchants,
  -- because a merchant id is unique only within its product (D29).
  "subjectType"   TEXT,
  "productId"     TEXT,
  "subjectId"     TEXT,
  "detail"        JSONB,
  "occurredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_events_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_events_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_events_kind_check" CHECK ("kind" IN (
    'prospect.added', 'prospect.stage', 'call.logged', 'visit.logged',
    'demo.built', 'trial.started', 'merchant.converted', 'ticket.closed',
    'attendance.check_in', 'attendance.check_out'
  )),
  CONSTRAINT "staff_events_subjectType_check"
    CHECK ("subjectType" IS NULL OR "subjectType" IN ('prospect', 'merchant'))
);
CREATE INDEX IF NOT EXISTS "staff_events_partnerId_occurredAt_idx"
  ON "staff_events" ("partnerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "staff_events_partnerUserId_occurredAt_idx"
  ON "staff_events" ("partnerUserId", "occurredAt");

-- ----------------------------------------------------------------------------
-- 5. Monthly targets.
--
-- `month` is a 'YYYY-MM' key and not a date, for the reason the statement month
-- is one: Vercel Cron is UTC and Manila is UTC+8, so anything derived from an
-- instant lands in the wrong month for eight hours a day. A key has no time
-- zone in it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "staff_targets" (
  "id"              TEXT         NOT NULL,
  "partnerId"       TEXT         NOT NULL,
  "partnerUserId"   TEXT         NOT NULL,
  "month"           TEXT         NOT NULL,
  "targetMerchants" INTEGER      NOT NULL DEFAULT 0,
  "targetVisits"    INTEGER      NOT NULL DEFAULT 0,
  "targetDemos"     INTEGER      NOT NULL DEFAULT 0,
  "setByUserId"     TEXT,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_targets_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_targets_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_targets_month_check" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_targets_partnerUserId_month_key"
  ON "staff_targets" ("partnerUserId", "month");
CREATE INDEX IF NOT EXISTS "staff_targets_partnerId_month_idx"
  ON "staff_targets" ("partnerId", "month");

-- ----------------------------------------------------------------------------
-- 6. Attendance sessions.
--
-- Shaped after `time_entries`, which does the same job for a merchant's own
-- restaurant staff. Different axis — that one is scoped by restaurantId, this
-- by partnerId — so they are separate tables on purpose, but the selfie
-- handling and the open/closed pair are the same and proven.
--
-- ONE OPEN SESSION PER DAY is a partial unique index, not application logic:
-- two taps on a flaky connection are the normal case, not the edge case.
-- `dayKey` is the Manila day, computed by the caller, for the reason in §5.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "attendance_sessions" (
  "id"              TEXT         NOT NULL,
  "partnerId"       TEXT         NOT NULL,
  "partnerUserId"   TEXT         NOT NULL,
  "dayKey"          TEXT         NOT NULL,
  "checkInAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkInLat"      DOUBLE PRECISION,
  "checkInLng"      DOUBLE PRECISION,
  "checkInAccuracy" DOUBLE PRECISION,
  "checkInPhoto"    TEXT,
  "checkOutAt"      TIMESTAMP(3),
  "checkOutLat"     DOUBLE PRECISION,
  "checkOutLng"     DOUBLE PRECISION,
  "checkOutAccuracy" DOUBLE PRECISION,
  "checkOutPhoto"   TEXT,
  -- Set when the 23:59 Manila sweep closed it instead of the person. A day that
  -- was never checked out of is a fact a manager needs, not one to paper over
  -- by writing a plausible time.
  "autoClosed"      BOOLEAN      NOT NULL DEFAULT false,
  "device"          TEXT,
  "clientRef"       TEXT,
  CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_sessions_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_sessions_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_sessions_dayKey_check" CHECK ("dayKey" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_sessions_user_day_key"
  ON "attendance_sessions" ("partnerUserId", "dayKey");
CREATE INDEX IF NOT EXISTS "attendance_sessions_partnerId_dayKey_idx"
  ON "attendance_sessions" ("partnerId", "dayKey");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_sessions_clientRef_key"
  ON "attendance_sessions" ("clientRef") WHERE "clientRef" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. Field visits.
--
-- `clientRef` is what makes the offline queue safe. The device mints a UUID
-- before it has a connection, the column is unique, and a sync that replays —
-- which it will, because that is what a queue on a phone in a market does — is
-- a no-op rather than a second visit. Same mechanism as
-- partner_ledger_entries.providerRef.
--
-- `distanceMeters` is NULL when the subject has no stored address, and the UI
-- says "no address on file" rather than showing a distance of zero. Those are
-- not the same fact and only one of them is a flag.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "staff_visits" (
  "id"             TEXT         NOT NULL,
  "partnerId"      TEXT         NOT NULL,
  "partnerUserId"  TEXT         NOT NULL,
  "subjectType"    TEXT         NOT NULL,
  "productId"      TEXT,
  "subjectId"      TEXT         NOT NULL,
  "subjectName"    TEXT,
  "lat"            DOUBLE PRECISION,
  "lng"            DOUBLE PRECISION,
  "accuracy"       DOUBLE PRECISION,
  "distanceMeters" DOUBLE PRECISION,
  "outcome"        TEXT         NOT NULL,
  "notes"          TEXT,
  "photoPath"      TEXT,
  "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clientRef"      TEXT,
  CONSTRAINT "staff_visits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_visits_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_visits_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_visits_subjectType_check" CHECK ("subjectType" IN ('prospect', 'merchant')),
  CONSTRAINT "staff_visits_outcome_check"
    CHECK ("outcome" IN ('met_owner', 'not_available', 'follow_up', 'signed'))
);
CREATE INDEX IF NOT EXISTS "staff_visits_partnerId_occurredAt_idx"
  ON "staff_visits" ("partnerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "staff_visits_partnerUserId_occurredAt_idx"
  ON "staff_visits" ("partnerUserId", "occurredAt");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_visits_clientRef_key"
  ON "staff_visits" ("clientRef") WHERE "clientRef" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 8. Commission rules.
--
-- Several may be active at once — per_signup plus pct_recurring is the ordinary
-- arrangement — so this is a list, not a column on the seat.
--
-- `value` is centavos for per_signup and BASIS POINTS for the two percentages.
-- An integer either way: a commission of 2.5% stored as 0.025 in a float is how
-- a statement ends up a centavo short of the sum of its own lines.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "commission_rules" (
  "id"            TEXT         NOT NULL,
  "partnerId"     TEXT         NOT NULL,
  "partnerUserId" TEXT         NOT NULL,
  "type"          TEXT         NOT NULL,
  "value"         INTEGER      NOT NULL DEFAULT 0,
  "appliesTo"     TEXT         NOT NULL DEFAULT 'all_products',
  "productId"     TEXT,
  "startsAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt"        TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"     TEXT,
  CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_rules_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "commission_rules_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE,
  CONSTRAINT "commission_rules_type_check"
    CHECK ("type" IN ('per_signup', 'pct_first_month', 'pct_recurring', 'none')),
  -- appliesTo names a product only when it is not all of them, and must name
  -- one when it is. A rule scoped to nothing is a rule that pays nobody and
  -- reads as a bug in the statement rather than in the rule.
  CONSTRAINT "commission_rules_appliesTo_check" CHECK (
    ("appliesTo" = 'all_products' AND "productId" IS NULL)
    OR ("appliesTo" = 'product' AND "productId" IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS "commission_rules_partnerUserId_idx"
  ON "commission_rules" ("partnerUserId");
CREATE INDEX IF NOT EXISTS "commission_rules_partnerId_idx"
  ON "commission_rules" ("partnerId");

-- ----------------------------------------------------------------------------
-- 9. Commission statements and their lines.
--
-- FROZEN, like partner_statements. A rule edited in March must not rewrite
-- January: every line snapshots the rule type and value that produced it, the
-- same reasoning as partner_ledger_entries.sharePct.
--
-- One statement per staff member per month, enforced by a unique index rather
-- than by the job remembering — the job is a cron and crons re-run.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "commission_statements" (
  "id"            TEXT         NOT NULL,
  "partnerId"     TEXT         NOT NULL,
  "partnerUserId" TEXT         NOT NULL,
  "month"         TEXT         NOT NULL,
  "totalCentavos" INTEGER      NOT NULL DEFAULT 0,
  "frozenAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt"        TIMESTAMP(3),
  "paidReference" TEXT,
  "paidBy"        TEXT,
  CONSTRAINT "commission_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_statements_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE,
  CONSTRAINT "commission_statements_partnerUserId_fkey"
    FOREIGN KEY ("partnerUserId") REFERENCES "partner_users"("id") ON DELETE CASCADE,
  CONSTRAINT "commission_statements_month_check" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "commission_statements_user_month_key"
  ON "commission_statements" ("partnerUserId", "month");
CREATE INDEX IF NOT EXISTS "commission_statements_partnerId_month_idx"
  ON "commission_statements" ("partnerId", "month");

CREATE TABLE IF NOT EXISTS "commission_lines" (
  "id"            TEXT    NOT NULL,
  "statementId"   TEXT    NOT NULL,
  "productId"     TEXT    NOT NULL,
  "merchantId"    TEXT    NOT NULL,
  "merchantName"  TEXT,
  "ruleType"      TEXT    NOT NULL,
  "ruleValue"     INTEGER NOT NULL,
  "basisCentavos" INTEGER NOT NULL DEFAULT 0,
  "amountCentavos" INTEGER NOT NULL DEFAULT 0,
  "ledgerEntryId" TEXT,
  CONSTRAINT "commission_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_lines_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "commission_statements"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "commission_lines_statementId_idx"
  ON "commission_lines" ("statementId");
-- One line per ledger entry per statement. A replayed job cannot pay twice.
CREATE UNIQUE INDEX IF NOT EXISTS "commission_lines_statement_entry_key"
  ON "commission_lines" ("statementId", "ledgerEntryId") WHERE "ledgerEntryId" IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 10. Merchant assignment — two tables, because there are two merchant tables.
--
-- Decision D29: each product has its own merchant table and ids are unique only
-- WITHIN a product. So "the merchants assigned to this salesperson" is a union
-- of two queries, exactly as listPartnerMerchants already is.
--
-- No foreign key to partner_users on purpose... actually there is one, and it
-- is ON DELETE SET NULL: a deactivated seat is KEPT (the audit log names an
-- actor), but if a row is ever truly deleted, an unassigned merchant is the
-- correct outcome and a dangling id is not.
-- ----------------------------------------------------------------------------
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "assignedSalesUserId"   TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "assignedSupportUserId" TEXT;
ALTER TABLE "pharmacies"  ADD COLUMN IF NOT EXISTS "assignedSalesUserId"   TEXT;
ALTER TABLE "pharmacies"  ADD COLUMN IF NOT EXISTS "assignedSupportUserId" TEXT;

DO $$ BEGIN
  ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_assignedSalesUserId_fkey"
    FOREIGN KEY ("assignedSalesUserId") REFERENCES "partner_users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_assignedSupportUserId_fkey"
    FOREIGN KEY ("assignedSupportUserId") REFERENCES "partner_users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_assignedSalesUserId_fkey"
    FOREIGN KEY ("assignedSalesUserId") REFERENCES "partner_users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_assignedSupportUserId_fkey"
    FOREIGN KEY ("assignedSupportUserId") REFERENCES "partner_users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "restaurants_assignedSalesUserId_idx"
  ON "restaurants" ("assignedSalesUserId");
CREATE INDEX IF NOT EXISTS "pharmacies_assignedSalesUserId_idx"
  ON "pharmacies" ("assignedSalesUserId");

-- The round-robin fallback for the public lead form, and the default assignee.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "defaultLeadUserId" TEXT;

-- ----------------------------------------------------------------------------
-- 11. The audit log learns the actor's ROLE.
--
-- "Every write → audit_log with actor and role AT TIME OF ACTION." The role is
-- snapshotted for the same reason actorEmail is: a seat promoted to admin next
-- month must not retroactively make every action it ever took an admin action.
-- ----------------------------------------------------------------------------
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorRole" TEXT;

-- ----------------------------------------------------------------------------
-- 12. Seed the permission grid for every partner that exists.
--
-- Overrides only, so this writes NOTHING: the defaults in packages/core already
-- answer for every partner, including ones created after this file runs. The
-- statement is here as documentation of that decision and as the place a future
-- seed would go if the decision is ever reversed.
--
-- What DOES need doing is the ops_manager seat itself — there are none, because
-- the role did not exist until section 1. A partner promotes somebody from
-- /team once this ships.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- VERIFY. Every row should read t.
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) = 8 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (
      'partner_role_permissions','staff_events','staff_targets',
      'attendance_sessions','staff_visits','commission_rules',
      'commission_statements','commission_lines')) AS all_tables,
  (SELECT count(*) = 4 FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN
      ('assignedSalesUserId','assignedSupportUserId')
      AND table_name IN ('restaurants','pharmacies'))                AS assignment_columns,
  (SELECT count(*) = 6 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'partner_users'
      AND column_name IN ('mobile','zone','startDate','photoPath',
                          'emergencyName','emergencyMobile'))        AS profile_columns,
  (SELECT count(*) = 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND column_name = 'actorRole')                                 AS actor_role,
  (SELECT pg_get_constraintdef(oid) LIKE '%ops_manager%' FROM pg_constraint
    WHERE conname = 'partner_users_role_check')                      AS fourth_role;
