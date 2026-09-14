-- CANVEXIA Phase 2 — the price floor a partner may not sell below.
--
-- Run in the Supabase SQL editor. Idempotent.
--
-- Defaults to 0, meaning "no floor", and that default is the point: applying a
-- floor retroactively would make prices that are already being charged invalid,
-- and the first thing anyone would notice is a plan edit refusing to save for a
-- reason nobody set. HQ raises each floor deliberately, per plan.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "priceFloor" INTEGER NOT NULL DEFAULT 0;

-- Expect one row, true.
SELECT 'plans.priceFloor' AS column,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'plans' AND column_name = 'priceFloor') AS present;
