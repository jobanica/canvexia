-- SPLIT PAYMENTS AT THE COUNTER.
--
-- `pharmacy_sales.paymentMethod` is one string, which is the assumption that a
-- bill is settled by exactly one instrument. In a Philippine pharmacy that is
-- routinely false: ₱500 in cash and the rest on GCash is an ordinary Tuesday,
-- and a maintenance customer paying part cash part card is normal.
--
-- One row per tender, with the sale's own pharmacyId copied onto it so the
-- catalogue-driven policy in rls.sql picks it up like every other tenant table.
-- `paymentMethod` on the sale is KEPT and now means "the largest tender", so
-- every existing report and receipt keeps working unchanged.

CREATE TABLE IF NOT EXISTS pharmacy_sale_payments (
  -- text, not uuid: every id in this schema is a Prisma String.
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "pharmacyId"      text NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  "saleId"          text NOT NULL REFERENCES pharmacy_sales(id) ON DELETE CASCADE,
  method            text NOT NULL,
  "amountCentavos"  integer NOT NULL,
  -- A GCash or card reference, when the cashier has one to type.
  reference         text,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_sale_payments_amount_positive CHECK ("amountCentavos" > 0)
);

CREATE INDEX IF NOT EXISTS pharmacy_sale_payments_sale_idx
  ON pharmacy_sale_payments ("saleId");
CREATE INDEX IF NOT EXISTS pharmacy_sale_payments_pharmacy_idx
  ON pharmacy_sale_payments ("pharmacyId", "createdAt");
