-- A manual "stop taking online orders" switch, for when the kitchen is buried.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Distinct from pauseWhenClosed, which is automatic and follows opening hours.
-- This one is the owner deciding right now, regardless of the clock, and it
-- stays off until they turn it back on by hand — a busy-switch that un-pauses
-- itself at some point the owner didn't choose is worse than no switch.
--
-- Nullable, no default: a DEFAULT would be sent by Prisma on every insert and
-- break saving storefront settings on a database that hasn't run this yet.
-- NULL reads as "not paused", which is how every existing shop should read.

ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "ordersPaused" BOOLEAN;

-- Check it. Expect column_exists = t.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'storefront_settings' AND column_name = 'ordersPaused'
) AS column_exists;
