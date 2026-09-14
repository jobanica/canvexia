-- Global master switch for monthly order caps. Default FALSE = everyone gets
-- unlimited orders until the platform owner flips it on. Idempotent.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS "orderCapEnabled" boolean NOT NULL DEFAULT false;
