-- ============================================================================
-- RESCETA, WAVE 7 — receipt/printer settings, the storefront, and online orders.
--
-- AN ONLINE ORDER DOES NOT MOVE STOCK. It is a REQUEST: the customer asks for
-- items, the pharmacy confirms and prepares them, and the sale is rung up at
-- the counter like any other. That keeps ONE stock path — the one that already
-- allocates FEFO, snapshots cost, and writes the ledger. A second path that
-- deducted stock on "order placed" would be a second set of rules to keep in
-- agreement with the first, and they would drift.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PharmacyOrderStatus" AS ENUM ('placed', 'confirmed', 'ready', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PharmacyFulfilment" AS ENUM ('pickup', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- What the receipt says, and what it is printed on.
-- ---------------------------------------------------------------------------
-- 58 or 80, the two thermal roll widths in use. Stored rather than guessed
-- because a receipt laid out for 80mm and printed on 58mm wraps every line.
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "receiptPaperMm" INTEGER NOT NULL DEFAULT 58;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "receiptHeader" TEXT;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "receiptFooter" TEXT;
-- The BIR permit number and the machine's serial, which a registered POS has to
-- print on every receipt.
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "birPermitNo" TEXT;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "posSerialNo" TEXT;

-- ---------------------------------------------------------------------------
-- The storefront. OFF by default: a public page listing medicine is a decision
-- a pharmacy makes deliberately, not one it discovers it has made.
-- ---------------------------------------------------------------------------
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "storefrontOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "storefrontBlurb" TEXT;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "storefrontAcceptsDelivery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "nextOrderNo" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "pharmacy_orders" (
  "id"              TEXT NOT NULL,
  "pharmacyId"      TEXT NOT NULL,
  "branchId"        TEXT,
  "orderNumber"     TEXT NOT NULL,
  "status"          "PharmacyOrderStatus" NOT NULL DEFAULT 'placed',
  "fulfilment"      "PharmacyFulfilment" NOT NULL DEFAULT 'pickup',

  "customerName"    TEXT NOT NULL,
  "customerPhone"   TEXT NOT NULL,
  "customerAddress" TEXT,
  "customerId"      TEXT,
  "notes"           TEXT,

  -- Snapshotted at the moment of ordering, so a price change afterwards does
  -- not silently alter what the customer was quoted.
  "totalCentavos"   INTEGER NOT NULL DEFAULT 0,

  -- The sale, once it is rung up at the counter. Nullable and set late: an
  -- order is a request, and it is not a sale until somebody takes the money.
  "saleId"          TEXT,

  "handledByStaffId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pharmacy_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pharmacy_order_items" (
  "id"                TEXT NOT NULL,
  "pharmacyId"        TEXT NOT NULL,
  "orderId"           TEXT NOT NULL,
  "productId"         TEXT,
  -- Snapshotted, like a sale line: the product may be renamed or archived and
  -- the order still has to read.
  "nameAtTime"        TEXT NOT NULL,
  "quantity"          INTEGER NOT NULL,
  "unitPriceCentavos" INTEGER NOT NULL DEFAULT 0,
  "lineTotalCentavos" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "pharmacy_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pharmacy_orders_pharmacyId_idx" ON "pharmacy_orders"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_orders_pharmacyId_status_idx" ON "pharmacy_orders"("pharmacyId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_orders_pharmacyId_orderNumber_key" ON "pharmacy_orders"("pharmacyId", "orderNumber");
CREATE INDEX IF NOT EXISTS "pharmacy_order_items_orderId_idx" ON "pharmacy_order_items"("orderId");
CREATE INDEX IF NOT EXISTS "pharmacy_order_items_pharmacyId_idx" ON "pharmacy_order_items"("pharmacyId");

DO $$ BEGIN
  ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "pharmacy_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "pharmacy_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_orders" ADD CONSTRAINT "pharmacy_orders_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "pharmacy_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_order_items" ADD CONSTRAINT "pharmacy_order_items_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_order_items" ADD CONSTRAINT "pharmacy_order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "pharmacy_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pharmacy_order_items" ADD CONSTRAINT "pharmacy_order_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
