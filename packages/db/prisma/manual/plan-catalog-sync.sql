-- Align the live plan catalog (prices, limits, add-on module entitlements) with
-- src/lib/billing/catalog.ts. Run in the Supabase SQL editor. Safe to re-run.
--
-- Tiers: Starter ₱1,999 (essentials) → Pro ₱2,999 (adds custom domain + online
-- ordering/marketing) → Business ₱4,999 (every feature).

-- 1) Prices + limits ---------------------------------------------------------
UPDATE "plans" SET "priceMonthly" = 99900,
  "limits" = '{"maxTables":10,"maxStaff":5,"smsIncluded":0}'::jsonb
  WHERE "name" = 'Starter';

UPDATE "plans" SET "priceMonthly" = 299900,
  "limits" = '{"maxTables":30,"maxStaff":20,"smsIncluded":200}'::jsonb
  WHERE "name" = 'Pro';

UPDATE "plans" SET "priceMonthly" = 349900,
  "limits" = '{"smsIncluded":1000}'::jsonb  -- unlimited tables & staff
  WHERE "name" = 'Business';

-- 2) Module entitlements -----------------------------------------------------
-- Pro = custom domain only (inventory / HR are Business-tier)
INSERT INTO "plan_modules" ("planId","module","enabled")
SELECT p.id, 'custom_domain'::"PlanModuleType", true
FROM "plans" p WHERE p."name" = 'Pro'
ON CONFLICT ("planId","module") DO UPDATE SET "enabled" = true;

UPDATE "plan_modules" SET "enabled" = false
WHERE "module" IN ('inventory','hris')
  AND "planId" IN (SELECT id FROM "plans" WHERE "name" = 'Pro');

-- Business = everything (inventory + HR + custom domain)
INSERT INTO "plan_modules" ("planId","module","enabled")
SELECT p.id, m.module, true
FROM "plans" p
CROSS JOIN (VALUES
  ('inventory'::"PlanModuleType"),
  ('hris'::"PlanModuleType"),
  ('custom_domain'::"PlanModuleType")
) AS m(module)
WHERE p."name" = 'Business'
ON CONFLICT ("planId","module") DO UPDATE SET "enabled" = true;

-- Starter = no add-on modules
UPDATE "plan_modules" SET "enabled" = false
WHERE "planId" IN (SELECT id FROM "plans" WHERE "name" = 'Starter');
