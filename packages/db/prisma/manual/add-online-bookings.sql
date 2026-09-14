-- Booking ahead from the online website — table reservations AND advance food
-- orders (order now, pick it up / get it delivered on a future date/time).
-- Small, idempotent additions:
--   1. storefront_settings.acceptsBookings — the admin's on/off switch.
--   2. reservations.source — marks a booking as self-served from the website.
--   3. orders.scheduledFor — an online order's requested future time (null = ASAP).
-- The reservations table itself comes from add-reservations.sql — run that too
-- if you haven't. Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "acceptsBookings" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "reservations"
  ADD COLUMN IF NOT EXISTS "source" TEXT;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);

-- Advance-order approval + downpayment.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT;              -- awaiting | approved | declined
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "downpaymentAmount" INTEGER;        -- centavos required up-front
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "downpaymentRef" TEXT;              -- customer's payment reference
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "downpaymentPaid" BOOLEAN NOT NULL DEFAULT false;

-- Downpayment / approval config for the storefront ({ requireDownpayment, ... }).
ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "bookingConfig" JSONB;
