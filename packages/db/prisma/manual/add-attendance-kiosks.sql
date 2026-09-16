-- Partner Portal A7.4 patch: QR clock-in.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- Every column added to an existing table is nullable or database-defaulted:
-- these tables have production rows, and a plain Prisma default is written into
-- the INSERT of every create() in the codebase, which breaks creates on a
-- database that has not run this file yet.

-- ----------------------------------------------------------------------------
-- 1. The kiosks.
--
-- A PER-KIOSK SECRET, not one signing key in an env var. Revoking a kiosk whose
-- screen was photographed, or whose tablet walked off, is then a row update by
-- the operator — `active = false`, or a new secret — rather than an env change
-- that invalidates every kiosk belonging to every partner and needs a deploy.
--
-- The secret is 32 random bytes, hex. It is NEVER sent to a browser except the
-- kiosk display itself, and never to the phone doing the scanning: the phone
-- posts the code it read, and the server is what verifies it.
--
-- lat/lng are nullable because a kiosk is often a tablet on a counter that
-- nobody has geocoded. When they are set, a QR check-in still records how far
-- away the phone was — the QR proves presence at the device, the GPS is the
-- corroboration, and the brief asks for both.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "attendance_kiosks" (
  "id"        TEXT PRIMARY KEY,
  "partnerId" TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  "label"     TEXT NOT NULL,
  "lat"       DOUBLE PRECISION,
  "lng"       DOUBLE PRECISION,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  /* 32 random bytes as hex. Rotated by replacing this value. */
  "secret"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "attendance_kiosks_partnerId_idx"
  ON "attendance_kiosks" ("partnerId");

-- ----------------------------------------------------------------------------
-- 2. How a session was clocked in.
--
-- `method` DEFAULTS TO 'gps' and is NOT NULL: every existing row was a GPS
-- check-in, which is the truth about them, and a nullable column would make the
-- manager's filter have to say "or unknown" forever.
--
-- `kioskId` deliberately has NO foreign key. A deleted kiosk must not cascade
-- into somebody's attendance history, and an attendance row that names a kiosk
-- which no longer exists is still the correct record of what happened.
-- ----------------------------------------------------------------------------
ALTER TABLE "attendance_sessions"
  ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT 'gps';
ALTER TABLE "attendance_sessions"
  ADD COLUMN IF NOT EXISTS "kioskId" TEXT;
ALTER TABLE "attendance_sessions"
  ADD COLUMN IF NOT EXISTS "checkOutMethod" TEXT;
ALTER TABLE "attendance_sessions"
  ADD COLUMN IF NOT EXISTS "checkOutKioskId" TEXT;

ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "attendance_sessions_method_check";
ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_method_check"
  CHECK ("method" IN ('gps', 'qr'));

ALTER TABLE "attendance_sessions" DROP CONSTRAINT IF EXISTS "attendance_sessions_checkout_method_check";
ALTER TABLE "attendance_sessions"
  ADD CONSTRAINT "attendance_sessions_checkout_method_check"
  CHECK ("checkOutMethod" IS NULL OR "checkOutMethod" IN ('gps', 'qr'));

-- ----------------------------------------------------------------------------
-- 3. Seats that must use a kiosk.
--
-- DEFAULT FALSE, and it has to be: turning this on for everybody at once would
-- lock out every field salesperson who has no kiosk to stand in front of. It is
-- a per-seat rule for office staff, set by an admin.
-- ----------------------------------------------------------------------------
ALTER TABLE "partner_users"
  ADD COLUMN IF NOT EXISTS "kioskRequired" BOOLEAN NOT NULL DEFAULT false;
