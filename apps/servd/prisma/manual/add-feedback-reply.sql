-- Replying to a restaurant owner's feedback.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Owners could send feedback from their dashboard and the Servd team could
-- only mark it resolved — there was no way to answer. These three columns hold
-- the answer, when it was sent, and when the owner read it.
--
-- All nullable, NO defaults. A default is a value Prisma writes into the
-- INSERT of every feedback row, which would break sending feedback on a
-- database that hasn't run this file. NULL means "not answered yet", which is
-- true of every message sent so far.

ALTER TABLE "platform_feedback" ADD COLUMN IF NOT EXISTS "reply"       TEXT;
ALTER TABLE "platform_feedback" ADD COLUMN IF NOT EXISTS "repliedAt"   TIMESTAMP(3);
ALTER TABLE "platform_feedback" ADD COLUMN IF NOT EXISTS "replyReadAt" TIMESTAMP(3);

-- The owner's dashboard looks up its own restaurant's feedback on every load.
CREATE INDEX IF NOT EXISTS "platform_feedback_restaurantId_idx"
  ON "platform_feedback" ("restaurantId");

-- Check it. Expect all four true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='platform_feedback' AND column_name='reply')       AS reply_column,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='platform_feedback' AND column_name='repliedAt')   AS replied_at_column,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
          AND table_name='platform_feedback' AND column_name='replyReadAt') AS read_at_column,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
          AND indexname='platform_feedback_restaurantId_idx')               AS restaurant_index;
