-- Affiliate program — FINAL terms: 30% year-1 then 10% lifetime + stacking
-- milestone bonuses. Run in the Supabase SQL editor. Idempotent. Platform-level
-- (super-admin only).

-- 1. Program settings: year-1 / ongoing % + bonus tiers (centavos).
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "commissionPctYear1"   INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "commissionPctOngoing" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "bonusTiersJson"       JSONB;

-- Seed the canonical bonus tiers on the singleton row if not set yet (centavos).
UPDATE "program_settings"
   SET "bonusTiersJson" = '[
     {"activeReferrals":10,"amount":200000},
     {"activeReferrals":25,"amount":500000},
     {"activeReferrals":50,"amount":1500000},
     {"activeReferrals":100,"amount":4000000},
     {"activeReferrals":250,"amount":10000000}
   ]'::jsonb
 WHERE "id" = 'program' AND "bonusTiersJson" IS NULL;

-- 2. Milestone bonuses earned by partners.
CREATE TABLE IF NOT EXISTS "partner_bonuses" (
  "id"        TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "tierCount" INTEGER NOT NULL,
  "amount"    INTEGER NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'earned',
  "payoutId"  TEXT,
  "earnedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "partner_bonuses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "partner_bonuses_partnerId_tierCount_key"
  ON "partner_bonuses"("partnerId", "tierCount");
CREATE INDEX IF NOT EXISTS "partner_bonuses_partnerId_status_idx"
  ON "partner_bonuses"("partnerId", "status");

-- Platform-only: only the super-admin context may read/write.
ALTER TABLE "partner_bonuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_bonuses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "partner_bonuses";
CREATE POLICY super_only ON "partner_bonuses" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
