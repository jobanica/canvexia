-- Table QR codes become a one-time paid unlock, and everyone who was already
-- here keeps unlimited.
--
-- From now on a new account gets its counter QR plus ONE table QR free, and
-- more is a one-time purchase. Nobody who already built their floor plan on
-- unlimited QRs loses anything.
--
-- THE BACKFILL RUNS EXACTLY ONCE. It's wrapped in a check for whether the
-- column already existed, because a plain "UPDATE restaurants SET
-- qrGrandfathered = true" is only correct the first time — re-run it a month
-- later and every account signed up in between is silently given the paid
-- feature for nothing. Re-running this file is a no-op.
--
-- Run in the Supabase SQL editor.

DO $$
DECLARE had_column boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurants' AND column_name = 'qrGrandfathered'
  ) INTO had_column;

  IF NOT had_column THEN
    ALTER TABLE "restaurants"
      ADD COLUMN "qrGrandfathered" BOOLEAN NOT NULL DEFAULT false;

    -- Every account that exists at this moment, and only those.
    UPDATE "restaurants" SET "qrGrandfathered" = true;

    RAISE NOTICE 'Grandfathered % existing restaurants.', (SELECT count(*) FROM "restaurants");
  ELSE
    RAISE NOTICE 'qrGrandfathered already present — backfill skipped (this is correct).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Check it. Grandfathered should equal the number of accounts you had before
-- this ran; anything signed up afterwards shows as not grandfathered.
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE "qrGrandfathered")     AS grandfathered,
  count(*) FILTER (WHERE NOT "qrGrandfathered") AS on_the_new_rules,
  count(*)                                      AS total
FROM "restaurants";
