-- Auto-accept: take an online order by itself when nobody answers it.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- One nullable column, NO default. A default is a value Prisma puts into the
-- INSERT of every storefront_settings row, which would break saving storefront
-- settings on any database that hasn't run this file yet. NULL means off,
-- which is how every shop behaves until somebody turns it on — so a database
-- without this column simply never auto-accepts, and nothing else changes.

ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "autoAcceptSeconds" INTEGER;

-- Check it. Expect true.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'storefront_settings'
    AND column_name = 'autoAcceptSeconds'
) AS auto_accept_column;
