# Partner Portal A7 — execution checklist

Plan: `implementation_plan.md`. Approved with all three answers taken as the
first option in each:

1. **RLS:** seat-level policies on the seven NEW tables only; the existing 22
   partner policy arms are NOT rewritten. Per-seat permission for everything
   else is enforced at the `requireWritablePartner` chokepoint.
2. **Size:** run A7.1 → A7.7 continuously.
3. **Offboarding:** service-role session revocation IS allowed. Revocation is
   not creation; the standing rule against minting passwords stands.

---

## A7.1 — Core: roles, permissions, staff data, RLS, audit, tests

- [x] `packages/core` roles: `ops_manager`, 4 roles, CHECK widened
- [x] `packages/core/identity/partner-permissions.ts` — **29** keys, not 27:
      the brief's table is 25, plus four (`pipeline.write`, `merchants.note`,
      `domains.write`, `settings.write`) that a SHIPPED screen needs and the
      brief's list has nowhere to put. The plan said 27; that was my miscount.
- [x] `manual/add-partner-staff.sql` — 8 new tables, 2 merchant columns,
      `audit_logs.actorRole`, `partner_users` profile columns
- [x] `schema.prisma` in step with the migration
- [x] `rls.sql` — seat arm on the 6 seat-scoped tables + commission_lines
      semi-join + the grid, new GUC + `app.has_permission`
- [x] `scoped-db.ts` — `app.current_partner_user_id`, always written
- [x] `audit/log.ts` — `actorRole`, plus `writeSeatAudit` so 30 call sites
      cannot each forget it
- [x] `partners/auth.ts` — `permissions` on `CurrentPartner`, widened gate,
      `partnerReadScope()`
- [x] `partners/permissions.ts` — resolve defaults + overrides
- [x] tests: 19 matrix assertions + a 51-check isolation gate
- [x] Migration and rls.sql RUN against the live database
- [x] Gate proved as SQL over the Management API: **51/51**
- [x] `pnpm turbo run build test typecheck` clean (9/9 serial)

**A7.1 is done.** The gate ran against the live database with a guard asserting
the reads ran as `app_user`, which does not bypass RLS, and `app.is_super_admin`
explicitly off. A seat sees its own rows on all six tables, a colleague's are
invisible inside the same partner, another partner's are invisible, a seatless
scope reads empty, forging a colleague's row is refused, and flipping
`hr.view_all` on and off changes what Postgres hands back — without crossing
into another partner. `anon` and `authenticated` hold no grant on any of the
eight.

## A7.2 — Permission grid + role-scoped overviews

- [x] `/partner/team/permissions` — 29×4 toggle grid, one form per cell
- [x] `permissions-actions.ts` — audited flips, per-role reset, seat counts
- [x] Grid cells say `default` vs `yours`; locked cells render as text
- [x] `PortalShell` nav derives from resolved permissions, not the matrix
- [x] `requirePartnerPageWith` widened to accept a permission
- [x] The overview forks: partner-wide for admin/ops, **My day** for sales and
      support — keyed on `merchants.view_all`, not on a role name
- [x] `maskAmounts()` strips the money SERVER-SIDE, series included
- [x] 7 more tests; suite 1238 → 1245
## A7.3 — Staff directory, assignment, offboarding, activity

- [x] `server/partners/staff.ts` — profile, book (both merchant tables),
      activity merged from `staff_events` + `audit_logs`, counts
- [x] `staff-actions.ts` — profile edit, single/bulk reassign, offboard,
      reactivate. Offboarding is ONE transaction; session revocation runs
      after it and records its own failure
- [x] `/partner/team/staff/[id]` — three tabs, emergency contact withheld at
      the SELECT
- [x] `/api/partner/staff/[id]/activity.csv` — re-checks the permission AND
      whose record it is; 404 not 403
- [x] Team rows link into the record; `ops_manager` blurb added
- [x] 13 more tests; suite 1245 → 1258
## A7.4 — Attendance PWA, visit log, manager view, offline queue

