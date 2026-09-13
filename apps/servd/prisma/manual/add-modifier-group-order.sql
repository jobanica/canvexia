-- Modifier groups appear in the same order on every menu item.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- The order used to come off the item↔group link (menu_item_modifier_groups
-- .sortOrder), which nothing ever wrote — so every row sat at 0, every row tied,
-- and Postgres returned them in whatever order suited it. That order differs
-- per item, which is why one dish asked Size → Flavour → Add-ons and the next
-- asked Flavour → Add-ons → Size from the very same groups.
--
-- The order now lives on the GROUP, set once on the Modifiers page.
--
-- Nullable, no default: a DEFAULT would be sent by Prisma on every insert and
-- break creating a modifier group on a database that hasn't run this yet. NULL
-- sorts last, behind everything explicitly ordered.

ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

-- Backfill per restaurant, oldest first — the order they were created in, which
-- is the order the Modifiers page has been showing. Nobody's menu jumps around
-- the moment this runs; it just becomes stable and editable.
WITH ordered AS (
  SELECT id,
         row_number() OVER (PARTITION BY "restaurantId" ORDER BY "createdAt", id) - 1 AS pos
  FROM "modifier_groups"
  WHERE "sortOrder" IS NULL
)
UPDATE "modifier_groups" g
SET "sortOrder" = ordered.pos
FROM ordered
WHERE g.id = ordered.id;

-- Reading a menu sorts by this on every item.
CREATE INDEX IF NOT EXISTS "modifier_groups_restaurantId_sortOrder_idx"
  ON "modifier_groups" ("restaurantId", "sortOrder");

-- ---------------------------------------------------------------------------
-- Check it. Expect column_exists = t and unordered = 0.
-- ---------------------------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'modifier_groups' AND column_name = 'sortOrder') AS column_exists,
  count(*) FILTER (WHERE "sortOrder" IS NULL) AS unordered,
  count(*) AS total
FROM "modifier_groups";
