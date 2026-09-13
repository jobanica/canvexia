-- Temporary merchant logins for demo storefronts.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- A demo is pitched by handing someone a phone: they scan the QR, order, and
-- watch it land on the merchant screen. That needs a login, and a login left
-- behind on a storefront a real restaurant later takes over is a real problem —
-- so these carry an expiry and stop working on their own.
--
-- Carrying an expiry IS what makes a staff row temporary; there is no second
-- boolean to fall out of step with it. NULL means a normal, permanent account,
-- which is what every existing row is.
--
-- Nullable with NO default. A default would be written into the INSERT of every
-- staff row Prisma creates, which would make every real login look temporary
-- and expire the whole estate.

ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "previewExpiresAt" TIMESTAMP(3);

-- The session path filters on it on every request, and the demo screens count
-- staff that are NOT preview logins.
CREATE INDEX IF NOT EXISTS "staff_users_previewExpiresAt_idx"
  ON "staff_users" ("previewExpiresAt");

-- Check it. Expect both true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='staff_users'
            AND column_name='previewExpiresAt')            AS column_exists,
  (SELECT is_nullable = 'YES' AND column_default IS NULL
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='staff_users'
       AND column_name='previewExpiresAt')                 AS nullable_no_default;

-- Any preview logins currently issued, and whether they have lapsed.
-- Expect no rows on a fresh migration.
SELECT s."username", s."previewExpiresAt", r."name" AS storefront,
       (s."previewExpiresAt" <= now()) AS expired
FROM "staff_users" s
JOIN "restaurants" r ON r."id" = s."restaurantId"
WHERE s."previewExpiresAt" IS NOT NULL
ORDER BY s."previewExpiresAt";
