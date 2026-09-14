-- Re-grant table privileges to app_user.
--
-- THE BUG THIS FIXES: a menu item's food cost silently reset to 0.00 on save.
--
-- full-schema-sync.sql turns RLS on (and FORCE) for the newer tenant tables —
-- menu_item_costs, promotions, expenses, storefront_settings and friends — but
-- it contains no GRANT at all. rls.sql does the granting, and its
--   grant ... on all tables in schema public to app_user
-- only covers the tables that existed WHEN IT RAN. Any table created by a
-- later sync therefore ends up with row-level security forced on it and
-- app_user holding no privileges, so every insert and update is refused.
--
-- The application swallowed that refusal, which is why it looked like the
-- value simply wouldn't stick. That silent catch is fixed in the app; this
-- repairs the database.
--
-- Safe to run any time, as often as you like. It grants nothing that rls.sql
-- doesn't already intend, and RLS still constrains every row: a grant says
-- "you may touch this table", the policy still decides which rows.
--
-- Run in the Supabase SQL editor as the owner (postgres).

-- Everything that exists right now.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- And anything created from here on, so the same gap can't reopen the next
-- time a migration adds a table. Set for BOTH the role running this and the
-- postgres owner, since a table inherits the default privileges of whoever
-- created it — that mismatch is the whole cause of this bug.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
       || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
       || 'GRANT USAGE, SELECT ON SEQUENCES TO app_user';
EXCEPTION WHEN OTHERS THEN
  -- Not the owner of that role on this database; the blanket grants above
  -- still repair everything that exists today.
  NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Check it worked. Should return zero rows.
-- Any row listed here is a table with RLS forced on and no privileges granted
-- — i.e. one the app can read or write nothing from.
-- ---------------------------------------------------------------------------
SELECT c.relname AS table_without_grants
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT has_table_privilege('app_user', c.oid, 'INSERT')
ORDER BY 1;
