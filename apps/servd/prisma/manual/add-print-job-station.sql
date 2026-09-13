-- A second printer: which one is a queued job for?
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Only needed by restaurants that run a separate KITCHEN printer on the cloud
-- (poll) transport — that's how the poll endpoint tells a kitchen docket from
-- the till's receipt. A kitchen printer on the network transport doesn't need
-- this at all: the bytes are POSTed straight to its own bridge agent.
--
-- Nullable, no default. Null means the till, which is what every job already
-- queued was. A DEFAULT would be sent by Prisma on every insert and break
-- printing on a database that hasn't run this yet.

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "station" TEXT;

-- Existing jobs are all the till's. Left as NULL rather than backfilled: the
-- poll endpoint reads NULL as the till, and rewriting history buys nothing.

-- Pulling the next job is now filtered by station as well as status.
CREATE INDEX IF NOT EXISTS "print_jobs_restaurantId_status_station_idx"
  ON "print_jobs" ("restaurantId", "status", "station");
