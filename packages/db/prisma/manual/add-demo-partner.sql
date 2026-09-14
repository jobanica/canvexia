-- Let partners create demo storefronts to pitch prospects. Tags a demo tenant
-- with the owning partner. Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "demoPartnerId" TEXT;
CREATE INDEX IF NOT EXISTS "restaurants_demoPartnerId_idx" ON "restaurants"("demoPartnerId");
