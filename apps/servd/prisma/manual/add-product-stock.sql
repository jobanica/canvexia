-- Stock counted per product, not only per ingredient.
--
-- A restaurant tracks flour and sells dishes made from it. A shop tracks the
-- thing it sells: one unit off the shelf per unit on the receipt. Both are
-- stock, so both live in inventory_items and share movements, weighted-average
-- costing, purchase orders, reorder suggestions and low-stock alerts. This
-- column is what tells them apart:
--
--   menuItemId IS NULL  → an ingredient
--   menuItemId IS NOT NULL → this row IS that product's own stock
--
-- UNIQUE because a product has exactly one count. ON DELETE CASCADE because a
-- deleted product's stock row means nothing — unlike an order line, there's no
-- history worth keeping once the thing itself is gone.
--
-- Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;

DO $$
BEGIN
  ALTER TABLE "inventory_items"
    ADD CONSTRAINT "inventory_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_menuItemId_key"
  ON "inventory_items" ("menuItemId");

-- inventory_items already carries its RLS policy and grants; adding a column
-- doesn't change either. (If inserts here are being refused, that's the
-- separate problem fix-table-grants.sql repairs.)
