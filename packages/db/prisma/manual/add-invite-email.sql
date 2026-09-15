-- CANVEXIA — link a staff invitation to the email that carries it.
--
-- Run in the Supabase SQL editor, then `pnpm --filter @servd/db db:rls`.
-- Idempotent.
--
-- WHY A COLUMN RATHER THAN A JOIN ON EMAIL. `outbound_emails` is keyed by
-- address, and an address can hold several invitations over time — invited,
-- expired, re-invited. Matching on `toEmail` would show the /team screen the
-- status of whichever row it happened to find, which is wrong exactly when it
-- matters: after a resend, where the admin is looking to find out whether the
-- NEW link went out.
--
-- NULLABLE AND NOT A FOREIGN KEY. Null means "no email was queued for this
-- invitation" — the honest state on a deployment with no encryption key, where
-- the admin copies the link by hand. A dangling id after `outbound_emails` is
-- pruned reads the same as null on the screen, and an ON DELETE rule would make
-- pruning the mail queue rewrite the invitation table.
ALTER TABLE "partner_invites"
  ADD COLUMN IF NOT EXISTS "emailId" text;

-- No new grants and no new policies: the column rides on `partner_invites`,
-- whose partner-scoped policies already govern every row this touches.
