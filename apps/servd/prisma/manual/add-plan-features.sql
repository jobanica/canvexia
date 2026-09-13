-- Per-plan feature control: the super-admin toggles which gateable features each
-- plan grants, and entitlements resolve live from this column. Run in the
-- Supabase SQL editor. Idempotent.

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "features" TEXT[] NOT NULL DEFAULT '{}';

-- Seed the standard tiers so they keep their current entitlements (only when not
-- already configured). Free has no gated features (its core capabilities are
-- never gated), so it stays empty.
UPDATE "plans"
SET "features" = ARRAY[
  'onlineOrdering','onlinePayments','loyalty','promotions','customers','sms',
  'aiMenuImport','floorPlan','giftCards','reservations','dataExport','customDomain'
]
WHERE "name" = 'Growth' AND cardinality("features") = 0;

UPDATE "plans"
SET "features" = ARRAY[
  'onlineOrdering','onlinePayments','loyalty','promotions','customers','sms',
  'aiMenuImport','floorPlan','giftCards','reservations','dataExport','customDomain',
  'auditLog','offline','accounting','inventory','hr','whiteLabel'
]
WHERE "name" = 'Business' AND cardinality("features") = 0;
