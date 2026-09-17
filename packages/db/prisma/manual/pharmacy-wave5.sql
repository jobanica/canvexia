-- ============================================================================
-- RESCETA, WAVE 5 — employees, attendance, leave.
--
-- Staff and employees are two different things and the split is deliberate.
-- `pharmacy_staff` is a LOGIN: who may sign in and what they may do. An
-- employee is a PERSON ON THE PAYROLL, who may have no login at all (a
-- delivery rider, a cleaner) and whose record carries a pay rate that has no
-- business sitting next to an authentication row.
--
-- The link is optional and one-way: an employee may name a staff row, which is
-- how clocking in from the app knows who is clocking.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PharmacyPayType" AS ENUM ('hourly', 'daily', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyLeaveKind" AS ENUM ('vacation', 'sick', 'emergency', 'unpaid', 'maternity', 'paternity');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyLeaveStatus" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyAttendanceKind" AS ENUM ('clock_in', 'clock_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pharmacy_employees" (
  "id"              TEXT NOT NULL,
  "pharmacyId"      TEXT NOT NULL,
  -- The login, if they have one. Optional: a rider on the payroll never signs
  -- into the till.
  "staffId"         TEXT,
  "fullName"        TEXT NOT NULL,
  "position"        TEXT,
  "email"           TEXT,
  "phone"           TEXT,
  "payType"         "PharmacyPayType" NOT NULL DEFAULT 'monthly',
  "payRateCentavos" BIGINT NOT NULL DEFAULT 0,
  -- Minutes past midnight, Manila. Stored as an integer rather than a `time`
  -- so the lateness arithmetic is one subtraction and has no timezone in it.
  "workStartMinute" INTEGER NOT NULL DEFAULT 540,
  "hoursPerDay"     INTEGER NOT NULL DEFAULT 8,
  -- Minutes of lateness that do not count as late. A real policy, and one that
  -- has to be recorded or every payroll argument is about what it was.
  "graceMinutes"    INTEGER NOT NULL DEFAULT 0,
  "hireDate"        TIMESTAMP(3),
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_employees_pkey" PRIMARY KEY ("id")
);

-- APPEND-ONLY, like the stock ledger. A punch is never edited or deleted: a
-- correction is another punch, and the pair is the record. Editing one is how a
-- payroll dispute becomes unanswerable.
CREATE TABLE IF NOT EXISTS "pharmacy_attendance" (
  "id"         TEXT NOT NULL,
  "pharmacyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "kind"       "PharmacyAttendanceKind" NOT NULL,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_attendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pharmacy_leave_requests" (
  "id"                 TEXT NOT NULL,
  "pharmacyId"         TEXT NOT NULL,
  "employeeId"         TEXT NOT NULL,
  "leaveType"          "PharmacyLeaveKind" NOT NULL DEFAULT 'vacation',
  "startDate"          TIMESTAMP(3) NOT NULL,
  "endDate"            TIMESTAMP(3) NOT NULL,
  "reason"             TEXT,
  "status"             "PharmacyLeaveStatus" NOT NULL DEFAULT 'pending',
  "reviewedByStaffId"  TEXT,
  "reviewedAt"         TIMESTAMP(3),
  "reviewNote"         TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pharmacy_employees_pharmacyId_idx" ON "pharmacy_employees"("pharmacyId");
CREATE INDEX IF NOT EXISTS "pharmacy_employees_staffId_idx" ON "pharmacy_employees"("staffId");
CREATE INDEX IF NOT EXISTS "pharmacy_attendance_pharmacyId_idx" ON "pharmacy_attendance"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_attendance_employeeId_idx" ON "pharmacy_attendance"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_leave_requests_pharmacyId_idx" ON "pharmacy_leave_requests"("pharmacyId", "startDate");
CREATE INDEX IF NOT EXISTS "pharmacy_leave_requests_employeeId_idx" ON "pharmacy_leave_requests"("employeeId");

DO $$ BEGIN
  ALTER TABLE "pharmacy_employees" ADD CONSTRAINT "pharmacy_employees_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- SET NULL, not CASCADE: offboarding a login must not delete the employment
  -- record it was attached to. The payroll history outlives the account.
  ALTER TABLE "pharmacy_employees" ADD CONSTRAINT "pharmacy_employees_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "pharmacy_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_attendance" ADD CONSTRAINT "pharmacy_attendance_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_attendance" ADD CONSTRAINT "pharmacy_attendance_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "pharmacy_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_leave_requests" ADD CONSTRAINT "pharmacy_leave_requests_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_leave_requests" ADD CONSTRAINT "pharmacy_leave_requests_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "pharmacy_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
