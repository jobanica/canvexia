-- Manual GCash / Cash payment on the online-ordering website. The owner sets
-- their GCash name/number + QR image in admin; customers pick Cash or GCash at
-- checkout, and GCash shows the owner's QR to scan + a reference field.
-- Small, idempotent additions. Run in the Supabase SQL editor.

-- Storefront payment config: { codEnabled, gcashEnabled, gcashName, gcashNumber, gcashQrUrl }.
ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "paymentConfig" JSONB;

-- Per-order chosen method + GCash reference for the full payment.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "paymentChoice" TEXT; -- "cod" | "gcash"
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;
