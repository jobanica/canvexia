-- Super-admin "create by business name" + location + owner claim flow.
-- Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "businessAddress" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "claimToken" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_claimToken_key" ON "restaurants" ("claimToken");
