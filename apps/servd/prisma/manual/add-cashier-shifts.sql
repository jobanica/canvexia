-- Per-cashier shift sessions.
--
-- Before this, the end-of-shift summary totalled every payment for the whole
-- Manila calendar day, restaurant-wide — so the second cashier of the day saw
-- the first cashier's takings in their own Z-report, and separate logins bought
-- you nothing. Payments now carry WHO took them and during WHICH shift.
--
-- The floor stays shared on purpose: any cashier can still settle any table.
-- Hiding another cashier's tables would strand a customer the moment the person
-- who served them went on break.
--
-- Run in the Supabase SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS "cashier_shifts" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "restaurantId" TEXT NOT NULL,
  "staffUserId"  TEXT NOT NULL,
  -- Snapshot: a renamed or deleted login keeps its Z-report intact.
  "staffName"    TEXT NOT NULL,
  "openedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "closedAt"     TIMESTAMPTZ,
  "status"       TEXT NOT NULL DEFAULT 'open', -- open | closed
  "closedReason" TEXT                          -- ended | auto_end_of_day
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cashier_shifts_restaurantId_fkey'
  ) THEN
    ALTER TABLE "cashier_shifts"
      ADD CONSTRAINT "cashier_shifts_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- ONE open shift per cashier, enforced by the database rather than by the code
-- remembering. Two tabs, or a double-tap on "End shift", cannot produce two
-- open shifts that split one cashier's takings in half.
CREATE UNIQUE INDEX IF NOT EXISTS "cashier_shifts_one_open_per_staff"
  ON "cashier_shifts" ("restaurantId", "staffUserId")
  WHERE "status" = 'open';

CREATE INDEX IF NOT EXISTS "cashier_shifts_restaurantId_status_idx"
  ON "cashier_shifts" ("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "cashier_shifts_lookup_idx"
  ON "cashier_shifts" ("restaurantId", "staffUserId", "openedAt");

-- Who took the money, and on whose shift.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "staffUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "shiftId"     TEXT;
CREATE INDEX IF NOT EXISTS "payments_shiftId_idx" ON "payments" ("shiftId");

ALTER TABLE "cash_movements"
  ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
CREATE INDEX IF NOT EXISTS "cash_movements_shiftId_idx" ON "cash_movements" ("shiftId");

-- Who rang the order up. Attribution only — it does NOT restrict who can settle.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "openedByStaffId" TEXT,
  ADD COLUMN IF NOT EXISTS "openedByName"    TEXT;

-- Tenant-scoped, same as orders and payments.
ALTER TABLE "cashier_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cashier_shifts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cashier_shifts";
CREATE POLICY tenant_isolation ON "cashier_shifts"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "cashier_shifts" TO app_user;
