-- Distance-based delivery fee. As an alternative to fixed zones, the owner can
-- pin the store location and set base fee + per-km rate (with a free radius,
-- minimum, max range, and a road-distance factor). The website computes the fee
-- live from the customer's pinned location. Stored as JSON on storefront_settings.
-- Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "deliveryConfig" JSONB;
