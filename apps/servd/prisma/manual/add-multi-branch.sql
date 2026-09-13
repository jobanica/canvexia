-- One login, several branches.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- An owner with more than one shop wants to manage them all from one account
-- and swap between them in the dashboard. Each branch stays a full, separate
-- restaurant — its own menu, orders, staff, takings and unlocks — and what
-- makes them one account is simply that the same login is staff at each.
--
-- The only thing standing in the way was a GLOBAL unique index on
-- staff_users.authUserId, which allowed a login to belong to exactly one
-- restaurant. It becomes unique PER RESTAURANT: still impossible to hold two
-- roles in the same shop, now possible to hold one in each of several.
--
-- Nothing is deleted and no data moves. An account with one branch behaves
-- exactly as it did.

BEGIN;

-- The old global constraint. Named by Prisma's convention; the DO block also
-- catches an index created under any other name on the same single column.
ALTER TABLE "staff_users" DROP CONSTRAINT IF EXISTS "staff_users_authUserId_key";
DROP INDEX IF EXISTS "staff_users_authUserId_key";

DO $$
DECLARE idx TEXT;
BEGIN
  FOR idx IN
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    WHERE t.relname = 'staff_users'
      AND x.indisunique
      AND x.indnatts = 1
      AND (SELECT attname FROM pg_attribute
           WHERE attrelid = t.oid AND attnum = x.indkey[0]) = 'authUserId'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx);
  END LOOP;
END $$;

-- One membership per person per restaurant.
CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_restaurantId_authUserId_key"
  ON "staff_users" ("restaurantId", "authUserId");

-- Every request resolves the session from this column, and it is no longer
-- backed by the unique index that used to serve those lookups.
CREATE INDEX IF NOT EXISTS "staff_users_authUserId_idx"
  ON "staff_users" ("authUserId");

COMMIT;

-- ---------------------------------------------------------------------------
-- Check it. Expect global_unique_gone = t and both new indexes = t.
-- ---------------------------------------------------------------------------
SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_index x
    JOIN pg_class t ON t.oid = x.indrelid
    WHERE t.relname = 'staff_users' AND x.indisunique AND x.indnatts = 1
      AND (SELECT attname FROM pg_attribute
           WHERE attrelid = t.oid AND attnum = x.indkey[0]) = 'authUserId'
  ) AS global_unique_gone,
  -- pg_indexes, NOT to_regclass. to_regclass parses its argument as an SQL
  -- identifier, so an unquoted mixed-case name is folded to lower case and
  -- never matches an index created with quotes — it reports a perfectly good
  -- index as missing, which is worse than not checking at all.
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'staff_users'
          AND indexname = 'staff_users_restaurantId_authUserId_key') AS per_restaurant_unique,
  EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'staff_users'
          AND indexname = 'staff_users_authUserId_idx')              AS lookup_index;
