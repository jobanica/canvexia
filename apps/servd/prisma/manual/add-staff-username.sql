-- Username login: super-admin creates a business by name + username (no email);
-- the owner sets their email later from the dashboard. Run in the Supabase SQL
-- editor. Idempotent.
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_username_key" ON "staff_users" ("username");
