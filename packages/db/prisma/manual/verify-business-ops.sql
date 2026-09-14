-- Verify the business-operations layer landed correctly.
-- Run in the Supabase SQL editor after add-business-ops.sql and
-- backfill-business-ops.sql.
--
-- Returns ONE table. The editor only shows the last result set, so everything
-- is folded into a single report rather than a series of queries you'd never
-- see the output of.
--
-- Nothing here can abort on a missing object: a count against a table that
-- doesn't exist comes back NULL, so the report tells you WHAT is missing
-- instead of stopping at the first thing that is.
--
-- Read the `ok` column. NULL means "informational, no expected value".

-- Two session-local helpers. pg_temp is dropped when you close the editor tab;
-- nothing is created in public.
CREATE OR REPLACE FUNCTION pg_temp.cnt(q text) RETURNS bigint AS $fn$
DECLARE n bigint;
BEGIN
  EXECUTE q INTO n;
  RETURN n;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN NULL;   -- the object isn't there; that's the finding, not an error
END $fn$ LANGUAGE plpgsql;

-- Proves the event log works end to end, then removes the proof. Writes and
-- deletes exactly one row. If anything throws, the block rolls back — so a
-- failed smoke test cannot leave a stray row behind.
CREATE OR REPLACE FUNCTION pg_temp.smoke() RETURNS boolean AS $fn$
DECLARE rid text; n int;
BEGIN
  IF to_regclass('public.customer_events') IS NULL THEN RETURN NULL; END IF;
  SELECT "id" INTO rid FROM "restaurants" LIMIT 1;
  INSERT INTO "customer_events" ("id","eventType","restaurantId","meta")
  VALUES (gen_random_uuid()::text, 'note', rid, '{"kind":"verify"}'::jsonb);
  SELECT count(*) INTO n FROM "customer_events" WHERE "meta"->>'kind' = 'verify';
  DELETE FROM "customer_events" WHERE "meta"->>'kind' = 'verify';
  RETURN n >= 1;
EXCEPTION WHEN others THEN
  RETURN false;
END $fn$ LANGUAGE plpgsql;

