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
## A7.4 — Attendance PWA, visit log, manager view, offline queue
## A7.5 — Targets & scorecard
## A7.6 — Commissions job + views + mark paid
## A7.7 — Notifications + digest additions
