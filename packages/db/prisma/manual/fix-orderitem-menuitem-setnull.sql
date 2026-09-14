-- Deleting a menu category (or a single item) failed with a foreign-key error
-- whenever any of its items had already been ordered: order_items references
-- menu_items with ON DELETE RESTRICT, so the item couldn't be removed.
--
-- Order lines already snapshot the item name & price (nameAtTime / unitPrice),
-- so an order doesn't need the live menu_item row. Make the link nullable and
-- SET NULL on delete: history is preserved and the category/item can be deleted.
-- Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "order_items" ALTER COLUMN "menuItemId" DROP NOT NULL;

ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "order_items_menuItemId_fkey";
ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
