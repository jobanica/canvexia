-- One-time backfill for the business-operations layer.
-- Run AFTER add-business-ops.sql. Idempotent — safe to run twice.
--
-- Existing restaurants pre-date the CRM, so they have no pipeline row. This
-- creates one per live restaurant, already at the end of the pipeline, linked
-- by restaurantId.
--
-- 🚨 It does NOT invent history. Where a date isn't known it stays NULL rather
-- than being filled with createdAt — a made-up preview_sent date would put a
-- fake number into every fulfillment average and funnel conversion on the
-- dashboard, and nobody would ever know it was fiction. A blank is honest.

-- 1. Preview what it will do. Run this first and read the number.
SELECT count(*) AS will_be_created
FROM "restaurants" r
WHERE r."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "crm_clients" c WHERE c."restaurantId" = r."id");

-- 2. Create the rows.
INSERT INTO "crm_clients" (
  "id", "name", "stage", "step", "source",
  "restaurantId", "activatedAt", "paidAt",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  COALESCE(NULLIF(r."displayName", ''), r."name"),
  'won',                       -- they are customers; never chase them
  0,
  'backfill',                  -- distinguishable from a real outreach lead
  r."id",
  -- Known facts only. The paid/activated dates come from the activation
  -- request when there is one, and are NULL when there isn't — plenty of
  -- accounts were created by hand and never had one.
  (SELECT a."activatedAt" FROM "activation_requests" a
    WHERE a."restaurantId" = r."id" AND a."activatedAt" IS NOT NULL
    ORDER BY a."activatedAt" ASC LIMIT 1),
  (SELECT a."paidAt" FROM "activation_requests" a
    WHERE a."restaurantId" = r."id" AND a."paidAt" IS NOT NULL
    ORDER BY a."paidAt" ASC LIMIT 1),
  r."createdAt",               -- when the row really was created; not invented
  now()
FROM "restaurants" r
WHERE r."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "crm_clients" c WHERE c."restaurantId" = r."id");

-- 3. Verify. Expect linked = the count from step 1 plus anything already linked,
--    and orphans = 0.
SELECT
  (SELECT count(*) FROM "crm_clients" WHERE "restaurantId" IS NOT NULL) AS linked,
  (SELECT count(*) FROM "restaurants" WHERE "status" = 'active')        AS active_restaurants,
  (SELECT count(*) FROM "crm_clients" c
     WHERE c."restaurantId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "restaurants" r WHERE r."id" = c."restaurantId")) AS orphans;
