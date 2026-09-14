-- Switch the live plan catalog to the new pricing:
--   Free   ₱0     (essentials, free forever)         — was "Starter"
--   Growth ₱899   (online ordering/marketing + AI    — was "Pro"
--                  menu import, adds custom domain)
--   Business ₱1,799 (every feature: accounting,        — unchanged name
--                  inventory + COGS, HR/payroll)
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent). Subscriptions
-- reference plans by id, so renaming a plan keeps every subscription intact —
-- and feature gating resolves the tier by plan name, so the rename is required.

-- 1) Rename + re-price + limits ---------------------------------------------
UPDATE "plans" SET
  "name" = 'Free',
  "priceMonthly" = 0,
  "limits" = '{"maxTables":5,"maxStaff":3,"smsIncluded":0}'::jsonb
  WHERE "name" = 'Starter';

UPDATE "plans" SET
  "name" = 'Growth',
  "priceMonthly" = 89900,
  "limits" = '{"maxTables":20,"maxStaff":15,"smsIncluded":200}'::jsonb
  WHERE "name" = 'Pro';

UPDATE "plans" SET
  "priceMonthly" = 179900,
  "limits" = '{"smsIncluded":1000}'::jsonb  -- unlimited tables & staff
  WHERE "name" = 'Business';

-- 2) Module entitlements -----------------------------------------------------
-- Growth = custom domain only (inventory / HR are Business-tier).
INSERT INTO "plan_modules" ("planId","module","enabled")
SELECT p.id, 'custom_domain'::"PlanModuleType", true
FROM "plans" p WHERE p."name" = 'Growth'
ON CONFLICT ("planId","module") DO UPDATE SET "enabled" = true;

UPDATE "plan_modules" SET "enabled" = false
WHERE "module" IN ('inventory','hris')
  AND "planId" IN (SELECT id FROM "plans" WHERE "name" = 'Growth');

-- Business = everything (inventory + HR + custom domain).
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

-- Free = no add-on modules.
UPDATE "plan_modules" SET "enabled" = false
WHERE "planId" IN (SELECT id FROM "plans" WHERE "name" = 'Free');
