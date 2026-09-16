# A8 / QR clock-in / invite email — execution checklist

Plan: `implementation_plan.md`. Approved with "do all" — all three parts, run
continuously, Part 3 first. The six open questions resolved as follows:

1. **QR scanner:** native `BarcodeDetector`, falling back to `jsqr` (~14 kB, no
   dependencies). One new free dependency, which the plan named and the
   approval covers.
2. **Credit price:** ₱0.50/credit taken as confirmed. **The provider unit cost
   is NOT invented** — it is an HQ config row defaulting to unset, and the
   statement's pass-through line says "provider cost not configured" rather
   than showing a fabricated margin. Standing rule: never invent a number.
3. **Semaphore inbound/DLR:** stubbed behind the provider interface, with the
   exact spec questions written down in `docs/canvexia/sms-provider.md`.
4. **Partner email sender:** CANVEXIA's verified sender, partner brand name as
   display name and in the subject.
5. **`canvexia.app`:** taken as a typo for `canvexia.com`.
6. **Sequencing:** Part 3 → Part 2 → Part 1 (A8.0 … A8.5), continuous.

---

## PART 3 — Staff invite email + accept route

- [x] `packages/core/src/email/templates.ts` — pure copy/render, zero deps
- [x] `server/partners/invite-email.ts` — queue `partner.invite`
- [x] Token encrypted into the payload (never raw; never a bare hash to send)
- [x] `outbox.ts` renders `partner.invite`
- [x] `/invite/[token]` — distinct message per failure reason
- [x] `accept-invite.ts` — one transaction: user + seat + acceptedAt + audit
- [x] `/team`: sent status, Resend, Revoke, Copy-link fallback, provider banner
- [x] Tests: 17 unit tests (copy, encrypted payload, drainer branch, failure
      reasons, and the two source rules: no raw token in the queue, a resend
      kills the old hash). The invite → accept → audit round trip runs as SQL
      against the real database after deploy — vitest has no database.
- [x] `partner_invites.emailId` (`add-invite-email.sql`) — applied

## PART 2 — QR clock-in (A7.4 patch)

- [x] `add-attendance-kiosks.sql` + per-kiosk secret + `method`/`kioskId`
- [x] `kiosk-token.ts` — pure HMAC, current + previous 60 s bucket
- [x] `kiosk.ts` / `kiosk-actions.ts` — manager-gated, secret never selected
- [x] Kiosk display (polls the server; the tablet never holds the secret)
- [x] `QrScanner` — native BarcodeDetector, jsqr fallback
- [x] `kioskRequired` per seat, manager method column, CSV column
- [x] 18 tests + a database gate: `app_user` cannot read a planted kiosk row
## PART 1 — A8 SMS
- [x] A8.0 lift to two axes (the risky one, alone)
      - STOP assertion written FIRST, before anything moved
      - pure helpers → `packages/core/src/sms`; the duplicate PH normaliser
        collapsed onto core's `normalizeMobile`
      - `partnerId` + nullable `restaurantId` + a one-axis CHECK on campaigns
        and the ledger; `sms_messages` keeps no axis of its own
      - gate: `verify-sms-two-axes.sql` (and the kiosk gate re-run, see below)
- [x] A8.1 contacts + consent + opt-out
      - `sms_contacts` (consent = status + when + source + EVIDENCE)
      - four capture points: visit (required question), lead form (unticked
        box), merchant onboarding (skippable = unknown), CSV (attested)
      - `tigil`/`alis`/`opt out`/`tama na` added to the STOP set
      - `sms.send` + `sms.reply_own`; the grid is 31 keys in seven groups
      - 18 new consent tests
- [ ] A8.2 wallet + Xendit + ledger
- [ ] A8.3 campaigns
- [ ] A8.4 inbox + replies
- [ ] A8.5 automations + analytics + export/forget
