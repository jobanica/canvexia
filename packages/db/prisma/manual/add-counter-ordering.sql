-- Counter / takeout ordering: a single stall QR that issues daily order numbers
-- instead of a table. Run in the Supabase SQL editor. Safe to re-run.

-- One stall/takeout QR per restaurant (a Table row flagged isCounter).
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "isCounter" BOOLEAN NOT NULL DEFAULT false;

-- Daily ticket number for counter orders (null for table/web orders).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER;
CREATE INDEX IF NOT EXISTS "orders_restaurantId_orderNumber_idx"
  ON "orders" ("restaurantId", "orderNumber");
