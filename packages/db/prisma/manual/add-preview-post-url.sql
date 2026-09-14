-- The Facebook post showing a prospect their preview storefront.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Whoever builds the demo pastes the post link on the storefront's page, and
-- the team that actually messages the customer copies it from there instead of
-- hunting for it in a chat thread.
--
-- Deliberately NOT contactFb. That column is how to REACH the prospect and
-- feeds the follow-up list; a post link there would put a link where a phone
-- number or profile is expected and quietly break chasing them.
--
-- Nullable with NO default, like every column added this way: a default is a
-- value Prisma writes into the INSERT of every restaurant it creates.

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "previewPostUrl" TEXT;

-- Check it. Expect both true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='restaurants'
            AND column_name='previewPostUrl')          AS column_exists,
  (SELECT is_nullable = 'YES' AND column_default IS NULL
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='restaurants'
       AND column_name='previewPostUrl')               AS nullable_no_default;
