-- ============================================================================
-- BILLING LEARNS THERE IS MORE THAN ONE PRODUCT.
--
-- REPORTED — "build the billing. same 999, all features open." for Resceta.
--
-- `subscriptions` and `restaurant_invoices` were written when a merchant was a
-- restaurant and nothing else. A pharmacy therefore had no subscription row at
-- all: no plan, no expiry, no renewal, no invoice — and, worse,
-- `recordSettlement` reads `tx.restaurant`, so a pharmacy could never produce a
-- ledger entry. A partner selling Resceta earned nothing this platform recorded
-- and CANVEXIA's 30% never accrued.
--
-- THE PATTERN ALREADY EXISTS IN THIS DATABASE. `partner_ledger_entries` and
-- `merchant_renewals` both carry (productId, merchantId) with the note "the
-- table it points at depends on productId". This makes the last two billing
-- tables agree with them rather than inventing a parallel set of pharmacy_*
-- tables — a second billing engine is a second thing to keep correct, and the
-- two would disagree the first time one was fixed.
--
-- THE COLUMN KEEPS ITS NAME. `restaurantId` now means "the merchant id within
-- productId", exactly as `merchant_renewals.merchantId` does. Renaming it would
-- touch fifty-five call sites for no behavioural gain and turn a contained
-- migration into a rewrite of code that is currently taking money.
--
-- THE FOREIGN KEY GOES, and that is the real cost of this migration, stated
-- plainly: Postgres can no longer guarantee that a subscription points at a
-- restaurant that exists. It cannot, because for half the rows it will not be a
-- restaurant. The same trade was already made on the ledger for the same
-- reason. What replaces it is the WHERE clause in every query — see
-- server/billing/merchant-ref.ts, which resolves a (productId, merchantId) pair
-- against the right table and refuses a pair that resolves to nothing.
--
-- ON DELETE CASCADE goes with it. A restaurant deleted today leaves its
-- subscription and invoices behind instead of taking them. For a money table
-- that is the better failure: an orphaned invoice can be found and explained,
-- a silently deleted one cannot.
--
-- Idempotent, like every migration in this folder.
-- ============================================================================

ALTER TABLE "subscriptions"       ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT 'servd';
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT 'servd';

-- Every existing row IS a restaurant's, which is what the default says.

ALTER TABLE "subscriptions"       DROP CONSTRAINT IF EXISTS "subscriptions_restaurantId_fkey";
ALTER TABLE "restaurant_invoices" DROP CONSTRAINT IF EXISTS "restaurant_invoices_restaurantId_fkey";

-- The lookup every billing query makes. Without it, adding productId to a WHERE
-- that used to be satisfied by the restaurantId index costs a scan.
CREATE INDEX IF NOT EXISTS "subscriptions_product_merchant_idx"
  ON "subscriptions" ("productId", "restaurantId");
CREATE INDEX IF NOT EXISTS "restaurant_invoices_product_merchant_idx"
  ON "restaurant_invoices" ("productId", "restaurantId");

-- ---------------------------------------------------------------------------
-- EVERY PHARMACY GETS THE SAME ₱999 STANDARD PLAN.
--
-- `billedExternally` is TRUE, and that is not a detail. Resceta is sold by
-- partners who collect in cash off this system, so the daily cron must never
-- invoice, dun or suspend one of these: it has no idea whether the money
-- arrived. run-cron.ts already skips any subscription carrying this flag.
--
-- `currentPeriodEnd` is set a month out from today rather than left null. Null
-- reads as "no boundary" to `nextBillingAction`, which is how a Servd shop once
-- sat on Standard with nothing ever expiring — the billing screen would show a
-- plan that never runs out and a Renew button with nothing to renew.
--
-- Only pharmacies that do not already have one, so re-running this is safe and
-- cannot reset somebody's paid-up date.
-- ---------------------------------------------------------------------------

INSERT INTO "subscriptions" ("id", "restaurantId", "productId", "planId", "status",
                             "currentPeriodEnd", "billedExternally", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'pharmacy',
       '00000000-0000-0000-0000-0000000000a4',  -- Standard, ₱999
       'active',
       date_trunc('day', now()) + interval '30 days',
       true,
       now(), now()
  FROM "pharmacies" p
 WHERE NOT EXISTS (
   SELECT 1 FROM "subscriptions" s
    WHERE s."productId" = 'pharmacy' AND s."restaurantId" = p."id"
 );
