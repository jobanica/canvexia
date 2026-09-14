-- CANVEXIA Phase 1 — the partner axis.
--
-- Gives merchants an owning partner, gives partners the operator fields the
-- revenue share needs, and lets the audit log record actions that belong to a
-- partner or to HQ rather than to one restaurant.
--
-- Run in the Supabase SQL editor BEFORE deploying, then `npm run db:rls` to
-- install the partner policies that read restaurants."partnerId". Idempotent.
--
-- This adds columns only. Nothing is backfilled here: moving existing
-- restaurants under the house partner is a separate, reviewable step —
--     node scripts/backfill-house-partner.mjs           (dry run, prints a plan)
--     node scripts/backfill-house-partner.mjs --apply
-- because it is the one operation in this migration with no clean undo.

-- --- restaurants ------------------------------------------------------------
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;

-- Every partner-scoped read reaches the partner through this column, so it is
-- on the hot path of the whole portal, not just of reporting.
CREATE INDEX IF NOT EXISTS "restaurants_partnerId_idx" ON "restaurants" ("partnerId");

-- --- partners ---------------------------------------------------------------
-- revenueSharePct defaults to 0 on purpose: that is correct for every row that
-- already exists, all of which are legacy zero-cut partners. It is NOT a safe
-- default for a new operator, and the application refuses to save one at 0 —
-- see src/lib/partners/revenue-share.ts.
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "brandConfig" JSONB;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "territory" TEXT;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "revenueSharePct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "collectionMode" TEXT NOT NULL DEFAULT 'partner_collects';
ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "brandMode" TEXT NOT NULL DEFAULT 'powered_by';

CREATE UNIQUE INDEX IF NOT EXISTS "partners_slug_key" ON "partners" ("slug");

-- --- audit_logs -------------------------------------------------------------
-- restaurantId becomes nullable so an HQ or partner action can be recorded.
-- Widening a NOT NULL to NULL rewrites no rows and takes only a brief lock.
ALTER TABLE "audit_logs" ALTER COLUMN "restaurantId" DROP NOT NULL;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorType" TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_partnerId_createdAt_idx"
  ON "audit_logs" ("partnerId", "createdAt");

-- --- verification -----------------------------------------------------------
-- Expect three rows, all true.
SELECT 'restaurants.partnerId' AS column,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'restaurants' AND column_name = 'partnerId') AS present
UNION ALL
SELECT 'partners.revenueSharePct',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'partners' AND column_name = 'revenueSharePct')
UNION ALL
SELECT 'audit_logs.restaurantId is nullable',
       (SELECT is_nullable = 'YES' FROM information_schema.columns
        WHERE table_name = 'audit_logs' AND column_name = 'restaurantId');
