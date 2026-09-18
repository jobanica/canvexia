-- HOW FAR AHEAD THE EXPIRY ALERT LOOKS.
--
-- 90 days was hard-coded. That is a reasonable default and a bad constant: a
-- pharmacy whose supplier delivers quarterly needs longer notice than one
-- restocked weekly, and "alert me at 180 days" is a decision about their own
-- working capital, not about this software.
--
-- Bounded 7..730 in the input layer rather than here: a CHECK that rejects the
-- save is a worse experience than a field that says what it accepts.
ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS "expiryAlertDays" integer NOT NULL DEFAULT 90;

-- WHEN STOCK COUNTS AS DEAD. Never sold, or not sold in this many days, while
-- still sitting on the shelf. 90 days by default — a quarter with no movement
-- is the point at which a pharmacist wants to be asked about it.
ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS "deadStockDays" integer NOT NULL DEFAULT 90;
