-- CANVEXIA — Reseta, the pharmacy vertical (D24, D28).
-- (The product was renamed to Resceta after this file was written. manual/ is a
--  record of what was run, not a queue to replay, so the old name stands here.)
--
-- The second product on this schema. Run in the Supabase SQL editor, then
-- `pnpm --filter @servd/db db:rls` to install the policies for the new tenant
-- tables — rls.sql now loops over both merchant axes, so the pharmacy tables
-- are covered by the same pass that covers Servd's.
--
-- Idempotent. Safe on a database that already has some of it.
--
-- NOTE the ledger change below: it renames a column rather than dropping it.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PharmacyStaffRole" AS ENUM ('owner', 'manager', 'pharmacist', 'cashier');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PharmacyMovementType" AS ENUM ('receive', 'sale', 'adjustment', 'void', 'expiry_writeoff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PharmacySaleStatus" AS ENUM ('completed', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PharmacyDiscountType" AS ENUM ('none', 'manual', 'sc', 'pwd');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The ledger becomes product-agnostic: "restaurantId" was only ever a merchant
-- id, and means nothing once there is more than one product's merchant table to
-- index. RENAMED rather than dropped and re-added — prisma migrate diff emits
-- the destructive version, which would discard every settlement row.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'partner_ledger_entries'
                AND column_name = 'restaurantId') THEN
    ALTER TABLE "partner_ledger_entries" RENAME COLUMN "restaurantId" TO "merchantId";
  END IF;
END $$;
DROP INDEX IF EXISTS "partner_ledger_entries_restaurantId_idx";
ALTER TABLE "partner_ledger_entries"
  ADD COLUMN IF NOT EXISTS "productId" TEXT NOT NULL DEFAULT 'servd';

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacies" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "displayName" TEXT,
    "logoUrl" TEXT,
    "tagline" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "fdaLtoNumber" TEXT,
    "prcLicenseNo" TEXT,
    "tin" TEXT,
    "vatRatePct" INTEGER NOT NULL DEFAULT 12,
    "nextReceiptNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_staff" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "role" "PharmacyStaffRole" NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_categories" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_products" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "form" TEXT,
    "strength" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "priceCentavos" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_suppliers" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_batches" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "costCentavos" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_stock_movements" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "PharmacyMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "referenceId" TEXT,
    "reason" TEXT,
    "actorStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_sales" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "subtotalCentavos" INTEGER NOT NULL DEFAULT 0,
    "discountCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "discountType" "PharmacyDiscountType" NOT NULL DEFAULT 'none',
    "beneficiaryIdNo" TEXT,
    "beneficiaryName" TEXT,
    "vatExemptCentavos" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "tenderedCentavos" INTEGER NOT NULL DEFAULT 0,
    "changeCentavos" INTEGER NOT NULL DEFAULT 0,
    "status" "PharmacySaleStatus" NOT NULL DEFAULT 'completed',
    "prescriptionRef" TEXT,
    "soldByStaffId" TEXT,
    "voidedByStaffId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pharmacy_sale_items" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "batchId" TEXT,
    "nameAtTime" TEXT NOT NULL,
    "genericAtTime" TEXT,
    "lotNumberAtTime" TEXT,
    "expiryAtTime" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "unitPriceCentavos" INTEGER NOT NULL,
    "lineTotalCentavos" INTEGER NOT NULL,
    "unitCostCentavos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pharmacy_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacies_slug_key" ON "pharmacies"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacies_partnerId_idx" ON "pharmacies"("partnerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_staff_authUserId_idx" ON "pharmacy_staff"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_staff_pharmacyId_authUserId_key" ON "pharmacy_staff"("pharmacyId", "authUserId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_staff_pharmacyId_email_key" ON "pharmacy_staff"("pharmacyId", "email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_categories_pharmacyId_idx" ON "pharmacy_categories"("pharmacyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_products_pharmacyId_idx" ON "pharmacy_products"("pharmacyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_products_pharmacyId_genericName_idx" ON "pharmacy_products"("pharmacyId", "genericName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_products_categoryId_idx" ON "pharmacy_products"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_products_pharmacyId_sku_key" ON "pharmacy_products"("pharmacyId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_products_pharmacyId_barcode_key" ON "pharmacy_products"("pharmacyId", "barcode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_suppliers_pharmacyId_idx" ON "pharmacy_suppliers"("pharmacyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_batches_pharmacyId_idx" ON "pharmacy_batches"("pharmacyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_batches_productId_expiryDate_idx" ON "pharmacy_batches"("productId", "expiryDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_batches_pharmacyId_expiryDate_idx" ON "pharmacy_batches"("pharmacyId", "expiryDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_stock_movements_pharmacyId_createdAt_idx" ON "pharmacy_stock_movements"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_stock_movements_productId_idx" ON "pharmacy_stock_movements"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_stock_movements_batchId_idx" ON "pharmacy_stock_movements"("batchId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_sales_pharmacyId_createdAt_idx" ON "pharmacy_sales"("pharmacyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_sales_pharmacyId_status_idx" ON "pharmacy_sales"("pharmacyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_sales_pharmacyId_receiptNumber_key" ON "pharmacy_sales"("pharmacyId", "receiptNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_sale_items_saleId_idx" ON "pharmacy_sale_items"("saleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_sale_items_productId_idx" ON "pharmacy_sale_items"("productId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pharmacy_sale_items_pharmacyId_idx" ON "pharmacy_sale_items"("pharmacyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "partner_ledger_entries_productId_merchantId_idx" ON "partner_ledger_entries"("productId", "merchantId");

-- AddForeignKey
ALTER TABLE "pharmacy_staff" ADD CONSTRAINT "pharmacy_staff_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_categories" ADD CONSTRAINT "pharmacy_categories_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_products" ADD CONSTRAINT "pharmacy_products_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_products" ADD CONSTRAINT "pharmacy_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "pharmacy_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_suppliers" ADD CONSTRAINT "pharmacy_suppliers_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_batches" ADD CONSTRAINT "pharmacy_batches_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_batches" ADD CONSTRAINT "pharmacy_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_batches" ADD CONSTRAINT "pharmacy_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "pharmacy_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_stock_movements" ADD CONSTRAINT "pharmacy_stock_movements_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_stock_movements" ADD CONSTRAINT "pharmacy_stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_stock_movements" ADD CONSTRAINT "pharmacy_stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "pharmacy_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sales" ADD CONSTRAINT "pharmacy_sales_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sale_items" ADD CONSTRAINT "pharmacy_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pharmacy_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL, not RESTRICT: the line snapshots nameAtTime, so a sale keeps its
-- record without the live product row. Restrict would make a product
-- undeletable the moment anyone bought it — see
-- prisma/manual/fix-orderitem-menuitem-setnull.sql, where Servd hit exactly
-- this and fixed it the same way.
ALTER TABLE "pharmacy_sale_items" ADD CONSTRAINT "pharmacy_sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pharmacy_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy_sale_items" ADD CONSTRAINT "pharmacy_sale_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "pharmacy_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Expect one row, all true.
SELECT 'reseta' AS vertical,
       to_regclass('public.pharmacies') IS NOT NULL AS pharmacies,
       to_regclass('public.pharmacy_batches') IS NOT NULL AS batches,
       to_regclass('public.pharmacy_sales') IS NOT NULL AS sales,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'partner_ledger_entries'
                  AND column_name = 'merchantId') AS ledger_merchant_id;
