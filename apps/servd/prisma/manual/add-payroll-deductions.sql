-- One-off payroll deductions entered by hand (cash advance, loan, uniform…).
-- Applied to whichever payroll period "appliedOn" falls in. Idempotent.
CREATE TABLE IF NOT EXISTS "payroll_deductions" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "label"        TEXT NOT NULL,
  "amount"       INTEGER NOT NULL,
  "appliedOn"    TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_deductions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_deductions_restaurantId_appliedOn_idx"
  ON "payroll_deductions" ("restaurantId", "appliedOn");
CREATE INDEX IF NOT EXISTS "payroll_deductions_employeeId_idx"
  ON "payroll_deductions" ("employeeId");

DO $$ BEGIN
  ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "payroll_deductions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_deductions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payroll_deductions";
CREATE POLICY tenant_isolation ON "payroll_deductions"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "payroll_deductions" TO app_user;
