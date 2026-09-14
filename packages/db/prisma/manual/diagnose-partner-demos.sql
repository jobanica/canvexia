-- ============================================================================
-- READ-ONLY. Changes nothing. Safe to run any time.
-- ============================================================================
--
-- "The partner can't see the Convert button." This tells you why.
--
-- RUN PART 1 ON ITS OWN FIRST. If it reports that `partners` doesn't exist,
-- stop — run add-partner-program.sql, then come back. Parts 2-4 read those
-- tables, and Postgres aborts the whole script on the first missing one, so
-- running everything at once just gives you `relation "partners" does not
-- exist` and no other answers.
-- ============================================================================

-- ============================ PART 1 — run alone ============================

-- 1. Is everything the partner portal needs actually here?
--    All four come from add-partner-program.sql. A missing `partners` table or
--    a missing demoPartnerId column means the portal shows nothing at all.
SELECT 'partners (table)' AS needs,
       to_regclass('public.partners') IS NOT NULL AS present
UNION ALL
SELECT 'program_settings (table)',
       to_regclass('public.program_settings') IS NOT NULL
UNION ALL
SELECT 'restaurants.demoPartnerId',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'restaurants' AND column_name = 'demoPartnerId'
       )
UNION ALL
SELECT 'staff_users.username',
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'staff_users' AND column_name = 'username'
       );

-- ===================== PARTS 2-4 — only once Part 1 is all `true` ===========

-- 2. Which partners exist, and are they approved? An unapproved partner sees
--    the "application under review" screen instead of a dashboard.
SELECT id, name, email, status, tier, "createdAt"
FROM partners
ORDER BY "createdAt" DESC;

-- 3. Every storefront, and who it belongs to.
--    demo_partner IS NULL  → built from super-admin. NO partner can see it,
--                            so no partner can convert it.
--    has_login = true      → already a real account; the button is gone by
--                            design (it's been converted already).
SELECT r.name,
       r.slug,
       r.status,
       r."demoPartnerId" AS demo_partner,
       p.name            AS partner_name,
       EXISTS (SELECT 1 FROM staff_users s WHERE s."restaurantId" = r.id) AS has_login,
       r."createdAt"
FROM restaurants r
LEFT JOIN partners p ON p.id = r."demoPartnerId"
ORDER BY r."createdAt" DESC
LIMIT 50;

-- 4. The summary that answers the question directly: per partner, how many of
--    their storefronts SHOULD be showing a Convert button right now.
SELECT p.name AS partner,
       p.status,
       count(r.id) AS storefronts,
       count(r.id) FILTER (
         WHERE NOT EXISTS (SELECT 1 FROM staff_users s WHERE s."restaurantId" = r.id)
       ) AS awaiting_convert
FROM partners p
LEFT JOIN restaurants r ON r."demoPartnerId" = p.id
GROUP BY p.name, p.status
ORDER BY p.name;
