-- Tags voided orders so they show in the cashier's "Voided today" list,
-- distinct from declined incoming orders. Run in the Supabase SQL editor.
-- Safe to re-run.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
