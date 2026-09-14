-- Reseta — voids and returns (D32).
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`: the
-- two new tables carry `pharmacyId`, so the axis loop covers them without
-- naming them. Idempotent.
--
-- A void flips PharmacySale.status (columns already present). A return is its
-- own document, which is what these tables are.

DO $$ BEGIN
  CREATE TYPE "PharmacyReturnDisposition" AS ENUM ('destroyed', 'restocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ADD VALUE IF NOT EXISTS: re-running must not fail on an enum value that is
-- already there.
ALTER TYPE "PharmacyMovementType" ADD VALUE IF NOT EXISTS 'return';

-- Its OWN number series. A credit note and a receipt are different documents
-- and BIR wants each sequence gapless on its own terms.
ALTER TABLE "pharmacies" ADD COLUMN IF NOT EXISTS "nextReturnNo" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "pharmacy_returns" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "reason" TEXT,
    "totalCentavos" INTEGER NOT NULL DEFAULT 0,
    "refundMethod" TEXT NOT NULL DEFAULT 'cash',
    "processedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pharmacy_returns_pkey" PRIMARY KEY ("id")
);

-- saleItemId, not just productId: a sale line names the batch the units came
-- from, so a return pointing at the LINE knows the lot. Pointing at the product
-- loses it, and a recall names a lot.
CREATE TABLE IF NOT EXISTS "pharmacy_return_items" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT,
    "batchId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCentavos" INTEGER NOT NULL,
    "lineTotalCentavos" INTEGER NOT NULL,
    -- Destroyed by DEFAULT. A dispensed medicine cannot go back on the shelf:
    -- nobody can verify how it was stored or whether the pack was tampered
    -- with. Restocking is a deliberate per-line choice, not the default.
    "disposition" "PharmacyReturnDisposition" NOT NULL DEFAULT 'destroyed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pharmacy_return_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pharmacy_returns_pharmacyId_createdAt_idx" ON "pharmacy_returns"("pharmacyId", "createdAt");
CREATE INDEX IF NOT EXISTS "pharmacy_returns_saleId_idx" ON "pharmacy_returns"("saleId");
CREATE UNIQUE INDEX IF NOT EXISTS "pharmacy_returns_pharmacyId_returnNumber_key" ON "pharmacy_returns"("pharmacyId", "returnNumber");
CREATE INDEX IF NOT EXISTS "pharmacy_return_items_returnId_idx" ON "pharmacy_return_items"("returnId");
CREATE INDEX IF NOT EXISTS "pharmacy_return_items_saleItemId_idx" ON "pharmacy_return_items"("saleItemId");
CREATE INDEX IF NOT EXISTS "pharmacy_return_items_pharmacyId_idx" ON "pharmacy_return_items"("pharmacyId");

DO $$ BEGIN
  ALTER TABLE "pharmacy_returns" ADD CONSTRAINT "pharmacy_returns_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pharmacy_returns" ADD CONSTRAINT "pharmacy_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pharmacy_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pharmacy_return_items" ADD CONSTRAINT "pharmacy_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "pharmacy_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pharmacy_return_items" ADD CONSTRAINT "pharmacy_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "pharmacy_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Expect one row, all true.
SELECT 'reseta returns' AS feature,
       to_regclass('public.pharmacy_returns') IS NOT NULL AS returns,
       to_regclass('public.pharmacy_return_items') IS NOT NULL AS return_items,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'pharmacies' AND column_name = 'nextReturnNo') AS return_counter;
