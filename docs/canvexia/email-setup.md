# CANVEXIA email — where it stands, and the one step left

## The chain

Three things have to be true before a partner receives anything.

| | | |
|---|---|---|
| 1 | `CREDENTIALS_ENCRYPTION_KEY` set | **done** — `canvexia` project, all three targets |
| 2 | Resend key stored, encrypted | **done** — `platform_settings.emailCredsEnc` |
| 3 | A sender that drains `outbound_emails` | **done** — `/api/cron/drain-emails`, every 15 min |
| — | **A verified sending domain** | **NOT done — this is the blocker** |

Everything is wired. Nothing sends, and that is deliberate: the stored
credentials have an **empty `fromEmail`**, and `drainOutbox()` treats a missing
from-address as unconfigured and returns without touching a row. The queue keeps
accumulating exactly as it does today.

That is the safe state rather than the lazy one. Sending from an unverified
domain does not fail quietly — Resend rejects it, the drainer burns an attempt
per row, and after five ticks the whole queue is **parked** with `failedAt` set
and has to be un-parked by hand.

## Why the domain is the blocker

The Resend account has exactly one verified domain: **`servdph.com`**. That is
Servd's, not CANVEXIA's, and the standing instruction on this project is not to
use it here — a CANVEXIA partner receiving mail signed by `servdph.com` is being
told, correctly, that it came from a different company.

`canvexia.com` does not resolve (NXDOMAIN). It has to be **registered** first.

## The one step left

1. **Register `canvexia.com`.**
2. Add these four records at the registrar. The domain is already created in
   Resend (`ap-northeast-1`) so the records are fixed and will not change:

| Type | Name | Value | Priority |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC00tglSG6nIdipyaHnx5DUBncG9U9QvgSPPwVFqHBhZf7cAzhDX9mY7eKlTuP4f/AY4/9IqP5XE2wUlTvoPUapZ7o3N6NAJTbX4YIqvu0e5R3VBZR4ucxpNqdIDm0PfgWyr9lHtGWJH3sT/+Q6lbpoqKWdcdFzi8qm+tmj4KE+7wIDAQAB` | |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
| CNAME | `rsend` | `send.forge.rmta.net` | |

3. Click **Verify** in the Resend dashboard.
4. Open `/super-admin/email` and set the from-address to
   `noreply@canvexia.com`. Leave the API key field **blank** — an empty key
   means "keep what is saved", and the saved one is already correct.

The next 15-minute tick drains the queue.

## Rotate the API key

The key currently stored was pasted into a chat transcript, so it should be
replaced once sending works:

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
