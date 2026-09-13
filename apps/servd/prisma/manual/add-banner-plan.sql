-- Plan-banner override. NULL = derive the banner plan from the subscription
-- tier + trial. "legacy" = grandfathered (no banner ever). "lite" = the hidden
-- 300-order save offer. Idempotent.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS "bannerPlan" text;
