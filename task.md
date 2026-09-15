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
## H3 — Territories + Applications + convert-to-partner
## H6 — Billing (moved ahead of H4, per plan §3.5)
## H4 — Global merchant directory
## H5 — Products & plans
## H7 — HQ team, audit views, announcements
