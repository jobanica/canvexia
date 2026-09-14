-- ALL PENDING MIGRATIONS, IN ONE PASTE.
--
-- Run this in the Supabase SQL editor. Safe to re-run — every statement is
-- IF NOT EXISTS, so running it twice does nothing the second time.
--
-- Why this exists: three columns were added to the Prisma schema and shipped
-- before their SQL was run. Prisma reads back every column a model declares,
-- so a database missing any one of them fails on writes that have nothing to
-- do with the new feature — which is why saving storefront settings started
-- erroring. Running this makes all three exist and the errors stop.
--
-- Nothing here changes existing data. Three nullable columns and one index.

-- 1. Extra rounds: a served table orders more, and the kitchen ticket has to
--    come back with a badge saying these are extras.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "addedItemsAt" TIMESTAMP(3);

-- 2. Auto-accept: take an online order by itself when nobody answers it.
--    NULL = off, which is how every shop behaves until it's switched on.
ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "autoAcceptSeconds" INTEGER;

-- 3. Web address changes: keep the old address working so the QR codes
--    already printed and stuck to tables don't turn into 404s.
ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "previousSlug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_previousSlug_key"
  ON "restaurants" ("previousSlug")
  WHERE "previousSlug" IS NOT NULL;

-- Check it. Expect all four to be true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='orders'
            AND column_name='addedItemsAt')            AS orders_added_items_at,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='storefront_settings'
            AND column_name='autoAcceptSeconds')       AS storefront_auto_accept,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='restaurants'
            AND column_name='previousSlug')            AS restaurants_previous_slug,
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname='public'
            AND indexname='restaurants_previousSlug_key') AS previous_slug_index;
