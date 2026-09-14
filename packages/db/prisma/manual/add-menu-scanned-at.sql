-- One AI menu scan per demo storefront (partner portal).
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Nullable, no default: null means "never scanned". A DEFAULT here would be
-- harmless, but the column is written only by the scan itself.
--
-- Until this is applied the app falls back to "does the storefront already have
-- menu items?", so the one-scan rule holds either way — it's just softer,
-- because deleting the items would let a partner scan again.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "menuScannedAt" TIMESTAMP(3);

-- Backfill: any demo that already has a menu was, in practice, already built.
-- Stamped at the storefront's creation time rather than now, so the column
-- reads as history instead of claiming everything was scanned today.
UPDATE "restaurants" r
SET "menuScannedAt" = r."createdAt"
WHERE r."menuScannedAt" IS NULL
  AND r."demoPartnerId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "menu_items" m WHERE m."restaurantId" = r.id);
