-- ============================================================
-- Servd — make ORDER PLACEMENT work on a schema-lagged database.
-- Fixes "we couldn't place your order" across QR dine-in, online
-- pickup/delivery, and the cashier. Run in the Supabase SQL editor.
-- Idempotent and safe to re-run.
-- ============================================================

-- 1) Enum VALUES the app writes (no-ops if already present).
--    QR + online orders use status 'pending'; payments use 'pending'/'refunded'.
ALTER TYPE "OrderStatus"   ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "OrderStatus"   ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';

-- 2) OrderType enum (pickup / delivery). Create it if missing, else ensure values.
DO $$ BEGIN
  CREATE TYPE "OrderType" AS ENUM ('dine_in', 'takeout', 'delivery');
EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'dine_in';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'takeout';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'delivery';

-- 3) Every column the order writers set (pickup/delivery, counter ticket
--    numbers, discounts, gift-card credit, tips, lifecycle timestamps).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "orderType"           "OrderType" NOT NULL DEFAULT 'dine_in';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "orderNumber"         INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerName"        TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerPhone"       TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerAddress"     TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerLat"         DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerLng"         DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryStatus"      TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "billRequested"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountAmount"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountLabel"       TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "creditApplied"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "giftCardId"          TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tipAmount"           INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "inventoryDeductedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "servedAt"            TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "voidedAt"            TIMESTAMP(3);

-- 4) Counter / takeout ordering: stalls with no tables get one QR + order numbers.
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "isCounter" BOOLEAN NOT NULL DEFAULT false;
