-- Low-stock alerts + reorder suggestions. Run in the Supabase SQL editor. Idempotent.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "lowStockAlertedAt" TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "lowStockAlertPhone" TEXT;
