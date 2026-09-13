-- Optional tipping at online checkout. Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tipAmount" INTEGER NOT NULL DEFAULT 0;
