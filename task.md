# CANVEXIA HQ Admin — execution checklist

Plan: `implementation_plan.md`. Approved with all five defaults taken:

1. `/hq` route group inside `apps/servd` — **not** a separate app.
2. Territory map dropped from Phase A; geocoding is a follow-up.
3. "View as partner" **is** built, in H2, as its own reviewed step with the
   signed short-lived grant from §0.9 — not folded into a screen.
4. Only HQ's "Book a call" uses the new calendar
   (`rYoC3ZLKZFvUYrfz5`); canvexia.com keeps `CnFH1CSDhdkuh8476`.
5. The house partner's revenue share stays 70%.

---

## H1 — Roles, tables, RLS, audit, identity

- [x] `packages/core` roles: `hq_super_admin`, `hq_ops`, `HQ_USER_ROLES`
- [x] `packages/core` permissions: `HQ_CAPABILITIES` + matrix + `requireHqCapability`
- [x] `admin-scope.ts`: `/hq` prefixes for the ops role
- [x] `writeAudit()` widened; `writeHqAudit()` added
- [x] Six partner modules moved off raw `auditLog.create`
- [x] `manual/add-hq-admin.sql` — tables, columns, checks, RLS, revokes
- [x] `manual/bootstrap-hq-admin.sql` — the first HQ login
- [x] `schema.prisma` kept in step with the migration
- [x] `rls.sql` carries the same policies so `db:rls` cannot drop them
- [x] `server/hq/auth.ts` — page/action guards, login rate limit, `hq.login` audit
- [x] `tests/isolation/hq-scope.test.ts` — the 8-point gate
- [x] Gate proved as SQL over the Management API (Postgres is unreachable here)
- [x] `pnpm turbo run build test` clean

**H1 is done.** The gate ran against the live database: 14/14, with a guard
asserting the reads ran as `app_user`, which does not bypass RLS. `anon` and
`authenticated` get `42501` on all seven tables. `bootstrap-hq-admin.sql` still
has to be run by hand with a real Supabase auth user id before anyone can sign
into /hq.

## H2 — Overview + Partners + view-as-partner

- [x] `components/canvexia/Cards.tsx` — the shared visual vocabulary, extracted
      from the portal's Overview rather than copied
- [x] `lib/hq/health.ts` — health board, settlement state, attention rules (pure)
- [x] `server/hq/overview.ts` — one scope, everything in parallel
- [x] `server/hq/partners.ts` — the detail, with payout secrets never selected out
- [x] `server/hq/partners-actions.ts` — approve, suspend, revoke, extend, view-as
- [x] `server/hq/impersonate.ts` — signed single-use 30-minute read-only grant
- [x] `requireWritablePartner()` — ONE chokepoint; all 6 partner action files moved
- [x] `/hq` layout, overview, partners list, partner detail (6 tabs)
- [x] Impersonation banner on every portal screen
- [x] `/super-admin/partners` → permanent redirect
- [x] 23 new tests; DB constraints proved against the live database
- [ ] Deployed and walked through with a real HQ login (needs the bootstrap)
## H3 — Territories + Applications + convert-to-partner

- [x] `lib/hq/csv.ts` — written not installed; quotes, CRLF, BOM, round-trip
- [x] `server/hq/territories.ts` + actions — CRUD, assign/release, split/merge,
      two-step CSV import that plans before it writes and never deletes
- [x] `server/hq/applications.ts` — the waitlist, grouped by city
- [x] `server/hq/convert.ts` — one transaction: partner + seat + invite +
      territory + assignment + application + audit + queued email
- [x] `/hq/territories`, `/hq/applications`, `/hq/applications/[id]`
- [x] `WaitlistStatus` gains `converted`; `outbound_emails` queue
- [x] Territory reconciliation, with the two known aliases named explicitly
- [x] 26 more tests (CSV round-trip, import planner)
- [x] H6 — Billing: CRON_SECRET set, cron_runs recorded, preview/run,
      statements, ledger explorer, adjustments, pass-through costs
- [x] H4 — Global merchant directory, both axes, reassign, national accounts
- [x] H5 — Products & plans, floors behind a two-step, feature flags
- [x] H7 — HQ team, the audit and impersonation logs, announcements with
      segment targeting and read receipts, and the partner-side banner

---

## Still to do

- [x] Run `bootstrap-hq-admin.sql` — done 2026-09-15. One active super admin:
      hirestaff25@gmail.com. It is the ONLY HQ seat, and `setHqSeatStatusAction`
      refuses to deactivate the last one, so adding a second from /hq/team is
      the thing that makes this recoverable if that login is ever lost.
- [ ] `CREDENTIALS_ENCRYPTION_KEY` is still unset: email cannot be configured,
      so queued welcome emails sit in `outbound_emails` and nothing drains them.
- [ ] Geocode the 143 territories if the map is wanted.
- [ ] A per-merchant referral column, when there is a second national account.
- [ ] The six older isolation suites that never switch to `app_user`.
