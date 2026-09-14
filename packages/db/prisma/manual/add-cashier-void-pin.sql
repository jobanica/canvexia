-- Adds the cashier void PIN (required to void an unpaid order). Run in the
-- Supabase SQL editor. Safe to re-run.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "cashierVoidPin" TEXT;
