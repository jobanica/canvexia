-- ============================================================================
-- OPTIONAL AND DESTRUCTIVE — you do not have to run this.
-- ============================================================================
--
-- The partner program no longer pays or charges a commission. A partner sets
-- restaurants up and bills them directly, at whatever price they agree, so
-- there is nothing to attribute, accrue, claw back or pay out.
--
-- All the application code that read these tables is already deleted, and the
-- Prisma schema no longer declares them. Everything works with the tables still
-- sitting there. This script is only for tidying the database afterwards.
--
-- WHAT IT DELETES, PERMANENTLY:
--   * every referral code and attribution ever recorded
--   * every commission line, payout batch and partner bonus
--   * every account credit (the restaurant-to-restaurant reward)
--   * the commission/bonus/clawback/withholding settings columns
--
-- If you might ever want to reconcile an old payout, take a backup first, or
-- simply don't run this — the tables are inert either way.
--
-- Run it on its own, and only when you're sure.
-- ============================================================================

BEGIN;

-- Referral attribution and its audit trail.
DROP TABLE IF EXISTS "referral_events" CASCADE;
DROP TABLE IF EXISTS "referrals" CASCADE;
DROP TABLE IF EXISTS "referral_codes" CASCADE;

-- Money that was owed to, or credited by, the program.
DROP TABLE IF EXISTS "commissions" CASCADE;
DROP TABLE IF EXISTS "partner_bonuses" CASCADE;
DROP TABLE IF EXISTS "payouts" CASCADE;
DROP TABLE IF EXISTS "account_credits" CASCADE;

-- Program settings survives as a singleton, but only for the training video.
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "track1CreditMonths";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "commissionPctYear1";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "commissionPctOngoing";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "bonusTiersJson";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "track2CommissionPct";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "track2ResellerPct";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "track2DurationMonths";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "bountyAmount";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "payoutModel";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "cookieDays";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "clawbackDays";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "minPayout";
ALTER TABLE "program_settings" DROP COLUMN IF EXISTS "withholdingPct";

-- Make sure the singleton row exists so the training video has somewhere to go.
INSERT INTO "program_settings" ("id", "updatedAt")
VALUES ('program', now())
ON CONFLICT ("id") DO NOTHING;

-- Partners keep their payout/tax columns: nothing writes them any more, but the
-- details people already gave us are theirs, and dropping the columns would
-- destroy that silently. Uncomment if you'd rather not hold them at all.
-- ALTER TABLE "partners" DROP COLUMN IF EXISTS "payoutMethod";
-- ALTER TABLE "partners" DROP COLUMN IF EXISTS "payoutDetailsEnc";
-- ALTER TABLE "partners" DROP COLUMN IF EXISTS "taxInfoEnc";

COMMIT;
