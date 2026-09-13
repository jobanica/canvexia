-- Affiliate program — Track 2 (platform partners, recurring commissions, payouts).
-- Run in the Supabase SQL editor AFTER add-referrals-track1.sql. Safe to re-run.

ALTER TABLE "referrals" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
CREATE INDEX IF NOT EXISTS "referrals_partnerId_idx" ON "referrals" ("partnerId");

CREATE TABLE IF NOT EXISTS "partners" (
  "id"               TEXT PRIMARY KEY,
  "authUserId"       TEXT UNIQUE,
  "name"             TEXT NOT NULL,
  "email"            TEXT NOT NULL UNIQUE,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "tier"             TEXT NOT NULL DEFAULT 'affiliate',
  "payoutMethod"     TEXT,
  "payoutDetailsEnc" TEXT,
  "taxInfoEnc"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "commissions" (
  "id"         TEXT PRIMARY KEY,
  "partnerId"  TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "referralId" TEXT NOT NULL,
  "invoiceId"  TEXT NOT NULL,
  "amount"     INTEGER NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'payable',
  "period"     TEXT NOT NULL,
  "payoutId"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT now()
);
-- One commission per paid invoice per referral (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS "commissions_referralId_invoiceId_key"
  ON "commissions" ("referralId", "invoiceId");
CREATE INDEX IF NOT EXISTS "commissions_partnerId_status_idx"
  ON "commissions" ("partnerId", "status");

CREATE TABLE IF NOT EXISTS "payouts" (
  "id"        TEXT PRIMARY KEY,
  "partnerId" TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "period"    TEXT NOT NULL,
  "amount"    INTEGER NOT NULL,
  "method"    TEXT,
  "status"    TEXT NOT NULL DEFAULT 'requested',
  "paidAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payouts_partnerId_status_idx" ON "payouts" ("partnerId", "status");

-- RLS: platform tables are super-admin only (no restaurant tenant access).
-- Partner-portal isolation is enforced in the app layer (filtered by partnerId
-- via systemDb), like other platform-level data.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['partners','commissions','payouts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS super_admin_only ON %I;', t);
    EXECUTE format('CREATE POLICY super_admin_only ON %I USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());', t);
  END LOOP;
END $$;
