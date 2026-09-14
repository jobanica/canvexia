-- Configurable withholding % for partner payout statements (PH reporting).
-- Not tax advice — 0 by default; an accountant confirms the correct rate.
-- Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "withholdingPct" INTEGER NOT NULL DEFAULT 0;
