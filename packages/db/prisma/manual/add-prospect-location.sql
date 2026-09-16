-- A7.4 follow-up: where a prospect actually is, learned from the first visit.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- THE PROBLEM. `prospects` carries an ADDRESS STRING and nothing geocodes it,
-- so `subjectLocation` has always returned null for a prospect and every
-- prospect visit has been flagged `no_address` — the distance check could not
-- run even in principle. And operators do not have addresses on file anyway:
-- a salesperson walking into a carinderia they have never seen IS how the
-- business gets discovered, so there is nothing to check against on the first
-- visit by definition.
--
-- THE FIX. The first visit records where it happened, and that becomes the
-- business's location. Visit two onwards can then be checked against visit one
-- — which is the honest version of the question anyway: "were they where they
-- said they were last time?"
--
-- NOT A REPLACEMENT FOR THE PHOTO. The first visit still cannot be verified by
-- location, because there is nothing to compare it to; the photo is what stands
-- for that one. This only stops every LATER visit from being unverifiable too.
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "latitude"  DOUBLE PRECISION;
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
/* When the coordinates were captured, and from which visit. Evidence, not
   decoration: "this address came from Ana's visit on the 16th" is answerable,
   and a wrong pin can be traced to the visit that set it. */
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "locatedAt"      TIMESTAMP(3);
ALTER TABLE "prospects" ADD COLUMN IF NOT EXISTS "locatedByVisit" TEXT;
