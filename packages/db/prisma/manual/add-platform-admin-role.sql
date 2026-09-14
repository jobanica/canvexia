-- Scoped back-office roles. Run in the Supabase SQL editor. Safe to re-run.
--
-- /super-admin used to be one binary door: hold a platform_admins row and you
-- could change what Servd charges, read every restaurant's data, and email all
-- of them. That is right for the founder and wrong for somebody hired to work
-- the pipeline.
--
-- NULL means full access, so every admin that already exists keeps exactly
-- what they have and no data migration is needed. Only a row that explicitly
-- says 'ops' is restricted.
--
-- Nullable with NO default, like every other column added this way: a default
-- is a value Prisma writes into the INSERT of every admin row, and it would
-- break creating one on a database that hasn't run this file.

ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "role" TEXT;

-- ---------------------------------------------------- creating an ops admin
-- Use the script, which goes through the Supabase Auth API:
--
--   npm run user:create -- superadmin ops@servdph.com 'the-password' ops
--
-- Do NOT hand-write the auth.users row unless you have to. GoTrue reads
-- confirmation_token, recovery_token, email_change, email_change_token_new,
-- email_change_token_current, phone_change, phone_change_token and
-- reauthentication_token into a type that cannot hold NULL, so a row inserted
-- with NULLs there fails login as "invalid credentials" even though the
-- password hash is perfectly good and verifies in SQL. They must be ''.
-- If you have already made that mistake:
--
--   UPDATE auth.users SET
--     confirmation_token = coalesce(confirmation_token, ''),
--     recovery_token = coalesce(recovery_token, ''),
--     email_change = coalesce(email_change, ''),
--     email_change_token_new = coalesce(email_change_token_new, ''),
--     email_change_token_current = coalesce(email_change_token_current, ''),
--     phone_change = coalesce(phone_change, ''),
--     phone_change_token = coalesce(phone_change_token, ''),
--     reauthentication_token = coalesce(reauthentication_token, '')
--   WHERE lower(email) = 'the-address';

-- Check it. Expect true.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'role'
) AS role_column;

-- Who has what. NULL role = full access.
SELECT "email", coalesce("role", 'owner (full access)') AS scope, "createdAt"
FROM "platform_admins" ORDER BY "createdAt";
