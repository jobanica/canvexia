-- Mark a single modifier option out of stock ("86 the add-on") without deleting
-- it: the option stays configured but shows as sold out to diners and is
-- rejected server-side if someone tries to order it anyway.
-- Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "modifiers"
  ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;
