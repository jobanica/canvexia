-- CANVEXIA HQ Admin, Phase H5: the editable half of the product registry.
--
-- Run AFTER add-hq-admin.sql, then `pnpm --filter @servd/db db:rls`. Idempotent.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS TABLE IS, AND WHAT IT IS NOT.
--
-- `packages/core/src/products/registry.ts` stays the SOURCE OF TRUTH for which
-- products exist and which are `live`. This table OVERLAYS the editable fields
-- on top of it. A product cannot be created from HQ and that is deliberate:
-- `live: false` exists to stop the portal offering a merchant an account in
-- something that cannot create one, and a database-driven registry could name a
-- product with no adapter behind it — which is exactly the failure that flag
-- was written to prevent. Adding a vertical is a code change with an adapter in
-- it (docs/canvexia/adding-a-vertical.md).
--
-- So: `status`, the training URL and the demo-account REFERENCE are HQ's to
-- edit. `id` and `live` are not.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_settings" (
    -- Matches a key in the registry. A row for an unknown product is ignored on
    -- read rather than rejected here — the registry can shrink between a deploy
    -- and this table being tidied.
    "productId"       TEXT NOT NULL,
    -- "live" | "beta" | "coming". Presentation only: whether a merchant can
    -- actually be provisioned is the registry's `live`, which this cannot
    -- override. A product marked "live" here with live:false in code shows as
    -- coming soon, because the code wins.
    "status"          TEXT NOT NULL DEFAULT 'coming',
    "trainingUrl"     TEXT,
    -- A REFERENCE, never the credential. "1Password → CANVEXIA → Resceta demo"
    -- is the kind of value this holds. The brief asks for the reference and not
    -- the secret, and the column being TEXT with this name is the only thing
    -- stopping somebody pasting a password into it — so it is said here.
    "demoAccountRef"  TEXT,
    -- Whether a new partner gets this product enabled without being asked.
    "defaultEnabled"  BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_settings_pkey" PRIMARY KEY ("productId")
);

DO $$ BEGIN
  ALTER TABLE "product_settings"
    ADD CONSTRAINT "product_settings_status_check"
    CHECK ("status" IN ('live', 'beta', 'coming'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed the two products that exist today. Servd has paying customers; Resceta
-- is provisionable and has none yet — which is what "beta" means here.
INSERT INTO "product_settings" ("productId", "status", "defaultEnabled", "updatedAt")
VALUES ('servd', 'live', true, CURRENT_TIMESTAMP),
       ('pharmacy', 'beta', false, CURRENT_TIMESTAMP)
ON CONFLICT ("productId") DO NOTHING;

-- ----------------------------------------------------------------------------
-- RLS.
--
-- Readable in any app context: the partner portal's product picker needs the
-- status and the training URL. Writable only by HQ.
--
-- `demoAccountRef` is readable alongside the rest, and that is acceptable
-- BECAUSE it is a reference rather than a credential — "ask ops for the Resceta
-- demo login" tells a partner nothing they could not have asked for. If a
-- secret is ever put in that column this policy becomes wrong, which is why the
-- column comment says not to.
-- ----------------------------------------------------------------------------
ALTER TABLE "product_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_read"  ON "product_settings";
DROP POLICY IF EXISTS "product_write" ON "product_settings";
DROP POLICY IF EXISTS "super_only"    ON "product_settings";
CREATE POLICY "product_read" ON "product_settings" FOR SELECT USING (true);
CREATE POLICY "product_write" ON "product_settings" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
REVOKE ALL ON "product_settings" FROM anon;
REVOKE ALL ON "product_settings" FROM authenticated;

-- ----------------------------------------------------------------------------
-- `plans` needs NOTHING here. rls.sql already gives it `plans_read` (readable
-- in any app context, because the partner pricing screen reads the catalogue
-- and the floor) and `plans_write` (HQ only).
--
-- An earlier cut of this file added `plan_read`/`plan_write` with the same
-- semantics under different names, which left four policies on one table doing
-- the work of two. Policies are OR'd, so it was harmless and unreadable — and
-- the next person would have had to prove that before trusting either pair.
-- The names below are dropped for that reason, not because they were wrong.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "plan_read"  ON "plans";
DROP POLICY IF EXISTS "plan_write" ON "plans";
