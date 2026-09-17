-- ============================================================================
-- A MERCHANT'S MESSAGE REACHES WHOEVER SOLD THEM THE SOFTWARE.
--
-- REPORTED — "yes build the feedback inbox to partners."
--
-- `platform_feedback` was written when there was one vendor. A shop in Tagum
-- taps "Send feedback" in their dashboard and the row lands in Servd's
-- super-admin list, where nobody at their partner can see it and nobody at
-- Servd knows the shop. The partner they signed with, pay every month, and
-- would ring first never learns they wrote.
--
-- Two columns, both nullable, because both answers are real:
--
--   "partnerId"          who the message is FOR. Null means Servd sold this
--                        shop directly, which is the original behaviour and
--                        stays exactly as it was.
--   "repliedByPartnerId" who ANSWERED it. Null with a reply present means
--                        Servd answered. Without this column a partner's reply
--                        and Servd's are indistinguishable, and the merchant
--                        reading it cannot tell who they are talking to.
--
-- STAMPED, NOT JOINED. `restaurants."partnerId"` can change — HQ reassigns a
-- merchant between partners — and a message belongs to the partner who was
-- responsible when it was sent. Resolving it through a live join would silently
-- move every past conversation into the new partner's inbox.
--
-- Idempotent, like every migration in this folder.
-- ============================================================================

ALTER TABLE "platform_feedback" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
ALTER TABLE "platform_feedback" ADD COLUMN IF NOT EXISTS "repliedByPartnerId" TEXT;

-- The partner's own inbox query: their rows, newest first.
CREATE INDEX IF NOT EXISTS "platform_feedback_partner_idx"
  ON "platform_feedback" ("partnerId", "createdAt" DESC);

-- The badge: how many of theirs are still unanswered.
CREATE INDEX IF NOT EXISTS "platform_feedback_partner_open_idx"
  ON "platform_feedback" ("partnerId")
  WHERE "reply" IS NULL;

-- Backfill from the merchant's CURRENT owner. This is the one moment where the
-- live join is the best answer available: these rows predate the column, so
-- there is no record of who owned the shop at the time, and today's owner is a
-- better guess than null. (At the time of writing there are no rows at all, so
-- this is a no-op on production and correct on any database that has some.)
UPDATE "platform_feedback" f
   SET "partnerId" = r."partnerId"
  FROM "restaurants" r
 WHERE f."restaurantId" = r."id"
   AND f."partnerId" IS NULL
   AND r."partnerId" IS NOT NULL;

-- No RLS change. This table has no anon or authenticated grant; every read goes
-- through systemDb, and the partner scoping is in the WHERE clause of the
-- queries that serve the inbox — see server/partners/feedback.ts, where the
-- partner id comes from the session and never from the request.
