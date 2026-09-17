-- ============================================================================
-- RESCETA, WAVE 6 — branches, and transfers between them.
--
-- THE INVASIVE ONE, and it is done additively on purpose.
--
-- Every existing row predates branches. Rather than a required column and a
-- rewrite, `branchId` is added NULLABLE everywhere and backfilled to a "Main
-- Branch" created for each pharmacy. Nothing already written becomes invalid,
-- and a pharmacy that never opens a second branch never sees the concept.
--
-- WHY NULL STILL MEANS SOMETHING: a null branchId is read as "the main branch"
-- by the app rather than "no branch". A row written by an older deploy, or by a
-- path that has not been taught about branches yet, lands somewhere real
-- instead of disappearing from every per-branch total.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PharmacyTransferStatus" AS ENUM ('in_transit', 'received', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "pharmacy_branches" (
  "id"         TEXT NOT NULL,
  "pharmacyId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "address"    TEXT,
  "phone"      TEXT,
  -- Exactly one per pharmacy, enforced by a partial unique index below. It is
  -- where every pre-branch row is filed and what a null branchId resolves to,
  -- so a pharmacy without one has stock that belongs nowhere.
  "isMain"     BOOLEAN NOT NULL DEFAULT false,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_branches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pharmacy_branches_pharmacyId_idx" ON "pharmacy_branches"("pharmacyId");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_branches_one_main"
  ON "pharmacy_branches"("pharmacyId") WHERE "isMain";

DO $$ BEGIN
  ALTER TABLE "pharmacy_branches" ADD CONSTRAINT "pharmacy_branches_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Stock transfers. Two-step on purpose: stock leaves the source when the
-- transfer is created and arrives at the destination when somebody there
-- confirms it. The gap is real — the boxes are in a van — and a one-step
-- transfer makes stock teleport, which means a shortfall at either end is
-- invisible until a stocktake.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pharmacy_stock_transfers" (
  "id"                TEXT NOT NULL,
  "pharmacyId"        TEXT NOT NULL,
  "fromBranchId"      TEXT NOT NULL,
  "toBranchId"        TEXT NOT NULL,
  "status"            "PharmacyTransferStatus" NOT NULL DEFAULT 'in_transit',
  "notes"             TEXT,
  "actorStaffId"      TEXT,
  "receivedByStaffId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt"        TIMESTAMP(3),
  CONSTRAINT "pharmacy_stock_transfers_pkey" PRIMARY KEY ("id"),
  -- A branch cannot transfer to itself. Caught here as well as in the app,
  -- because it would silently double the stock at that branch.
  CONSTRAINT "pharmacy_transfers_different_branches" CHECK ("fromBranchId" <> "toBranchId")
);

