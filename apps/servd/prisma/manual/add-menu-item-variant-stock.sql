-- Per-size stock count (pcs). Each menu item size/variant can track how many
-- pieces are available; it auto-marks that size sold out when the count hits 0.
-- null = untracked (unlimited). Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "menu_item_variants" ADD COLUMN IF NOT EXISTS "stock" INTEGER;
