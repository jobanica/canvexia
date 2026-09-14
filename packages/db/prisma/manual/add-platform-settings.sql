-- Platform settings (subscription billing provider + encrypted credentials).
-- Super-admin only. Run in the Supabase SQL editor. Safe to re-run.
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "billingProvider" TEXT,
  "xenditCredsEnc" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Super-admin only (mirrors platform_admins).
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "platform_settings";
CREATE POLICY super_only ON "platform_settings" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
