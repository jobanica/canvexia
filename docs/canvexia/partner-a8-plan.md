# Partner Portal — A8 SMS marketing, A7.4 QR clock-in, staff invite email

Mode C plan. **Nothing is written yet.** Section 0 is the part to read first:
the SMS stack this brief asks for **already exists**, and eight other premises
do not hold. Section 5 has six questions I cannot answer from the code.

The previous occupant of this filename — the A7 plan, now shipped — is archived
at `docs/canvexia/partner-a7-plan.md`.

Traced: `system_architecture.md`, the A7 plan, `packages/core/src/*`,
`packages/db/prisma/schema.prisma`, all eleven files under
`apps/servd/src/{server,lib}/sms`, `server/billing/xendit.ts`,
`server/email/*`, `lib/qr.ts`, `components/partner/TeamManager.tsx`, and the
`partner_invites` / `attendance_sessions` models.

---

## 0. Blocking — what the brief assumes vs. what is here

### 0.1 THE BIG ONE: a complete SMS stack already exists

The brief reads as though SMS is greenfield ("new module, A8", "built on the
swappable SMS provider interface … move that interface to packages/core/sms if
it isn't there"). It is not greenfield. `apps/servd` already has, working and
tested:

| | |
|---|---|
| `server/sms/provider.ts` | the swappable interface — `SmsProvider`, `SendResult`, `InboundMessage` |
| `server/sms/semaphore.ts` | **the Philippine A2P aggregator**, implemented |
| `server/sms/campaigns.ts` | compose, schedule, send, per-message status |
| `server/sms/credits.ts` | wallet debit/refund |
| `server/sms/optin.ts` | double opt-in |
| `server/sms/notify.ts`, `admin.ts` | transactional sends, admin surface |
| `lib/sms/{phone,consent,keywords}.ts` | E.164 normalisation, consent copy, STOP classification |
| `app/api/webhooks/sms/route.ts` | inbound webhook, STOP handling |
| `tests/sms/sms.test.ts` | the suite |
| models | `SmsCampaign`, `SmsMessage`, `SmsCreditLedger`, `CustomerContact` (with `marketingConsent`, `consentText`, `consentSource`, `optOutAt`), `Restaurant.smsCreditBalance`, `.smsSenderName`, `.smsDoubleOptIn` |

**Every one of them is scoped to `restaurantId`.** A8 is therefore not "build an
SMS module" — it is **"add a second axis to an existing one"**, exactly as D29
did for merchants. That is a different job with a different risk profile: the
danger is not missing features, it is breaking a live merchant-facing system
while widening it.

This changes the sub-phase shape (see §3) and it is the single reason I want
approval before writing anything.

**One thing that must NOT be broken.** `api/webhooks/sms/route.ts` matches a
STOP by phone number **across the whole platform**, on purpose and with a
comment saying so — a person who texts STOP has opted out of everything, not of
one restaurant. Adding a partner axis must preserve that. It is the assertion I
will write first.

### 0.2 `core.*` is not a schema; `apps/partner` does not exist

Same two as A7 and unchanged: every table is `public` with a quoted camelCase
name, the `app` schema holds RLS helper functions only, and the portal is
`/partner` inside `apps/servd`. `core.sms_contacts` reads as
`public.sms_contacts` throughout.

### 0.3 `RESEND_API_KEY` is not an environment variable in this repo

The brief says "if `RESEND_API_KEY` is missing in env, show a warning banner".
There is no such variable anywhere — `grep` finds zero hits. The Resend key
lives **encrypted in `platform_settings.emailCredsEnc`**, decrypted with
`CREDENTIALS_ENCRYPTION_KEY`, and is entered at `/super-admin/email`.

So the banner's condition becomes "no email provider is configured"
(`getEmailStatus().configured === false`), which is the real question and is
already a function. Checking an env var that does not exist would make the
banner permanent.

### 0.4 Email is already live — the copy the brief describes is already stale

"Current state: /team … says *we can't email this yet*" was true this morning.
As of this session: `CREDENTIALS_ENCRYPTION_KEY` is set, the Resend key is
stored, `canvexia.com` is verified, `/api/cron/drain-emails` runs every 15
minutes, and a real message was **delivered** from
`CANVEXIA <noreply@canvexia.com>`.

So Part 3 is smaller than written: the **sending** half is done. What is
missing is the invite email itself and the accept route.

### 0.5 It is `canvexia.com`, not `canvexia.app`

The brief asks me to confirm the sending domain for **`canvexia.app`**. The
domain verified in Resend, and the one the portal is branded around, is
**`canvexia.com`**. `canvexia.app` is not registered, not in Resend, and appears
nowhere in this repository. I have assumed a typo; see Q5.

### 0.6 There is no `/invite/{token}` route at all

`partner_invites` is complete — `tokenHash` (SHA-256, never the token),
`expiresAt`, `acceptedAt`, `revokedAt`, `invitedByUserId`. What does not exist
is any route that consumes one. The partner-portal QA report listed this as
§4.1: *"without it no partner can be onboarded"*.

This is the most valuable single item in the whole brief and it is in Part 3,
which is why running Part 3 first is right.

### 0.7 There is no per-partner email sender identity

The brief: "from the partner's sender identity if verified, else from
CANVEXIA's default sender". There is no partner-level sender identity for
**email**. `smsSenderName` exists and is on `Restaurant` — a merchant column,
for SMS, not a partner's email domain.

Sending as `noreply@davaooperator.com` would require verifying each partner's
domain in Resend and storing per-partner credentials — a real feature, and not
a small one. **Proposed:** always send from CANVEXIA's verified sender with the
partner's brand name as the display name and in the subject, which is what the
brief's own fallback says. Per-partner domains become their own phase. See Q4.

### 0.8 A QR *generator* is here; a QR *scanner* is not

`qrcode@^1.5.4` is a dependency and `lib/qr.ts` has `qrSvg` / `qrPngDataUrl` —
that covers the kiosk **display** with no new package.

**Reading** a QR from a camera is a different library and there is none. The
brief says to ask; see Q1.

### 0.9 `smsSenderName` is on the wrong table for what the brief wants

"Sender name per partner (from A5 sender identity), status pending until HQ
marks it approved" — the column exists on `Restaurant`, not `Partner`, and has
no status field. A8 needs `partners.smsSenderName` + `smsSenderStatus` as new
columns, not a reuse.

---

## 1. PART 3 — Staff invite email + accept route

The smallest, the most valuable, and the only part I would run today.

### Files

| | |
|---|---|
| `[NEW]` | `packages/core/src/email/templates.ts` — pure copy + render helpers |
| `[MODIFY]` | `packages/core/src/index.ts` |
| `[NEW]` | `apps/servd/src/server/partners/invite-email.ts` |
| `[NEW]` | `apps/servd/src/app/invite/[token]/page.tsx` |
| `[NEW]` | `apps/servd/src/server/partners/accept-invite.ts` |
| `[NEW]` | `apps/servd/src/components/partner/AcceptInvite.tsx` |
| `[MODIFY]` | `apps/servd/src/server/partners/team.ts` / `team-actions.ts` — resend, sent status |
| `[MODIFY]` | `apps/servd/src/components/partner/TeamManager.tsx` |
| `[MODIFY]` | `apps/servd/src/server/email/outbox.ts` — render `partner.invite` |
| `[NEW]` | `apps/servd/tests/partners/invite.test.ts` |

### What moves to `packages/core`, and what cannot

The brief says move "the Resend client and base email template" into
`packages/core/email`. **Half of that can move; half must not.**

`packages/core` has **zero dependencies** and is framework-agnostic pure
TypeScript. It can hold the templates and the body/subject builders, and those
genuinely belong there — a second app will want them.

It cannot hold the Resend *client* as it exists, because `getEmailCreds()` reads
`platform_settings` through Prisma under `systemDb` and is `server-only`.
Moving that would drag Prisma and a tenancy wrapper into a package whose whole
value is having neither.

**Proposed split:** templates and copy → `packages/core/src/email`; the
credential load and the `fetch` to Resend stay in `apps/servd/src/server/email`,
re-exported so nothing that imports the old path breaks.

### The invite email

Queued into `outbound_emails` as template `partner.invite` — it does **not**
call Resend directly. That is deliberate: the drainer already exists, already
retries, already claims-before-send, and a second sending path would be a second
thing to get idempotency wrong in.

Payload carries **no token**. `outbound_emails.payload` is documented as "NEVER
a token or a password", and the whole point of `tokenHash` is that a leaked
database cannot accept an invitation. So the drainer composes the link from the
invite row — which means the token has to reach the drainer some other way.

**This is the one real design problem in Part 3.** Three options, and I am
proposing the third:

1. Put the token in the payload → breaks the model's stated rule and puts a live
   credential in a table with no encryption.
2. Send the email synchronously at invite time → a second sending path, and an
   invite that fails to send silently rolls back or silently does not.
3. **Encrypt the token into the payload** with `CREDENTIALS_ENCRYPTION_KEY`
   (now set), so the row carries `tokenEnc` and the drainer decrypts at send
   time. A leaked database without the key is still useless, which is the
   property `tokenHash` was protecting.

Option 3 keeps one sending path and keeps the security property. It is what I
will build unless told otherwise.

### `/invite/[token]`

- Hash the URL token, look up by `tokenHash`, reject expired / accepted /
  revoked with a **distinct message for each** — "this link has expired" and
  "this invitation was withdrawn" are different facts and a single "invalid"
  teaches nobody anything.
- Name + password, creating the Supabase user. **This is the one place the
  service-role key legitimately creates a user**, and it is not the thing the
  standing rule forbids: the rule is against *minting passwords for people*; here
  the person chooses their own and holds the invite that authorises it.
- One transaction: create `partner_users` row with the invited role, stamp
  `acceptedAt`, audit. A half-accepted invite is a seat with no login or a login
  with no seat.
- Redirect to the role's home — `sales`/`support` land on "My day", which A7.2
  already built.
- Magic link: **not proposed.** Supabase magic links need SMTP configured *in
  Supabase*, which is separate from Resend and is not set up. Password it is.

### `/team` changes

Replace the "we can't email this yet" box (now false) with sent status, Resend
(regenerates the token, invalidates the old hash, re-queues), Revoke (exists),
and **keep Copy-link** as the brief asks — partners whose staff do not check
email are real.

The admin-only warning banner keys on `getEmailStatus().configured`, per §0.3.

### Tests

Invite → queued row → drain → accept → seat exists with the right role → old
token rejected after resend → expired/revoked/accepted each give their own
message → audit rows for both invite and accept.

---

## 2. PART 2 — QR clock-in (A7.4 patch)

### Files

`[NEW]` `manual/add-attendance-kiosks.sql`, `lib/partners/kiosk-token.ts`
(pure HMAC, tested), `server/partners/kiosk.ts`, `app/(platform)/partner/
attendance/kiosk/page.tsx`, `components/partner/{KioskDisplay,QrScanner}.tsx`
`[MODIFY]` `schema.prisma`, `rls.sql`, `attendance-actions.ts`,
`attendance.ts`, `FieldApp.tsx`, `attendance/manager/page.tsx`,
`staff-actions.ts`, `attendance.csv/route.ts`

### Schema

- `attendance_kiosks(id, partnerId, label, lat, lng, active, secret, createdAt)`
  — a **per-kiosk secret**, not a global one, so revoking a compromised kiosk is
  a row update rather than an env change that invalidates every kiosk.
- `attendance_sessions` += `method` (`gps` | `qr`), `kioskId`.
- `partner_users` += `kioskRequired` (default false).

### The token

HMAC-SHA256 over `partnerId | kioskId | floor(epoch/60)`, base64url, rotating
every 60 s. Validation accepts the **current and previous** bucket — a scan that
starts at 59.8 s must not fail — which gives the ≤90 s freshness the brief asks
for without a clock-sync problem.

Pure function in `lib/partners/kiosk-token.ts`, so the four cases the brief
names are testable at a fixed clock: valid, two minutes old, another partner's
kiosk, and a `kioskRequired` seat attempting GPS-only.

### Kiosk page

`partners.read`-level gate plus `attendance.view_all`; no `PortalShell`, no nav.
"Requires re-auth to exit fullscreen" — browsers do not let a page trap
fullscreen, so what this can honestly be is: **exiting fullscreen reveals a lock
screen that needs the password**, not a page that cannot be closed. Stated
because the brief's wording implies something the web platform does not permit.

### Scanning

See Q1. GPS is still captured on a QR check-in, per the brief.

---

## 3. PART 1 — SMS (A8), restructured around what exists

Because of §0.1 the sub-phases in the brief do not match the work. Proposed:

| | |
|---|---|
| **A8.0** | **Lift the existing SMS stack to two axes.** `SmsProvider` and the pure helpers → `packages/core/src/sms`; `partnerId` alongside `restaurantId` on campaigns/messages/ledger; prove the platform-wide STOP still works. **No new features.** This is the risky phase and it ships alone. |
| A8.1 | `sms_contacts` + the four consent capture points + opt-out (add `tigil`/`alis` to the keyword set) + tests |
| A8.2 | `sms_wallets` + Xendit top-up (reuse `server/billing/xendit.ts`) + ledger + low-balance |
| A8.3 | composer / segments / scheduling / send window / frequency cap |
| A8.4 | inbox + 1:1 replies + notifications |
| A8.5 | automations + analytics + export/forget |

Two design notes worth flagging now:

- **`sms.send` and `sms.reply_own`** are two new permission keys — the A7 grid
  goes 29 → 31, and `PERMISSION_GROUPS` needs an SMS section or they will not
  render (a key in no group is denied silently; A7's own test catches that).
- **"Forget" with a tombstone hash** is the only part of A8 that is
  irreversible. It needs its own review; I will not fold it into a phase with
  five other things.

---

## 4. What I will NOT build unless told otherwise

- A second email sending path. Everything queues through `outbound_emails`.
- Supabase magic links (§1) — Supabase SMTP is not configured.
- Per-partner verified email domains (§0.7).
- Any new npm dependency except a QR scanner, and only after Q1.
- Re-opt-in of an opted-out contact without a new consent event — the brief
  forbids it and so does the PH Data Privacy Act.
- Removing "Reply STOP to opt out" — configurable wording, not removable.

---

## 5. Questions I cannot answer from the code

**Q1 — QR scanner library.** None exists (`qrcode` is generation only).
Proposed, in order: the browser's **native `BarcodeDetector`** (zero bytes,
supported in Chrome/Android which is what field staff use), falling back to
**`jsqr`** (~14 kB, no dependencies) where it is missing — notably iOS Safari
before 17. The alternative is `@zxing/browser` (~200 kB) or `html5-qrcode`
(~90 kB, bundles its own UI). Confirm the native+jsqr pair, or name another.

**Q2 — ₱0.50 per credit, and the provider unit cost.** The brief says confirm.
I also cannot see Semaphore's actual per-segment price anywhere in the repo, and
the statement's pass-through line is wrong if I guess it. What is the real
provider cost per segment, and should it be an env var or an HQ config row?

**Q3 — Semaphore inbound and delivery-receipt formats.** `semaphore.ts` says
*"Semaphore inbound payloads vary by setup; accept the common shape"* — i.e. it
was written against a guess. Delivery receipts are not handled at all. Per the
brief I will stub behind the provider interface, but the campaign status column
is decorative until we have the real callback format. Can you get the webhook
and DLR spec from them?

**Q4 — Partner email sender identity** (§0.7). Confirm: CANVEXIA's verified
sender with the partner's brand name as display name and in the subject, and
per-partner domains as a later phase?

**Q5 — `canvexia.app`** (§0.5). Typo for `canvexia.com`, or a second domain you
intend to register?

**Q6 — Sequencing.** Part 3 is ~1 phase. Part 2 is ~1. Part 1 is **six**
sub-phases and A8.0 is a refactor of a live merchant-facing system. Run Part 3
now and re-scope the rest after, or approve all three and run continuously as
A7 did?
