-- CANVEXIA — the public site's two tables: territories and the partner waitlist.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- `public`, like every other table here. The brief asked for a `core` schema;
-- this schema has no multiSchema preview feature and no @@schema annotations,
-- so a second schema would mean enabling a preview feature and annotating all
-- ~100 existing models on a live database, for a naming preference.
--
-- NEITHER TABLE GETS AN `anon` GRANT OR POLICY, and the policies at the bottom
-- are the reason this file spells them out rather than leaving them to rls.sql's
-- backstop: the backstop would produce exactly these, and writing them here
-- means the lock arrives with the table instead of one command later.
--
-- The brief asked for "anon can INSERT only". This is stronger. Every write
-- goes through a server action (the brief's own rule: no client-side Supabase
-- writes), so `anon` needs no grant at all — and `anon` holding INSERT on a
-- table of names, emails and mobile numbers is the exact shape of the hole D27
-- found on prospect_leads. A grant nobody uses is a grant nobody notices.

DO $$ BEGIN
  CREATE TYPE "TerritoryTier" AS ENUM ('small', 'mid', 'large', 'hq');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TerritoryStatus" AS ENUM ('available', 'reserved', 'taken', 'hq');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The labels are the answers as a person would say them, which is why they
-- contain '<' and '+'. Prisma @map carries them; nothing does arithmetic on
-- them.
DO $$ BEGIN
  CREATE TYPE "WaitlistHours" AS ENUM ('<5', '5-10', '10-20', '20+');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WaitlistStatus" AS ENUM ('new', 'contacted', 'shortlisted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "territories" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "province"   TEXT NOT NULL,
    "region"     TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "tier"       "TerritoryTier" NOT NULL,
    -- Whole pesos, not centavos. A licence fee is quoted in pesos and is never
    -- added to a money column elsewhere; storing centavos here would invite
    -- someone to sum it into a centavos total by mistake.
    "licenseFee" INTEGER NOT NULL,
    "status"     "TerritoryStatus" NOT NULL DEFAULT 'available',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

-- The slug carries the province ("davao-city-davao-del-sur"), because San
-- Fernando is a city in Pampanga, in La Union and in Cebu, and two of them are
-- on the tier list.
CREATE UNIQUE INDEX IF NOT EXISTS "territories_slug_key" ON "territories"("slug");
CREATE INDEX IF NOT EXISTS "territories_tier_idx" ON "territories"("tier");
CREATE INDEX IF NOT EXISTS "territories_status_idx" ON "territories"("status");

CREATE TABLE IF NOT EXISTS "partner_waitlist" (
    "id"           TEXT NOT NULL,
    "fullName"     TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "mobile"       TEXT NOT NULL,
    -- Free text on purpose. A city that is not in `territories` is the most
    -- useful row in the table: it says where demand is that the tier list has
    -- not reached. HQ maps it to a territory later, or adds the territory.
    "city"         TEXT NOT NULL,
    "province"     TEXT,
    "currentWork"  TEXT,
    "hoursPerWeek" "WaitlistHours" NOT NULL,
    "soldBefore"   BOOLEAN NOT NULL,
    "soldWhat"     TEXT,
    "howHeard"     TEXT,
    "source"       TEXT NOT NULL DEFAULT 'www',
    "status"       "WaitlistStatus" NOT NULL DEFAULT 'new',
    "territoryId"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_waitlist_pkey" PRIMARY KEY ("id")
);

-- (city, createdAt): the success state tells an applicant they are Nth in their
-- city, which counts rows for one city in arrival order.
CREATE INDEX IF NOT EXISTS "partner_waitlist_city_createdAt_idx" ON "partner_waitlist"("city", "createdAt");
CREATE INDEX IF NOT EXISTS "partner_waitlist_status_idx" ON "partner_waitlist"("status");
CREATE INDEX IF NOT EXISTS "partner_waitlist_territoryId_idx" ON "partner_waitlist"("territoryId");

-- SET NULL, not CASCADE: retiring a territory must not delete the people who
-- asked for it.
DO $$ BEGIN
  ALTER TABLE "partner_waitlist"
    ADD CONSTRAINT "partner_waitlist_territoryId_fkey"
    FOREIGN KEY ("territoryId") REFERENCES "territories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Platform-only, both tables. FORCE so that even the owning role — the role
-- Prisma connects as — is subject to the policy; without FORCE the owner
-- silently bypasses RLS and the lock is decoration.
ALTER TABLE "territories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "territories";
CREATE POLICY super_only ON "territories" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "partner_waitlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_waitlist" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "partner_waitlist";
CREATE POLICY super_only ON "partner_waitlist" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

-- Belt and braces on the part that would leak: Supabase grants `anon` full DML
-- on public by default, and the anon key ships in every browser. The policies
-- above already refuse it, but REVOKE means a future policy written in a hurry
-- cannot hand it back by accident.
REVOKE ALL ON "partner_waitlist" FROM anon;
REVOKE ALL ON "territories" FROM anon;
