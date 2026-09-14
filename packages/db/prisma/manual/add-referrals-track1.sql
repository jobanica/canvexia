-- Affiliate & referral program — Track 1 (restaurant-to-restaurant credit).
-- Run in the Supabase SQL editor. Safe to re-run.

-- ----------------------------------------------------------------- tables
CREATE TABLE IF NOT EXISTS "referral_codes" (
  "id"           TEXT PRIMARY KEY,
  "code"         TEXT NOT NULL UNIQUE,
  "ownerType"    TEXT NOT NULL,
  "restaurantId" TEXT REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "partnerId"    TEXT,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "referral_codes_restaurantId_idx" ON "referral_codes" ("restaurantId");

CREATE TABLE IF NOT EXISTS "referrals" (
  "id"                   TEXT PRIMARY KEY,
  "referralCodeId"       TEXT NOT NULL,
  "referrerRestaurantId" TEXT REFERENCES "restaurants"("id") ON DELETE SET NULL,
  "referredRestaurantId" TEXT NOT NULL UNIQUE REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "status"               TEXT NOT NULL DEFAULT 'signed_up',
  "firstPaidAt"          TIMESTAMP(3),
  "paidMonths"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "referrals_referralCodeId_idx" ON "referrals" ("referralCodeId");
CREATE INDEX IF NOT EXISTS "referrals_referrerRestaurantId_idx" ON "referrals" ("referrerRestaurantId");

CREATE TABLE IF NOT EXISTS "account_credits" (
  "id"               TEXT PRIMARY KEY,
  "restaurantId"     TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "amount"           INTEGER NOT NULL,
  "reason"           TEXT NOT NULL,
  "sourceReferralId" TEXT,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "appliedInvoiceId" TEXT,
  "appliedAt"        TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- One referral-sourced credit per restaurant per referral (idempotency). NULLs
-- are distinct in Postgres, so manual credits (null sourceReferralId) don't clash.
CREATE UNIQUE INDEX IF NOT EXISTS "account_credits_restaurantId_sourceReferralId_key"
  ON "account_credits" ("restaurantId", "sourceReferralId");
CREATE INDEX IF NOT EXISTS "account_credits_restaurantId_status_idx"
  ON "account_credits" ("restaurantId", "status");

CREATE TABLE IF NOT EXISTS "program_settings" (
  "id"                   TEXT PRIMARY KEY DEFAULT 'program',
  "track1CreditMonths"   INTEGER NOT NULL DEFAULT 1,
  "track2CommissionPct"  INTEGER NOT NULL DEFAULT 25,
  "track2ResellerPct"    INTEGER NOT NULL DEFAULT 35,
  "track2DurationMonths" INTEGER NOT NULL DEFAULT 12,
  "bountyAmount"         INTEGER NOT NULL DEFAULT 0,
  "payoutModel"          TEXT NOT NULL DEFAULT 'recurring',
  "cookieDays"           INTEGER NOT NULL DEFAULT 30,
  "clawbackDays"         INTEGER NOT NULL DEFAULT 60,
  "minPayout"            INTEGER NOT NULL DEFAULT 50000,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT now()
);
INSERT INTO "program_settings" ("id") VALUES ('program') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "referral_events" (
  "id"         TEXT PRIMARY KEY,
  "referralId" TEXT,
  "type"       TEXT NOT NULL,
  "detailJson" JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "referral_events_referralId_idx" ON "referral_events" ("referralId");

-- ----------------------------------------------------------------- RLS
-- Restaurant-scoped: a restaurant sees only its own codes/credits, and the
-- referrals it made. Super-admin (systemDb) bypasses. Platform tables
-- (program_settings, referral_events) are super-admin only.

ALTER TABLE "referral_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referral_codes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "referral_codes";
CREATE POLICY tenant_isolation ON "referral_codes"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());

ALTER TABLE "account_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_credits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "account_credits";
CREATE POLICY tenant_isolation ON "account_credits"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());

ALTER TABLE "referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referrals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "referrals";
CREATE POLICY tenant_isolation ON "referrals"
  USING (app.is_super_admin() OR "referrerRestaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "referrerRestaurantId" = app.current_restaurant_id());

ALTER TABLE "program_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "program_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_admin_only ON "program_settings";
CREATE POLICY super_admin_only ON "program_settings"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "referral_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "referral_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_admin_only ON "referral_events";
CREATE POLICY super_admin_only ON "referral_events"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
