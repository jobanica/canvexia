-- CRM "Revisit in 30 days" bucket. A prospect with no reply after the initial
-- message + 3 follow-ups is moved to the "revisit" stage with a revisit date, so
-- the active pipeline stays short. Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "crm_clients" ADD COLUMN IF NOT EXISTS "revisitAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "crm_clients_revisitAt_idx" ON "crm_clients" ("revisitAt");
