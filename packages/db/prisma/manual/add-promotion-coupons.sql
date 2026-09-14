-- Adds coupon-code + discount fields to promotions so customers can redeem a
-- promo at checkout with a customizable code. Run in the Supabase SQL editor.
-- Safe to re-run.
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "value" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "freeItemId" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "minSpend" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "promotions_restaurantId_code_idx" ON "promotions" ("restaurantId", "code");
