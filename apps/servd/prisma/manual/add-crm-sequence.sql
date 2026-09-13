-- Editable CRM follow-up messages. Stores the owner's custom sequence (message
-- text, label, wait days per step) as JSON on the single platform_settings row.
-- Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "crmSequence" JSONB;
