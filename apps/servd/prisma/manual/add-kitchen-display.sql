-- Kitchen routing: display vs printed kitchen tickets. Run in the Supabase SQL
-- editor. Safe to re-run.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "kitchenDisplay" BOOLEAN NOT NULL DEFAULT true;
