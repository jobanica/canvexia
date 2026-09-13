-- Tutorial/course hub content for the platform (sections + YouTube videos),
-- shown at tutorials.<root>. Stored as JSON on the platform_settings singleton.
-- Best-effort read/write in code, so this can lag safely. Idempotent.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS "tutorials" jsonb;
