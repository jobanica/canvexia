-- Free tier includes only 1 dine-in QR table (was 5). This sets the enforced
-- limit + the number shown on the pricing comparison, both of which read the
-- Free plan's stored limits. Run in the Supabase SQL editor. Safe to re-run.
--
-- (You can also do this in Super-admin → Plans → edit Free → Max tables = 1.)

UPDATE "plans"
SET "limits" = jsonb_set(COALESCE("limits", '{}'::jsonb), '{maxTables}', '1'::jsonb, true)
WHERE "name" = 'Free';