- [x] `lib/partners/geo.ts` — haversine + the 300 m rule, 14 tests, no dependency
- [x] `server/storage/field-photos.ts` — private bucket, path not URL, signed
      reads scoped to the partner
- [x] `server/partners/attendance.ts` + `-actions.ts` — check in/out, visits,
      auto-close, `subjectLocation`
- [x] `/partner/attendance` — the field app, outside PortalShell, phone-first
- [x] `partner-field.webmanifest` + layout — installable, scoped to `/partner`
- [x] `lib/partners/visit-queue.ts` — its own IndexedDB store, `clientRef`
      idempotency, drain stops on first failure, no photos queued
- [x] `/api/partner/field/sync` — stable URL, 200 on refusal, 503 on fault
- [x] `/partner/attendance/manager` — Leaflet map + 7-day table + flags
- [x] `/api/partner/attendance.csv` — one row per person per day
- [x] Auto-close folded into the daily digest cron, not a 7th schedule
- [x] **Bug found by the tests:** `manilaDayKey` sliced the ISO string of
      `startOfManilaDay()`, which is 16:00 UTC the PREVIOUS day — every
      check-in would have landed on yesterday's key. Same bug in `my-day.ts`.
- [x] 19 more tests; suite 1258 → 1291
## A7.5 — Targets & scorecard

- [x] `lib/partners/scorecard.ts` — pure; rate is null with no demos, a zero
      target reads as met, the leaderboard ranks by closings not by rate
- [x] `server/partners/scorecard.ts` — four flat reads, grouped in memory
- [x] `targets-actions.ts` — upsert per (seat, month); "copy last month" does
      NOT overwrite and says how many it skipped
- [x] `/partner/team/scorecard` — month chips, table/leaderboard, inline target
      editor; a seat without `hr.view_all` is filtered in the QUERY
- [x] 14 more tests; suite 1291 → 1305
## A7.6 — Commissions job + views + mark paid

- [x] `packages/db/src/commissions.ts` — pure; floors, one line per rule,
      per_signup only on the first settlement, `endsAt` exclusive
- [x] `server/partners/commissions.ts` — draft + idempotent freeze; a zero
      statement is still written
- [x] `/api/cron/partner-commissions` on `0 1 1 * *`, recorded in `cron_runs`
- [x] `commissions-actions.ts` — add/end a rule (never edit), mark paid once
- [x] `/partner/commissions` — own by default, everyone with `commissions.manage`,
      live preview of the open month from the same draft function
- [x] 19 more tests; suite 1305 → 1324
## A7.7 — Notifications + digest additions

- [x] Four new `NOTIFICATION_EVENTS` with labels; settings grid picks them up
- [x] `composeDigest` gains an OPTIONAL manager section; a salesperson's copy
      does not carry it, so two digests are composed when a partner has both
- [x] `server/partners/notify.ts` — queue, manager audience by ROLE not by an
      editable permission, missing pref row means yes, never fails its caller
- [x] `visit.logged` → manager; `checkin.missed` → one notice per partner;
      `target.at_risk` → the 15th, paced against the month; `commission.ready`
      → only when there is something to collect
- [x] §6 leftovers: round-robin lead assignment (longest-waiting sales seat,
      then `defaultLeadUserId`, then nobody) and "Signed by / Supported by" on
      merchant detail
- [x] 17 more tests; suite 1324 → 1341

---

**A7 is complete.** All seven sub-phases, 9/9 green serially, servd 1204 → 1341
tests. `system_architecture.md` carries the save state.

---

## After A7

- [x] `CREDENTIALS_ENCRYPTION_KEY` set on the `canvexia` project (all three
      targets), verified live at `/api/health`. Nothing was encrypted when it
      was set, so there is no ciphertext under an older key. **It cannot be
      rotated without making every `*Enc` column unreadable.**
- [ ] A Resend API key at `/super-admin/email` — needs a Resend account.
- [ ] A sender that drains `outbound_emails`. Until this exists, no mail goes
      out however the other two are set.
