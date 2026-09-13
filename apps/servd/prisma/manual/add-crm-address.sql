-- CRM clients: business address (filled manually or auto-filled from a Facebook
-- page). Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "address" TEXT;
