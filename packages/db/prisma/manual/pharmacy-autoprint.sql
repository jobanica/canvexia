-- PRINT THE RECEIPT WHEN THE SALE SETTLES.
--
-- REPORTED — "i tried the sale, i dont see receipt printing it. it should auto
-- print."
--
-- DEFAULT TRUE, because a pharmacy is legally expected to hand over a receipt
-- and a till that waits to be asked is a till that forgets. A pharmacy testing
-- on a laptop with no printer attached can turn it off, which is the only
-- reason this is a column rather than a constant.
--
-- The twin of Restaurant.autoPrintReceipt in the same database, on purpose: the
-- two products should not disagree about whether a receipt prints itself.

ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS "autoPrintReceipt" boolean NOT NULL DEFAULT true;
