# CANVEXIA email — where it stands, and the one step left

## The chain

Three things have to be true before a partner receives anything.

| | | |
|---|---|---|
| 1 | `CREDENTIALS_ENCRYPTION_KEY` set | **done** — `canvexia` project, all three targets |
| 2 | Resend key stored, encrypted | **done** — `platform_settings.emailCredsEnc` |
| 3 | A sender that drains `outbound_emails` | **done** — `/api/cron/drain-emails`, every 15 min |
| 4 | A verified sending domain | **done** — `canvexia.com`, verified |

**Email is live.** Proved end to end on 2026-09-15: a row queued into
`outbound_emails`, picked up by the deployed cron, rendered, sent by Resend from
`CANVEXIA <noreply@canvexia.com>`, and reported `delivered` by Resend's own API.

Mail goes out from **`noreply@canvexia.com`**, display name **CANVEXIA**.

## One thing partners cannot do: reply

`replyTo` is deliberately **empty**. `canvexia.com` is verified for SENDING
only — the MX record Resend asked for is on `send.canvexia.com` and exists to
receive bounce feedback, not mail. There is no inbound mailbox on the domain, so
any reply-to address there would silently bounce.

An absent reply-to is honest about that; a broken one is not. If partners should
be able to reply, that needs inbound MX on `canvexia.com` pointing at a real
mailbox, and then the address set at `/super-admin/email`.

## The DNS records, for reference

Already added and verified. Kept here because a registrar transfer or a DNS
migration loses them and the domain silently stops sending:

| Type | Name | Value | Priority |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC00tglSG6nIdipyaHnx5DUBncG9U9QvgSPPwVFqHBhZf7cAzhDX9mY7eKlTuP4f/AY4/9IqP5XE2wUlTvoPUapZ7o3N6NAJTbX4YIqvu0e5R3VBZR4ucxpNqdIDm0PfgWyr9lHtGWJH3sT/+Q6lbpoqKWdcdFzi8qm+tmj4KE+7wIDAQAB` | |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
| CNAME | `rsend` | `send.forge.rmta.net` | |

## Rotate the API key — still outstanding

The key currently stored was pasted into a chat transcript, so it should be
replaced now that sending works:

1. Resend dashboard → API Keys → revoke the old one, create a new one.
2. `/super-admin/email` → paste the new key → Save.

Do it from that screen rather than handing the key to anyone, so the replacement
never lands in a transcript or a log.

## What the drainer does

- Reads oldest-first, at most 100 a tick (Resend's batch limit).
- **Claims before sending**: `attempts` is incremented in a committed statement
  before the batch goes out. A crash mid-flight burns one attempt rather than
  leaving a row that resends on every tick — Resend's batch endpoint takes no
  idempotency key, and a duplicate storm into a partner's inbox is worse than
  one gap.
- Parks a row after **5** attempts, keeping its `error`.
- **Skips** a template this release does not know rather than failing it: a row
  queued by a later deploy is early, not broken.
- Records every run in `cron_runs`, including the ones that did nothing —
  "no provider configured" and "the job stopped running" otherwise produce
  identical evidence.
