-- Dietary & allergen tags on menu items. Run in the Supabase SQL editor.
-- Safe to re-run. Stores tag keys (see src/lib/menu/dietary.ts) as a text array.
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "dietaryTags" TEXT[] NOT NULL DEFAULT '{}';
