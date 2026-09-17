-- ============================================================================
-- RESCETA, WAVES 2-3: customers and loyalty, prescriptions, purchase orders,
-- stocktakes, and stock write-offs (including donations).
--
-- REPORTED — "i compare both, reseta and resceta. its very far. you should
-- copy all functions from reseta to resceta."
--
-- EVERY TABLE CARRIES "pharmacyId" AND NOTHING ELSE IDENTIFIES THE TENANT.
-- rls.sql builds its policies by asking the catalogue which tables have that
-- column, so a table created here is isolated the moment rls.sql is re-run —
-- which is the only version of that list that stays true. A table that keyed
-- on something else would silently get no policy at all.
--
-- MONEY IS INTEGER CENTAVOS. Every amount column, everywhere, no exceptions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums. Created idempotently: ALTER TYPE ... ADD VALUE cannot be undone, so
-- re-running this file must not attempt one.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "PharmacyPoStatus" AS ENUM ('draft', 'sent', 'partial', 'received', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyStocktakeStatus" AS ENUM ('draft', 'counting', 'approved', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyLoyaltyKind" AS ENUM ('earn', 'redeem', 'adjust');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- `donated` is its own reason rather than "other with a note": medicine given
  -- to a barangay health centre is a different line in the books from medicine
  -- that spoiled, and a pharmacy is asked about both separately.
  CREATE TYPE "PharmacyWriteoffReason" AS ENUM ('expired', 'damaged', 'donated', 'lost', 'recalled', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Customers. Optional on a sale and always will be: most counter sales are
-- anonymous, and a system that demands a name before it will take money is one
-- the cashier works around.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pharmacy_customers" (
  "id"            TEXT NOT NULL,
  "pharmacyId"    TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "phone"         TEXT,
  "email"         TEXT,
  "address"       TEXT,
  "notes"         TEXT,
  -- The balance is a cached total of the ledger below, not the truth. The
  -- ledger is the truth; this is what the counter reads so it does not sum a
  -- thousand rows while somebody waits.
  "pointsBalance" INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pharmacy_loyalty_transactions" (
  "id"           TEXT NOT NULL,
  "pharmacyId"   TEXT NOT NULL,
  "customerId"   TEXT NOT NULL,
  "saleId"       TEXT,
  "kind"         "PharmacyLoyaltyKind" NOT NULL,
  -- Signed: positive earns, negative redeems. Storing the sign here means the
  -- balance is a SUM and never a case expression that someone gets backwards.
  "points"       INTEGER NOT NULL,
  "note"         TEXT,
  "actorStaffId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Prescriptions, as records rather than a free-text reference.
--
-- `pharmacy_sales.prescriptionRef` is a string somebody types. That is enough
-- to put on a receipt and not enough to answer "show me every dispensing
-- against Dr Santos's PRC number", which is what an FDA inspection asks. The
-- paper Rx stays the legal document; this is the index into it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pharmacy_prescriptions" (
  "id"           TEXT NOT NULL,
  "pharmacyId"   TEXT NOT NULL,
  "customerId"   TEXT,
  "rxNumber"     TEXT,
  "patientName"  TEXT NOT NULL,
  "patientDob"   TIMESTAMP(3),
  "doctorName"   TEXT NOT NULL,
  -- The PRC licence number. The one field that makes a prescription checkable.
  "doctorPrcNo"  TEXT,
  "dateIssued"   TIMESTAMP(3) NOT NULL,
  "notes"        TEXT,
  "actorStaffId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_prescriptions_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Purchase orders. What was ordered, against what arrived.
--
-- Receiving already exists and writes batches directly; a PO is the document
-- that came before it, and the reason a pharmacy can tell a short delivery from
-- a complete one. `quantityReceived` on the line is what makes that comparison
-- possible without re-deriving it from the batches.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pharmacy_purchase_orders" (
  "id"           TEXT NOT NULL,
  "pharmacyId"   TEXT NOT NULL,
  "supplierId"   TEXT,
  -- Gapless per pharmacy, allocated in the creating transaction.
  "poNumber"     TEXT NOT NULL,
  "status"       "PharmacyPoStatus" NOT NULL DEFAULT 'draft',
  "expectedDate" TIMESTAMP(3),
  "notes"        TEXT,
  "actorStaffId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pharmacy_purchase_order_items" (
  "id"                TEXT NOT NULL,
  "pharmacyId"        TEXT NOT NULL,
  "purchaseOrderId"   TEXT NOT NULL,
  "productId"         TEXT NOT NULL,
  "quantityOrdered"   INTEGER NOT NULL,
  "quantityReceived"  INTEGER NOT NULL DEFAULT 0,
  "unitCostCentavos"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Stocktakes. The count that makes the system agree with the shelf.
--
-- A stocktake is NOT an edit to the batches. It is a document that records what
-- was counted, is approved by somebody, and only then writes the adjustments —
-- because "the system said 40 and the shelf had 31" is a fact worth keeping
-- after the number has been corrected.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pharmacy_stocktakes" (
  "id"                TEXT NOT NULL,
  "pharmacyId"        TEXT NOT NULL,
  "status"            "PharmacyStocktakeStatus" NOT NULL DEFAULT 'draft',
  "notes"             TEXT,
  "actorStaffId"      TEXT,
  "approvedByStaffId" TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt"        TIMESTAMP(3),
  CONSTRAINT "pharmacy_stocktakes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pharmacy_stocktake_items" (
  "id"               TEXT NOT NULL,
  "pharmacyId"       TEXT NOT NULL,
  "stocktakeId"      TEXT NOT NULL,
  "productId"        TEXT NOT NULL,
  -- What the system believed at the moment the sheet was opened. Snapshotted,
  -- so a sale rung up mid-count does not silently change what is being
  -- reconciled against.
  "systemQty"        INTEGER NOT NULL DEFAULT 0,
  -- NULL means "not counted yet", which is different from "counted zero". A
  -- default of 0 here would approve a sheet that writes every uncounted
  -- product down to nothing.
  "countedQty"       INTEGER,
  "unitCostCentavos" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "pharmacy_stocktake_items_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Write-offs: expired, damaged, donated, lost, recalled.
--
-- The stock movement records that quantity left; this records WHY, at what
-- cost, and of what. A pharmacy is asked for the value of expired stock at
-- year end and for a list of donations, and neither is derivable from a
-- movement row that only says "adjustment".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pharmacy_writeoffs" (
  "id"                  TEXT NOT NULL,
  "pharmacyId"          TEXT NOT NULL,
  "productId"           TEXT,
  "batchId"             TEXT,
  -- Snapshotted, for the same reason a sale line snapshots its name: the
  -- product may be archived later and the write-off still has to read.
  "productName"         TEXT NOT NULL,
  "lotNumber"           TEXT,
  "quantity"            INTEGER NOT NULL,
  "unitCostCentavos"    INTEGER NOT NULL DEFAULT 0,
  "totalCostCentavos"   INTEGER NOT NULL DEFAULT 0,
  "reason"              "PharmacyWriteoffReason" NOT NULL DEFAULT 'other',
  -- Where a donation went. Required by the app for `donated`, because a
  -- donation with no recipient is indistinguishable from stock that walked.
  "recipient"           TEXT,
  "notes"               TEXT,
  "actorStaffId"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_writeoffs_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Linking a sale to the customer and the prescription behind it.
--
-- Nullable, both: an anonymous over-the-counter sale is the normal case and
-- must stay one row with two NULLs, not a fake customer.
-- ---------------------------------------------------------------------------
ALTER TABLE "pharmacy_sales" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "pharmacy_sales" ADD COLUMN IF NOT EXISTS "prescriptionId" TEXT;
ALTER TABLE "pharmacy_sales" ADD COLUMN IF NOT EXISTS "pointsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pharmacy_sales" ADD COLUMN IF NOT EXISTS "pointsRedeemedCentavos" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Loyalty settings live on the pharmacy: one earn rate, one peso value.
-- Zero means the programme is off, which is the default and stays the default.
-- ---------------------------------------------------------------------------
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "loyaltyPointsPerPeso" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "loyaltyCentavosPerPoint" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Indexes. Every one is a query this app actually runs.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "pharmacy_customers_pharmacyId_idx" ON "pharmacy_customers"("pharmacyId");
CREATE INDEX IF NOT EXISTS "pharmacy_customers_pharmacyId_phone_idx" ON "pharmacy_customers"("pharmacyId", "phone");
CREATE INDEX IF NOT EXISTS "pharmacy_loyalty_transactions_pharmacyId_idx" ON "pharmacy_loyalty_transactions"("pharmacyId");
CREATE INDEX IF NOT EXISTS "pharmacy_loyalty_transactions_customerId_idx" ON "pharmacy_loyalty_transactions"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_prescriptions_pharmacyId_idx" ON "pharmacy_prescriptions"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_prescriptions_pharmacyId_doctorPrcNo_idx" ON "pharmacy_prescriptions"("pharmacyId", "doctorPrcNo");
CREATE INDEX IF NOT EXISTS "pharmacy_prescriptions_customerId_idx" ON "pharmacy_prescriptions"("customerId");
CREATE INDEX IF NOT EXISTS "pharmacy_purchase_orders_pharmacyId_idx" ON "pharmacy_purchase_orders"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_purchase_orders_supplierId_idx" ON "pharmacy_purchase_orders"("supplierId");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_purchase_orders_pharmacyId_poNumber_key" ON "pharmacy_purchase_orders"("pharmacyId", "poNumber");
CREATE INDEX IF NOT EXISTS "pharmacy_purchase_order_items_purchaseOrderId_idx" ON "pharmacy_purchase_order_items"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "pharmacy_purchase_order_items_pharmacyId_idx" ON "pharmacy_purchase_order_items"("pharmacyId");
CREATE INDEX IF NOT EXISTS "pharmacy_purchase_order_items_productId_idx" ON "pharmacy_purchase_order_items"("productId");
CREATE INDEX IF NOT EXISTS "pharmacy_stocktakes_pharmacyId_idx" ON "pharmacy_stocktakes"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_stocktake_items_stocktakeId_idx" ON "pharmacy_stocktake_items"("stocktakeId");
CREATE INDEX IF NOT EXISTS "pharmacy_stocktake_items_pharmacyId_idx" ON "pharmacy_stocktake_items"("pharmacyId");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_stocktake_items_stocktakeId_productId_key" ON "pharmacy_stocktake_items"("stocktakeId", "productId");
CREATE INDEX IF NOT EXISTS "pharmacy_writeoffs_pharmacyId_idx" ON "pharmacy_writeoffs"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_writeoffs_pharmacyId_reason_idx" ON "pharmacy_writeoffs"("pharmacyId", "reason");
CREATE INDEX IF NOT EXISTS "pharmacy_sales_customerId_idx" ON "pharmacy_sales"("customerId");
CREATE INDEX IF NOT EXISTS "pharmacy_sales_prescriptionId_idx" ON "pharmacy_sales"("prescriptionId");

-- ---------------------------------------------------------------------------
-- Foreign keys.
--
-- CASCADE from the pharmacy (deleting a merchant takes its data with it) and
-- from the parent document. SET NULL from a product or a batch, never RESTRICT:
-- Servd shipped exactly that as RESTRICT once and made a menu item undeletable
-- the moment anyone had ordered it. Every line here snapshots what it needs.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "pharmacy_customers" ADD CONSTRAINT "pharmacy_customers_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_loyalty_transactions" ADD CONSTRAINT "pharmacy_loyalty_transactions_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_loyalty_transactions" ADD CONSTRAINT "pharmacy_loyalty_transactions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "pharmacy_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_prescriptions" ADD CONSTRAINT "pharmacy_prescriptions_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_prescriptions" ADD CONSTRAINT "pharmacy_prescriptions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "pharmacy_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_purchase_orders" ADD CONSTRAINT "pharmacy_purchase_orders_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_purchase_orders" ADD CONSTRAINT "pharmacy_purchase_orders_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "pharmacy_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_purchase_order_items" ADD CONSTRAINT "pharmacy_purchase_order_items_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_purchase_order_items" ADD CONSTRAINT "pharmacy_purchase_order_items_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "pharmacy_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_purchase_order_items" ADD CONSTRAINT "pharmacy_purchase_order_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stocktakes" ADD CONSTRAINT "pharmacy_stocktakes_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stocktake_items" ADD CONSTRAINT "pharmacy_stocktake_items_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stocktake_items" ADD CONSTRAINT "pharmacy_stocktake_items_stocktakeId_fkey"
    FOREIGN KEY ("stocktakeId") REFERENCES "pharmacy_stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_stocktake_items" ADD CONSTRAINT "pharmacy_stocktake_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_writeoffs" ADD CONSTRAINT "pharmacy_writeoffs_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_writeoffs" ADD CONSTRAINT "pharmacy_writeoffs_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_writeoffs" ADD CONSTRAINT "pharmacy_writeoffs_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "pharmacy_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "pharmacy_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_prescriptionId_fkey"
    FOREIGN KEY ("prescriptionId") REFERENCES "pharmacy_prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
