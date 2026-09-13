# Phase 0 — Decisions, spike, safety net ✅

No feature code. Nothing here changes application behaviour; it records decisions,
sets up Q6 to be answered with a benchmark instead of a guess, and closes an
isolation gap that predates CANVEXIA.

- [x] `docs/canvexia/decisions.md` — ADRs for the settled questions (D1–D7)
- [x] `docs/canvexia/rls-partner-spike.md` — Q6 benchmark design, harness, decision rule
- [x] `apps/servd/tests/isolation/partner-scope.test.ts` — cross-partner reads, written to fail
- [x] `apps/servd/prisma/rls.sql` — catalogue-driven tenant table list
- [x] `apps/servd/scripts/schema-drift.mjs` — report RLS coverage gaps
- [x] Verify offline: typecheck ✅ · 883 tests ✅ · build ✅ (115 pages)
- [x] Verify against a real database ✅ (see below)

## Finding that changed this phase

The hand-written `tenant_tables` array in `rls.sql` had drifted. **13 tables holding
real tenant data had no row-level security at all** — `audit_logs`, `reservations`,
`gift_cards`, `gift_card_txns`, `cash_movements`, `delivery_settings`,
`delivery_bookings`, `cart_leads`, `happy_hours`, `shift_notes`,
`push_subscriptions`, `menu_item_variants`, `menu_item_servings`.

Nothing was leaking them — only `src/server/tenancy/scoped-db.ts` imports the
unscoped Prisma client, so every read already carries a restaurant scope or runs
super-admin. But the second layer, the one meant to hold when the application
forgets a where clause, was absent on those tables.

## Verification against a live database

The offline suite skips every RLS test, so `rls.sql` would otherwise have shipped
untested. Verified on a throwaway PostgreSQL 16 cluster (`initdb` → `prisma db
push` → `node scripts/apply-rls.mjs`), then torn down:

| Check | Result |
|---|---|
| Modified `rls.sql` applies cleanly | ✅ `✅ RLS policies applied.` |
| 13 previously-uncovered tables now isolated | ✅ all 13 carry `tenant_isolation` |
| 3 platform tables locked to super-admin | ✅ `platform_feedback`, `crm_clients`, `customer_events` |
| `schema-drift.mjs` coverage report | ✅ 0 rows (no drift, no gaps) |
| Existing `tenant-isolation.test.ts` | ✅ 9/9 pass — no regression |
| New `partner-scope.test.ts` | ✅ fails with `column "partnerId" of relation "restaurants" does not exist` — the intended gate |

**One trap worth recording for whoever runs these next.** Connecting as a
superuser makes every isolation test fail: superusers bypass RLS regardless of
`FORCE ROW LEVEL SECURITY`. The first run showed 8 failures that looked like a
regression and were not — the original `rls.sql` produced the identical 8
failures on the same database. Run isolation tests as a non-superuser role that
is a member of `app_user`, the way production connects.

## Next — Phase 1 is unblocked

Q1 settled (new partners only). Q6 is answered by running the spike; Q3 can take
its default. Phase 1's first migration — `restaurants."partnerId"` plus the
backfill — does not depend on the spike's outcome and can start immediately.
