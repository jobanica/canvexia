-- ============================================================================
-- READ-ONLY. "Am I even in the right database?"
-- ============================================================================
--
-- Run this FIRST, before any migration, whenever a script reports that a table
-- you know exists doesn't. `restaurants` is the core table of the whole app —
-- if that one is missing, the connection is pointed somewhere else, and running
-- a migration would build Servd's tables inside the wrong project.
--
-- Nothing here writes. Read the three answers in order.
-- ============================================================================

-- 1. Which database, which schema, and what's on the search path.
SELECT current_database()                AS database,
       current_schema()                  AS default_schema,
       current_setting('search_path')    AS search_path,
       current_user                      AS connected_as;

-- 2. Where do Servd's core tables actually live? Each row names the schema
--    holding it.
--      no rows           → wrong database/project entirely
--      rows, not 'public'→ right database, wrong search_path: qualify the name
--                          (e.g. myschema.restaurants) or SET search_path
--      rows in 'public'  → you're in the right place; the earlier error came
--                          from something else
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name IN ('restaurants', 'orders', 'staff_users', 'menu_items', 'partners')
ORDER BY table_schema, table_name;

-- 3. Every non-system schema that has any tables in it, with a count. On the
--    right database you'll see 'public' with dozens.
SELECT table_schema, count(*) AS tables
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
GROUP BY table_schema
ORDER BY tables DESC;
