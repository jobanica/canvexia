-- Web Push subscriptions for merchant devices. Lets a new online order alert the
-- phone even when the Incoming Orders app is minimized/closed. Run in the
-- Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "endpoint"     TEXT NOT NULL,
  "p256dh"       TEXT NOT NULL,
  "auth"         TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_restaurantId_idx" ON "push_subscriptions" ("restaurantId");

DO $$ BEGIN
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "push_subscriptions";
CREATE POLICY tenant_isolation ON "push_subscriptions"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "push_subscriptions" TO app_user;
