-- CANVEXIA HQ Admin, Phase H1: the FIRST HQ seat.
--
-- Run AFTER add-hq-admin.sql. Fill in the two values at the top. Idempotent.
--
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS AS A HAND-RUN FILE
--
-- `platform_admins` has zero rows on this database — checked, not assumed. So
-- nobody can sign into /hq, which means nobody can use /hq/team to invite the
-- person who could. That is not a bug to design around; it is the ordinary
-- shape of a bootstrap, and the honest way to solve it is one deliberate insert
-- run by the founder rather than a "create the first admin" route that stays
-- reachable forever afterwards.
--
-- There is no such route in this codebase and there should not be one. A
-- self-service first-admin endpoint is a race: whoever finds it first between
-- deploy and bootstrap owns the platform.
--
-- ----------------------------------------------------------------------------
-- BEFORE YOU RUN THIS
--
-- 1. The person must already exist as a Supabase auth user. Create them in the
--    Supabase dashboard (Authentication → Users → Add user) or have them sign
--    up; this file does NOT create an auth user and cannot set a password.
-- 2. Copy their UUID from that screen into :hq_auth_user_id below.
-- 3. Their email goes in :hq_email. It is a SNAPSHOT for display and for audit
--    rows — changing it in Supabase later does not update this.
--
-- The role is left NULL, which means super_admin (see the note in
-- add-hq-admin.sql §1). This is the founder's seat. Every seat after it is
-- created from /hq/team with an explicit role.
-- ----------------------------------------------------------------------------

\set hq_auth_user_id '00000000-0000-0000-0000-000000000000'
\set hq_email        'you@example.com'

-- The Supabase SQL editor does not support \set. If you are pasting this there
-- rather than running it through psql, delete the two lines above and replace
-- the two :'...' references below with the literal values in single quotes.

INSERT INTO "platform_admins" ("id", "authUserId", "email", "displayName", "role", "status", "createdAt")
VALUES (
    gen_random_uuid()::text,
    :'hq_auth_user_id',
    :'hq_email',
    'CANVEXIA HQ',
    NULL,          -- NULL = super_admin
    'active',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("authUserId") DO UPDATE
    SET "status" = 'active',
        "deactivatedAt" = NULL;

-- Verify. Expect exactly one row, role NULL, status active.
SELECT "id", "email", "role", "status" FROM "platform_admins";
