-- ============================================================================
-- RESCETA, WAVE 4 — cashier shifts and register readings (X and Z).
--
-- A till that cannot be closed off is a till nobody can reconcile. Until now a
-- pharmacy could ring up sales all day and had no way to say who was on the
-- register, what cash it started with, what it should hold now, or whether the
-- drawer is over or short at the end of it.
--
-- THE Z-READING IS A BIR ARTEFACT, not a report we invented. A registered POS
-- produces a daily Z-reading with a sequential, non-resettable counter, and the
-- VAT breakdown on it is what the monthly return is built from. An X-reading is
-- the same summary taken mid-shift without closing anything off.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PharmacyShiftStatus" AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyReadingType" AS ENUM ('x', 'z');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pharmacy_shifts" (
  "id"                    TEXT NOT NULL,
  "pharmacyId"            TEXT NOT NULL,
  "staffId"               TEXT,
  "status"                "PharmacyShiftStatus" NOT NULL DEFAULT 'open',
  "openingCashCentavos"   INTEGER NOT NULL DEFAULT 0,
  "closingCashCentavos"   INTEGER,
  "openedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"              TIMESTAMP(3),
  "notes"                 TEXT,

  -- The reconciliation, snapshotted at close. Stored rather than recomputed:
  -- what the drawer was counted at is a fact about that evening, and a figure
  -- that changes when a sale is voided next week is not a reconciliation.
  "salesCount"            INTEGER,
  "grossCentavos"         INTEGER,
  "discountCentavos"      INTEGER,
  "netCentavos"           INTEGER,
  "cashCollectedCentavos" INTEGER,
  "expectedCashCentavos"  INTEGER,
  -- closing − expected. NEGATIVE MEANS SHORT, which is the direction anybody
  -- reading it will assume, so it must be the direction it is.
  "overShortCentavos"     INTEGER,

  CONSTRAINT "pharmacy_shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pharmacy_readings" (
  "id"                    TEXT NOT NULL,
  "pharmacyId"            TEXT NOT NULL,
  "type"                  "PharmacyReadingType" NOT NULL,
  -- NULL for an X-reading. Sequential and never reset for a Z: that is the
  -- whole point of the counter, and it is why it lives on the pharmacy row
  -- rather than being derived by counting readings.
  "zCounter"              INTEGER,
  "shiftId"               TEXT,
  "staffId"               TEXT,
  "openedAt"              TIMESTAMP(3) NOT NULL,
  "closedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingCashCentavos"   INTEGER NOT NULL DEFAULT 0,

  "salesCount"            INTEGER NOT NULL DEFAULT 0,
  "voidedCount"           INTEGER NOT NULL DEFAULT 0,
  "grossCentavos"         INTEGER NOT NULL DEFAULT 0,
  "discountCentavos"      INTEGER NOT NULL DEFAULT 0,
  "netCentavos"           INTEGER NOT NULL DEFAULT 0,

  -- The VAT breakdown the monthly return is built from.
  "vatableCentavos"       INTEGER NOT NULL DEFAULT 0,
  "vatCentavos"           INTEGER NOT NULL DEFAULT 0,
  "vatExemptCentavos"     INTEGER NOT NULL DEFAULT 0,
  "zeroRatedCentavos"     INTEGER NOT NULL DEFAULT 0,

  -- Tender breakdown, so the drawer can be reconciled against the cash line
  -- alone rather than against the total.
  "cashCentavos"          INTEGER NOT NULL DEFAULT 0,
  "cardCentavos"          INTEGER NOT NULL DEFAULT 0,
  "gcashCentavos"         INTEGER NOT NULL DEFAULT 0,
  "mayaCentavos"          INTEGER NOT NULL DEFAULT 0,
  "otherCentavos"         INTEGER NOT NULL DEFAULT 0,

  -- The receipt range covered, which is what makes a Z-reading auditable: the
  -- series has to be continuous across every Z ever taken.
  "firstReceiptNumber"    TEXT,
  "lastReceiptNumber"     TEXT,

  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_readings_pkey" PRIMARY KEY ("id")
);

-- The Z counter. On the pharmacy row for the same reason the receipt counter is
-- there: counting readings would reissue a number if one were ever deleted, and
-- "non-resettable" is precisely the property being claimed.
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "nextZNo" INTEGER NOT NULL DEFAULT 1;

-- Which shift rang a sale. Nullable: sales taken before this existed, and sales
-- rung up with no shift open, both stay valid rows.
ALTER TABLE "pharmacy_sales" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;

CREATE INDEX IF NOT EXISTS "pharmacy_shifts_pharmacyId_idx" ON "pharmacy_shifts"("pharmacyId", "openedAt");
CREATE INDEX IF NOT EXISTS "pharmacy_shifts_pharmacyId_status_idx" ON "pharmacy_shifts"("pharmacyId", "status");
CREATE INDEX IF NOT EXISTS "pharmacy_readings_pharmacyId_idx" ON "pharmacy_readings"("pharmacyId", "closedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_readings_pharmacyId_zCounter_key" ON "pharmacy_readings"("pharmacyId", "zCounter");
CREATE INDEX IF NOT EXISTS "pharmacy_sales_shiftId_idx" ON "pharmacy_sales"("shiftId");

DO $$ BEGIN
  ALTER TABLE "pharmacy_shifts" ADD CONSTRAINT "pharmacy_shifts_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_readings" ADD CONSTRAINT "pharmacy_readings_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_readings" ADD CONSTRAINT "pharmacy_readings_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "pharmacy_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "pharmacy_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
