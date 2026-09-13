-- Extra rounds: a table that has already been served orders more.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- One nullable column, NO default. A default is a value Prisma puts into the
-- INSERT of every order, which breaks order creation on any database that
-- hasn't run this file yet. Null means "no extras have been added", which is
-- how every order behaved before this existed.
--
-- Everything that reads or writes it does so best-effort in its own query, so
-- a database without this column keeps taking orders exactly as before — the
-- kitchen just doesn't get the "extra order" badge.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "addedItemsAt" TIMESTAMP(3);

-- Check it. Expect true.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'addedItemsAt'
) AS added_items_column;
