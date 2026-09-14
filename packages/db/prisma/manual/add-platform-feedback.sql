-- Feedback from restaurant owners about the SaaS, for the super-admin.
-- Run in the Supabase SQL editor. Safe to re-run. Platform-level (super-admin only).
CREATE TABLE IF NOT EXISTS "platform_feedback" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT,
  "restaurantName" TEXT,
  "authorEmail" TEXT,
  "rating" INTEGER,
  "message" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "platform_feedback_createdAt_idx" ON "platform_feedback"("createdAt");

ALTER TABLE "platform_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_feedback" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "platform_feedback";
CREATE POLICY super_only ON "platform_feedback" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