CREATE TABLE IF NOT EXISTS "pharmacy_stock_transfer_items" (
  "id"               TEXT NOT NULL,
  "pharmacyId"       TEXT NOT NULL,
  "transferId"       TEXT NOT NULL,
  "productId"        TEXT NOT NULL,
  -- The batch it came out of at the source, so the lot number and expiry
  -- travel with the goods. A transfer that loses them turns traceable stock
  -- into anonymous stock.
  "sourceBatchId"    TEXT,
  "lotNumber"        TEXT,
  "expiryDate"       TIMESTAMP(3),
  "quantity"         INTEGER NOT NULL,
  "unitCostCentavos" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "pharmacy_stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- The branch column, everywhere it means something. Nullable; backfilled below.
-- ---------------------------------------------------------------------------
ALTER TABLE "pharmacy_batches"          ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "pharmacy_sales"            ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "pharmacy_shifts"           ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "pharmacy_employees"        ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "pharmacy_stock_movements"  ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "pharmacy_readings"         ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "pharmacy_stocktakes"       ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- One Main Branch per pharmacy, for every pharmacy that has none.
INSERT INTO "pharmacy_branches" ("id", "pharmacyId", "name", "isMain", "isActive")
SELECT gen_random_uuid()::text, p."id", 'Main Branch', true, true
  FROM "pharmacies" p
 WHERE NOT EXISTS (
   SELECT 1 FROM "pharmacy_branches" b WHERE b."pharmacyId" = p."id" AND b."isMain"
 );

-- Everything written before branches existed belongs to the main branch.
UPDATE "pharmacy_batches" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

UPDATE "pharmacy_sales" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

UPDATE "pharmacy_shifts" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

UPDATE "pharmacy_employees" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

UPDATE "pharmacy_stock_movements" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

UPDATE "pharmacy_readings" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

UPDATE "pharmacy_stocktakes" t
   SET "branchId" = b."id"
  FROM "pharmacy_branches" b
 WHERE b."pharmacyId" = t."pharmacyId" AND b."isMain" AND t."branchId" IS NULL;

CREATE INDEX IF NOT EXISTS "pharmacy_batches_branchId_idx"         ON "pharmacy_batches"("branchId");
CREATE INDEX IF NOT EXISTS "pharmacy_sales_branchId_idx"           ON "pharmacy_sales"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_shifts_branchId_idx"          ON "pharmacy_shifts"("branchId");
CREATE INDEX IF NOT EXISTS "pharmacy_employees_branchId_idx"       ON "pharmacy_employees"("branchId");
CREATE INDEX IF NOT EXISTS "pharmacy_stock_movements_branchId_idx" ON "pharmacy_stock_movements"("branchId");
CREATE INDEX IF NOT EXISTS "pharmacy_readings_branchId_idx"        ON "pharmacy_readings"("branchId");
CREATE INDEX IF NOT EXISTS "pharmacy_stocktakes_branchId_idx"      ON "pharmacy_stocktakes"("branchId");
CREATE INDEX IF NOT EXISTS "pharmacy_stock_transfers_pharmacyId_idx" ON "pharmacy_stock_transfers"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_stock_transfers_fromBranchId_idx" ON "pharmacy_stock_transfers"("fromBranchId");
CREATE INDEX IF NOT EXISTS "pharmacy_stock_transfers_toBranchId_idx" ON "pharmacy_stock_transfers"("toBranchId");
CREATE INDEX IF NOT EXISTS "pharmacy_stock_transfer_items_transferId_idx" ON "pharmacy_stock_transfer_items"("transferId");
CREATE INDEX IF NOT EXISTS "pharmacy_stock_transfer_items_pharmacyId_idx" ON "pharmacy_stock_transfer_items"("pharmacyId");

-- Foreign keys. SET NULL from a branch on the transactional tables: deleting a
-- branch must not take a year of sales with it. RESTRICT on the transfer, which
-- is a document about two branches and is meaningless without them.
DO $$ BEGIN
  ALTER TABLE "pharmacy_batches" ADD CONSTRAINT "pharmacy_batches_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_shifts" ADD CONSTRAINT "pharmacy_shifts_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_employees" ADD CONSTRAINT "pharmacy_employees_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_movements" ADD CONSTRAINT "pharmacy_stock_movements_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_readings" ADD CONSTRAINT "pharmacy_readings_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stocktakes" ADD CONSTRAINT "pharmacy_stocktakes_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfers" ADD CONSTRAINT "pharmacy_stock_transfers_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfers" ADD CONSTRAINT "pharmacy_stock_transfers_fromBranchId_fkey"
    FOREIGN KEY ("fromBranchId") REFERENCES "pharmacy_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfers" ADD CONSTRAINT "pharmacy_stock_transfers_toBranchId_fkey"
    FOREIGN KEY ("toBranchId") REFERENCES "pharmacy_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfer_items" ADD CONSTRAINT "pharmacy_stock_transfer_items_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfer_items" ADD CONSTRAINT "pharmacy_stock_transfer_items_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "pharmacy_stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfer_items" ADD CONSTRAINT "pharmacy_stock_transfer_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stock_transfer_items" ADD CONSTRAINT "pharmacy_stock_transfer_items_sourceBatchId_fkey"
    FOREIGN KEY ("sourceBatchId") REFERENCES "pharmacy_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
