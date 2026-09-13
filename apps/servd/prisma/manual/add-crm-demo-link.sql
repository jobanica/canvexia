-- Link a CRM client to the demo storefront created for it, so the pipeline can
-- show "demo ready" and jump to it. Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "demoRestaurantId" TEXT;
