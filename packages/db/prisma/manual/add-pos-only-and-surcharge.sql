-- Counter-only menu items, and the card surcharge.
--
-- Two unrelated features in one file because they're going out together and a
-- shorter list of files to run by hand is a list that actually gets run.
--
-- Everything else these features need — which receipt lines print, whether the
-- kitchen screen shows the address, the surcharge rate itself — lives in the
-- printerConfig JSON column, which already exists. Only the two things that
-- have to be per-row need real columns.
--
-- Run in the Supabase SQL editor. Idempotent; safe to run twice.

-- 1. Counter-only menu items.
--    Nullable, no DEFAULT. A defaulted column would be written into the INSERT
--    of every menu item by Prisma, which breaks item creation on any database
--    that hasn't run this file yet. Null reads as false.
ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "posOnly" BOOLEAN;

-- The storefront menu filters on this on every page load, and it is a tiny
-- minority of rows, so index only the ones that are actually set.
CREATE INDEX IF NOT EXISTS "menu_items_posOnly_idx"
  ON "menu_items" ("restaurantId")
  WHERE "posOnly" IS TRUE;

-- 2. The card surcharge, as charged, per order.
--    Snapshotted rather than recomputed from the current rate: change the rate
--    next month and last month's receipts must still add up.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "surchargeAmount" INTEGER,
  ADD COLUMN IF NOT EXISTS "surchargeLabel"  TEXT;

-- ---------------------------------------------------------------------------
-- Check it.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'menu_items' AND column_name = 'posOnly')          AS pos_only_column,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'surchargeAmount')      AS surcharge_column,
  (SELECT count(*) FROM "menu_items" WHERE "posOnly" IS TRUE)              AS counter_only_items;
