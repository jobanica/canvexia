-- CANVEXIA HQ Admin: the FIRST HQ seat.
--
-- Run AFTER add-hq-admin.sql, in the Supabase SQL editor. Idempotent.
--
-- ============================================================================
-- STEP 1 — CREATE THE PERSON IN SUPABASE FIRST
--
--   Dashboard → Authentication → Users → "Add user" → "Create new user"
--     Email:            the address they will sign in with
--     Password:         set one they choose, or tick "auto-generate"
--     Auto Confirm User: TICK IT. Without it they cannot sign in until they
--                       click a confirmation email, and this project's own
--                       email sending is not configured.
--
--   Then copy the User UID from the row it creates. It looks like
--   f584cb60-50b4-48f2-b53e-3a9b9dfb5974.
--
-- STEP 2 — FILL IN THE TWO VALUES BELOW AND RUN THIS FILE.
-- ============================================================================
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS A HAND-RUN FILE AND NOT A SCREEN
--
-- `platform_admins` starts empty, so nobody can sign into /hq — which means
-- nobody can use /hq/team to add the person who could. That is the ordinary
-- shape of a bootstrap, and the honest answer is one deliberate insert run by
-- the founder rather than a "create the first admin" route.
--
-- There is no such route in this codebase and there should not be one: a
-- self-service first-admin endpoint is a race, and whoever finds it first
-- between deploy and bootstrap owns the platform.
--
-- The same two steps are what /hq/team does for every seat after this one — it
-- creates the HQ record, not the Supabase login, for the same reason: minting
-- passwords from the service-role key is not a thing this codebase does.
-- ----------------------------------------------------------------------------

WITH input AS (
  SELECT
    -- ↓↓↓ PASTE THE USER UID FROM STEP 1 ↓↓↓
    '00000000-0000-0000-0000-000000000000'::text AS auth_user_id,
    -- ↓↓↓ AND THEIR EMAIL ↓↓↓
    'you@example.com'::text                      AS email,
    -- Shown in the HQ top bar. Anything you like.
    'CANVEXIA HQ'::text                          AS display_name
)
INSERT INTO "platform_admins" ("id", "authUserId", "email", "displayName", "role", "status", "createdAt")
SELECT
  gen_random_uuid()::text,
  i.auth_user_id,
  lower(btrim(i.email)),
  i.display_name,
  -- NULL means super_admin. Not an oversight: every HQ row that predates the
  -- role column has NULL there, and `parseHqRole` in packages/core is the one
  -- place that knows. This is the founder's seat; every seat after it is
  -- created from /hq/team with an explicit role.
  NULL,
  'active',
  CURRENT_TIMESTAMP
FROM input i
-- Refuses the placeholder rather than creating a seat nobody can sign in as.
WHERE i.auth_user_id <> '00000000-0000-0000-0000-000000000000'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = i.auth_user_id)
ON CONFLICT ("authUserId") DO UPDATE
  SET "status" = 'active',
      "deactivatedAt" = NULL,
      "email" = EXCLUDED."email";

-- ----------------------------------------------------------------------------
-- VERIFY. Expect one row per HQ seat, role NULL (= super admin), status active.
--
-- If this returns NOTHING, the insert above was skipped — which means either
-- the UID is still the placeholder, or no auth.users row has that id. Check
-- you copied the User UID and not the email or the identity id.
-- ----------------------------------------------------------------------------
SELECT a."email",
       COALESCE(a."role", 'super_admin') AS role,
       a."status",
       u."email" AS supabase_email,
       (u."email_confirmed_at" IS NOT NULL) AS confirmed
  FROM "platform_admins" a
  LEFT JOIN auth.users u ON u.id::text = a."authUserId"
 ORDER BY a."createdAt";
