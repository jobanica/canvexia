-- Let an owner correct their web address without breaking printed QR codes.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- A slug is baked into the URL on every table tent in the building and every
-- link the shop has ever posted. When the owner corrects a typo, the old
-- address has to keep resolving or all of that quietly stops working — so the
-- previous one is kept here and the public lookup falls back to it.
--
-- One nullable column, NO default. A default is a value Prisma writes into the
-- INSERT of every restaurant, which would break account creation on a database
-- that hasn't run this file. NULL means "this shop has never changed its
-- address", which is true of almost all of them.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "previousSlug" TEXT;

-- Unique so two shops can't both claim the same old address. Partial, because
-- NULL is the normal case and a plain unique index would be fine but this says
-- what is meant: only real values are constrained.
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_previousSlug_key"
  ON "restaurants" ("previousSlug")
  WHERE "previousSlug" IS NOT NULL;

-- Check it. Expect both true.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurants' AND column_name = 'previousSlug'
  ) AS previous_slug_column,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'restaurants_previousSlug_key'
  ) AS previous_slug_index;
