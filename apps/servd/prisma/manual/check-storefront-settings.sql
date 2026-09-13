-- ============================================================================
-- READ-ONLY. Which shops lost their storefront settings?
-- ============================================================================
--
-- A bad read made the settings page prefill from DEFAULTS instead of a shop's
-- saved configuration. Anyone who pressed Save on that page wrote the blanks
-- back over their real payment and delivery setup.
--
-- This finds the accounts whose config now looks blank. It changes nothing.
-- ============================================================================

-- 0a. THE TIGHT LIST. This is the one to act on.
--
--     A shop that never opened the payment/delivery section has NULL in those
--     columns: the first save writes only hours/zones/pauseWhenClosed, and
--     paymentConfig and deliveryConfig are written by a second statement.
--
--     So "the column is NOT NULL but everything in it is off/zero" means the
--     config was WRITTEN and is now blank — which is exactly the shape the
--     defaults-overwrite leaves, and it excludes every shop that simply never
--     set delivery up. That is the difference between a list of 100 and a list
--     you can act on.
SELECT count(*)                                  AS likely_wiped,
       string_agg(r.slug, ', ' ORDER BY r.slug)  AS slugs
FROM restaurants r
JOIN storefront_settings s ON s."restaurantId" = r.id
WHERE r.status = 'active'
  AND s."paymentConfig" IS NOT NULL
  AND s."deliveryConfig" IS NOT NULL
  AND coalesce((s."paymentConfig"->>'gcashEnabled')::boolean, false) = false
  AND coalesce((s."paymentConfig"->>'mayaEnabled')::boolean,  false) = false
  AND coalesce((s."paymentConfig"->>'bankEnabled')::boolean,  false) = false
  AND coalesce(s."paymentConfig"->>'gcashNumber', '') = ''
  AND coalesce(s."paymentConfig"->>'gcashQrUrl',  '') = ''
  AND coalesce((s."deliveryConfig"->>'baseFee')::numeric, 0) = 0
  AND coalesce((s."deliveryConfig"->>'perKm')::numeric, 0) = 0
  AND jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) = 0;

-- 0b. THE ONE-ROW ANSWER. Start here — it fits on a phone, and the slug list is
--    exactly what the restore query needs pasting into it.
SELECT count(*)                                  AS wiped_shops,
       string_agg(r.slug, ', ' ORDER BY r.slug)  AS slugs
FROM restaurants r
JOIN storefront_settings s ON s."restaurantId" = r.id
WHERE r.status = 'active'
  AND coalesce((s."paymentConfig"->>'gcashEnabled')::boolean, false) = false
  AND coalesce((s."paymentConfig"->>'mayaEnabled')::boolean,  false) = false
  AND coalesce((s."paymentConfig"->>'bankEnabled')::boolean,  false) = false
  AND coalesce((s."deliveryConfig"->>'baseFee')::numeric, 0) = 0
  AND jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) = 0;

-- 1. Accounts whose payment/delivery config reads as empty or missing.
--    "looks_wiped" = no payment method switched on AND no delivery pricing set,
--    which is what a defaults-overwrite leaves behind.
-- NOTE: storefront_settings carries no timestamps, so there is no way to tell
-- WHEN a shop last saved. r."updatedAt" is the restaurant row and moves for all
-- sorts of reasons, so it's a weak hint at best — judge by the config itself,
-- and by asking the owner whether they had it set up.
SELECT r.name,
       r.slug,
       r."updatedAt"                                          AS restaurant_touched,
       coalesce(s."paymentConfig"->>'gcashEnabled',  'null')  AS gcash,
       coalesce(s."paymentConfig"->>'mayaEnabled',   'null')  AS maya,
       coalesce(s."paymentConfig"->>'bankEnabled',   'null')  AS bank,
       coalesce(s."deliveryConfig"->>'mode',         'null')  AS delivery_mode,
       coalesce(s."deliveryConfig"->>'baseFee',      'null')  AS base_fee,
       jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) AS zones,
       (
         coalesce((s."paymentConfig"->>'gcashEnabled')::boolean, false) = false
         AND coalesce((s."paymentConfig"->>'mayaEnabled')::boolean, false) = false
         AND coalesce((s."paymentConfig"->>'bankEnabled')::boolean, false) = false
         AND coalesce((s."deliveryConfig"->>'baseFee')::numeric, 0) = 0
         AND jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) = 0
       ) AS looks_wiped
FROM restaurants r
JOIN storefront_settings s ON s."restaurantId" = r.id
WHERE r.status = 'active'
ORDER BY looks_wiped DESC, r."updatedAt" DESC;

-- 2. The same, as a count — how many active shops are affected.
SELECT count(*) FILTER (WHERE wiped)     AS looks_wiped,
       count(*) FILTER (WHERE NOT wiped) AS looks_fine,
       count(*)                          AS total
FROM (
  SELECT (
    coalesce((s."paymentConfig"->>'gcashEnabled')::boolean, false) = false
    AND coalesce((s."paymentConfig"->>'mayaEnabled')::boolean, false) = false
    AND coalesce((s."paymentConfig"->>'bankEnabled')::boolean, false) = false
    AND coalesce((s."deliveryConfig"->>'baseFee')::numeric, 0) = 0
    AND jsonb_array_length(coalesce(s."deliveryZones", '[]'::jsonb)) = 0
  ) AS wiped
  FROM restaurants r
  JOIN storefront_settings s ON s."restaurantId" = r.id
  WHERE r.status = 'active'
) t;

-- 3. Is the column that caused this present yet?
--    If FALSE, run add-orders-paused.sql — with the code fix deployed the app
--    is safe either way, but the pause toggle needs it.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'storefront_settings' AND column_name = 'ordersPaused'
) AS orders_paused_column;
