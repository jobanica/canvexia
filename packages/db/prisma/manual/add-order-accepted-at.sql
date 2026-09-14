-- Prep countdown: when an order was accepted, so prepMinutes has a start point.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- The merchant picks "20 minutes" on accept. That was stored, but the moment
-- it counts down FROM never was, so the screen could only show a static "~20m".
-- This is that moment.
--
-- One nullable column, NO default. A default is a value Prisma writes into the
-- INSERT of every order, which would break order creation on a database that
-- hasn't run this file. NULL means the acceptance time isn't known - true of
-- every order accepted before this - and the screen then shows no countdown
-- rather than inventing one.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);

-- Check it. Expect true.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'acceptedAt'
) AS accepted_at_column;
