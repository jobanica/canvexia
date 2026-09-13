-- Partner onboarding/training video (YouTube/Vimeo link or direct video URL)
-- shown on the partner dashboard. Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "program_settings" ADD COLUMN IF NOT EXISTS "partnerTrainingUrl" TEXT;
