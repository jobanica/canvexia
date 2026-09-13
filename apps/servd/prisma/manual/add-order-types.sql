-- Two more order types: pickup (ordered ahead, collecting) and third_party
-- (Grab / Foodpanda). Takeout keeps its meaning — ordered at the counter and
-- taken away — which is a genuinely different job for the kitchen than a bag
-- assembled ahead of a rider arriving.
--
-- Run in the Supabase SQL editor. Idempotent, and safe to run while live:
-- adding enum values never rewrites existing rows.
--
-- NOTE: existing rows keep whatever they have. Orders placed through the online
-- storefront before this ran are recorded as 'takeout' even though the site
-- called them "Pickup" — they are historical and are left alone rather than
-- rewritten underneath the reports that already counted them.

ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'pickup';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'third_party';
