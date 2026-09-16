-- A8.4: two-way SMS. The inbox, and 1:1 replies.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- ONE TABLE FOR BOTH DIRECTIONS, because a conversation is a conversation. Two
-- tables joined by phone number would mean sorting an inbound and an outbound
-- list together in application code to draw a thread, and getting the ordering
-- subtly wrong the first time somebody replies inside the same second.
--
-- Campaign sends stay in `sms_messages`: a campaign is a broadcast with a cost
-- and a status per recipient, not a conversation. The thread shows the reply
-- and the answer, which is what somebody reading it needs.
CREATE TABLE IF NOT EXISTS "sms_thread_messages" (
  "id"           TEXT PRIMARY KEY,
  "partnerId"    TEXT NOT NULL REFERENCES "partners"("id") ON DELETE CASCADE,
  /* Null when the number is not in the contact book — somebody texting a
     sender name they saw on a friend's phone. The message is still kept: a
     reply nobody can see is a customer nobody answers. */
  "smsContactId" TEXT,
  /* E.164. Always present, even when the contact is not. */
  "phone"        TEXT NOT NULL,
  /* in | out */
  "direction"    TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  /* Which seat sent an outbound reply. Null for inbound. */
  "sentByUserId" TEXT,
  "providerRef"  TEXT,
  "segments"     INTEGER NOT NULL DEFAULT 1,
  /* When a seat marked the thread read. Only meaningful on inbound rows. */
  "readAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_thread_direction_check" CHECK ("direction" IN ('in', 'out'))
);

CREATE INDEX IF NOT EXISTS "sms_thread_partner_created_idx"
  ON "sms_thread_messages" ("partnerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "sms_thread_contact_idx"
  ON "sms_thread_messages" ("smsContactId", "createdAt");
-- The unread count, which every load of the inbox asks for.
CREATE INDEX IF NOT EXISTS "sms_thread_unread_idx"
  ON "sms_thread_messages" ("partnerId", "readAt") WHERE "direction" = 'in';
