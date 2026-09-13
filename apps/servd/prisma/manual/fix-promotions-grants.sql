-- Fixes "42501: permission denied for table promotions".
--
-- The app connects as the non-privileged `app_user` role (see prisma/rls.sql)
-- that tenantDb() switches to. `grant ... on all tables` only covers tables
-- that existed when rls.sql was last run, so any table created afterwards
-- (here: promotions) is missing the grant. This re-grants it and re-asserts
-- the tenant-isolation RLS policy. Idempotent — safe to re-run.

-- 1) Table privileges for the app role.
GRANT SELECT, INSERT, UPDATE, DELETE ON "promotions" TO app_user;

-- 2) Row-Level Security + per-restaurant isolation (matches rls.sql).
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "promotions";
CREATE POLICY tenant_isolation ON "promotions"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
