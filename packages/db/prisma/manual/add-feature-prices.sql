-- Per-feature one-time unlock pricing, edited in super-admin → Feature pricing.
-- Shape: { "<featureKey>": { "price": <centavos>, "enabled": <bool> }, ... }
-- Read/written best-effort, so this can lag safely. Idempotent.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS "featurePrices" jsonb;
