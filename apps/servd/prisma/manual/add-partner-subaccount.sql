-- CANVEXIA Phase 4a — a partner's gateway sub-account.
--
-- Run in the Supabase SQL editor. Idempotent.
--
-- An identifier, not a secret. Under D5 (Option B) CANVEXIA holds the only
-- gateway credential and names this sub-account when acting for a partner, so
-- there is nothing to encrypt here and no per-partner key to rotate.
--
-- Null until the partner is onboarded with the gateway.

ALTER TABLE "partners" ADD COLUMN IF NOT EXISTS "gatewaySubAccountId" TEXT;

-- Expect one row, true.
SELECT 'partners.gatewaySubAccountId' AS column,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'partners' AND column_name = 'gatewaySubAccountId') AS present;
