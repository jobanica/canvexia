-- ============================================================================
-- Partner program — everything it needs, and nothing it doesn't.
-- Run in the Supabase SQL editor. Safe to re-run.
-- ============================================================================
--
-- The `partners` table used to be created by add-referrals-track2.sql, bundled
-- in with commissions and payouts, and that file starts by ALTERing `referrals`
-- — so on a database that never ran the referral migrations it fails on line 4
-- and creates nothing. That is why the partner portal reports
-- `relation "partners" does not exist`.
--
-- There is no commission any more (a partner sets restaurants up and bills them
-- directly), so those tables are not wanted. This is the replacement: the four
-- things the current code actually reads, self-contained, in dependency order.
--
--   1. partners            — the partner and their login
--   2. program_settings    — singleton, holds the training video URL
--   3. restaurants.demoPartnerId — which partner built a storefront
--   4. staff_users.username      — the login handle conversion hands over
--
-- Nothing here drops or rewrites data. Every statement is IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- 1. The partner. payoutMethod/payoutDetailsEnc/taxInfoEnc are kept nullable
--    and unused: Servd pays partners nothing now, but old rows may carry them
--    and the model still declares them.
CREATE TABLE IF NOT EXISTS "partners" (
  "id"               TEXT PRIMARY KEY,
  "authUserId"       TEXT UNIQUE,
  "name"             TEXT NOT NULL,
  "email"            TEXT NOT NULL UNIQUE,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "tier"             TEXT NOT NULL DEFAULT 'reseller',
  "payoutMethod"     TEXT,
  "payoutDetailsEnc" TEXT,
  "taxInfoEnc"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- 2. Program settings. A singleton row keyed 'program'; the only setting left
--    is the onboarding video shown on the partner dashboard. Created minimally
--    — if an older database already has this table with the commission columns,
--    IF NOT EXISTS leaves it exactly as it is.
CREATE TABLE IF NOT EXISTS "program_settings" (
  "id"                 TEXT PRIMARY KEY DEFAULT 'program',
  "partnerTrainingUrl" TEXT,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT now()
);
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "partnerTrainingUrl" TEXT;
INSERT INTO "program_settings" ("id") VALUES ('program') ON CONFLICT ("id") DO NOTHING;

-- 3. Which partner built a storefront. Without this column the partner portal
--    lists nothing at all — it's the only link between a partner and their work.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "demoPartnerId" TEXT;
CREATE INDEX IF NOT EXISTS "restaurants_demoPartnerId_idx" ON "restaurants" ("demoPartnerId");

-- 4. The login handle. Conversion creates a staff_users row carrying it, and
--    it's what the partner reads out to the restaurant owner.
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_username_key" ON "staff_users" ("username");

-- RLS: platform-level tables, super-admin only. No restaurant tenant reaches
-- them. Partner-portal isolation is enforced in the app layer (every query
-- filtered by partnerId through systemDb), as with other platform data.
--
-- Guarded on app.is_super_admin() existing — it's created by prisma/rls.sql. If
-- that hasn't been run, RLS is still enabled (the service role bypasses it, so
-- the app keeps working) and the policy can be added later by re-running this.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['partners','program_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    IF to_regprocedure('app.is_super_admin()') IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS super_admin_only ON %I;', t);
      EXECUTE format(
        'CREATE POLICY super_admin_only ON %I USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());',
        t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Check it worked. Expect: partners = t, program_settings = t, and both
-- columns = t.
-- ----------------------------------------------------------------------------
SELECT to_regclass('public.partners')         IS NOT NULL AS partners_table,
       to_regclass('public.program_settings') IS NOT NULL AS program_settings_table,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'restaurants' AND column_name = 'demoPartnerId') AS demo_partner_column,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'staff_users' AND column_name = 'username')      AS username_column;