WITH v AS (SELECT
  (to_regclass('public.customer_events') IS NOT NULL)::int          AS t_events,
  (to_regclass('public.ad_spend')        IS NOT NULL)::int          AS t_ad_spend,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='crm_clients'
       AND column_name IN ('restaurantId','materialsAt','productionAt',
                           'previewSentAt','paidAt','activatedAt',
                           'assignedTo','lostReason'))              AS crm_cols,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
     AND indexname IN ('customer_events_restaurantId_occurredAt_idx',
                       'customer_events_leadId_occurredAt_idx',
                       'customer_events_eventType_occurredAt_idx',
                       'ad_spend_spendDate_idx',
                       'crm_clients_restaurantId_idx'))             AS idx,
  -- The hard constraint was "must not affect the running system". A NOT NULL
  -- or a default on an added crm_clients column is written into the INSERT of
  -- every new client by Prisma, and would break adding one. Must be 0.
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='crm_clients'
       AND column_name IN ('restaurantId','materialsAt','productionAt',
                           'previewSentAt','paidAt','activatedAt',
                           'assignedTo','lostReason')
       AND (is_nullable <> 'YES' OR column_default IS NOT NULL))    AS unsafe_cols,
  ((to_regclass('public.orders')              IS NOT NULL)::int
  +(to_regclass('public.restaurants')         IS NOT NULL)::int
  +(to_regclass('public.activation_requests') IS NOT NULL)::int
  +(to_regclass('public.crm_clients')         IS NOT NULL)::int
  +(to_regclass('public.storefront_settings') IS NOT NULL)::int)    AS live_tables
),
b AS (SELECT
  pg_temp.cnt('SELECT count(*) FROM "crm_clients" WHERE "restaurantId" IS NOT NULL')   AS linked,
  pg_temp.cnt('SELECT count(*) FROM "restaurants" WHERE "status" = ''active''')        AS active_shops,
  pg_temp.cnt('SELECT count(*) FROM "crm_clients" WHERE "source" = ''backfill''')      AS backfilled,
  pg_temp.cnt('SELECT count(*) FROM "crm_clients" c WHERE c."restaurantId" IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM "restaurants" r WHERE r."id" = c."restaurantId")') AS orphans,
  pg_temp.cnt('SELECT count(*) FROM "crm_clients" WHERE "source" = ''backfill''
                 AND ("paidAt" = "createdAt" OR "activatedAt" = "createdAt")')         AS invented
),
d AS (SELECT
  pg_temp.cnt('SELECT count(*) FROM "restaurants" WHERE "status" = ''preview''')       AS previews,
  pg_temp.cnt('SELECT count(*) FROM "restaurants" r WHERE r."status" = ''preview''
                 AND EXISTS (SELECT 1 FROM "menu_items" m WHERE m."restaurantId" = r."id")') AS diy,
  pg_temp.cnt('SELECT count(*) FROM "crm_clients" WHERE "stage" NOT IN (''won'',''lost'')')  AS outreach,
  pg_temp.cnt('SELECT count(*) FROM "activation_requests" WHERE "paidAt" IS NOT NULL') AS paid_act,
  pg_temp.cnt('SELECT coalesce(sum("amount"),0) FROM "activation_requests" WHERE "paidAt" IS NOT NULL') AS act_centavos,
  pg_temp.cnt('SELECT count(*) FROM "addon_purchases" WHERE "status" = ''paid''')      AS unlocks,
  pg_temp.cnt('SELECT count(*) FROM "feature_subscriptions" WHERE "status" = ''active''') AS subs,
  pg_temp.cnt('SELECT count(*) FROM "customer_events"')                                AS events,
  pg_temp.cnt('SELECT count(*) FROM "ad_spend"')                                       AS ad_rows
),
s AS (SELECT pg_temp.smoke() AS wrote)
SELECT * FROM (
  SELECT  1 AS n, '1. exists' AS part, 'table customer_events' AS item, v.t_events::text AS value, '1' AS expect, v.t_events = 1 AS ok FROM v
  UNION ALL SELECT  2, '1. exists', 'table ad_spend',               v.t_ad_spend::text,   '1', v.t_ad_spend = 1   FROM v
  UNION ALL SELECT  3, '1. exists', 'crm_clients new columns',      v.crm_cols::text,     '8', v.crm_cols = 8     FROM v
  UNION ALL SELECT  4, '1. exists', 'indexes created',              v.idx::text,          '5', v.idx = 5          FROM v
  UNION ALL SELECT  5, '2. safe',   'crm columns NOT NULL/default', v.unsafe_cols::text,  '0', v.unsafe_cols = 0  FROM v
  UNION ALL SELECT  6, '2. safe',   'live tables intact',           v.live_tables::text,  '5', v.live_tables = 5  FROM v
  UNION ALL SELECT  7, '3. backfill','leads linked >= active shops',
                        b.linked::text || ' / ' || b.active_shops::text, 'linked >= shops', b.linked >= b.active_shops FROM b
  UNION ALL SELECT  8, '3. backfill','leads from the backfill',     b.backfilled::text,   '',  NULL::boolean      FROM b
  UNION ALL SELECT  9, '3. backfill','orphaned links',              b.orphans::text,      '0', b.orphans = 0      FROM b
  UNION ALL SELECT 10, '3. backfill','fabricated timestamps',       b.invented::text,     '0', b.invented = 0     FROM b
  UNION ALL SELECT 11, '4. data',   'previews total',               d.previews::text,     '',  NULL::boolean      FROM d
  UNION ALL SELECT 12, '4. data',   'follow-ups: DIY previews',     d.diy::text,          '',  NULL::boolean      FROM d
  UNION ALL SELECT 13, '4. data',   'follow-ups: outreach',         d.outreach::text,     '',  NULL::boolean      FROM d
  UNION ALL SELECT 14, '4. data',   'paid activations',             d.paid_act::text,     '',  NULL::boolean      FROM d
  UNION ALL SELECT 15, '4. data',   'activation revenue (centavos)',d.act_centavos::text, '',  NULL::boolean      FROM d
  UNION ALL SELECT 16, '4. data',   'paid unlocks',                 d.unlocks::text,      '',  NULL::boolean      FROM d
  UNION ALL SELECT 17, '4. data',   'live subscriptions',           d.subs::text,         '',  NULL::boolean      FROM d
  UNION ALL SELECT 18, '4. data',   'events logged',                d.events::text,       '',  NULL::boolean      FROM d
  UNION ALL SELECT 19, '4. data',   'ad spend rows',                d.ad_rows::text,      '',  NULL::boolean      FROM d
  UNION ALL SELECT 20, '5. smoke',  'event write works',            s.wrote::text,     'true', s.wrote            FROM s
) report ORDER BY n;
