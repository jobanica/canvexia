# Phase 2 — HQ admin: floors, operator terms, directory, reassignment ✅

- [x] `Plan.priceFloor` + `prisma/manual/add-plan-price-floor.sql`
- [x] `src/lib/billing/price-floor.ts` — both directions of the rule, 14 tests
- [x] Floor enforced in `createPlan` / `updatePlan`; field added to the plan editor
- [x] `src/lib/partners/reassign.ts` — the decision, 8 tests
- [x] `src/server/partners/reassign.ts` — the move, audit-logged, one transaction
- [x] `src/server/partners/operator-actions.ts` — terms + reassign, owner-only
- [x] `src/server/partners/directory.ts` — merchants across every partner
- [x] HQ pages: `/super-admin/merchants`, `/super-admin/products`; partners page
      gains an operator-terms panel; both added to the nav
- [x] Fixed the stale "Servd takes no share" line — true for legacy tiers only
- [x] Dropped a duplicate `formatPeso`; `price-floor.ts` uses `@/lib/money`

## Verification

Offline: typecheck ✅ · **918 tests** ✅ (was 900) · build ✅ **117 pages** (was 115,
both new routes present).

Against a live PostgreSQL 16 cluster, along the upgrade path production takes —
push the **Phase 1** schema, then the Phase 2 hand-run SQL:

| Check | Result |
|---|---|
| `add-plan-price-floor.sql` on a Phase 1 database | ✅ applies clean, self-check true |
| Column drift afterwards vs the new schema | ✅ none |
| `db:rls` | ✅ applies clean |
| **DB-backed suite** (tenant · partner · reassignment) | ✅ **19/19 across 3 files** |
| Reassignment moves the column and writes the audit row | ✅ actor, reason, before/after all recorded |
| Repeating a move | ✅ no-op, no second audit row |
| Suspended target | ✅ refused, nothing changed |
| **Access follows ownership** | ✅ new partner reads the merchant, **old partner no longer can** |

That last row is the one worth keeping: reassignment is enforced by the database,
not by the portal remembering to filter.

## Notes for whoever runs this

`prisma/manual/add-plan-price-floor.sql` is additive and safe to run any time —
it defaults every existing plan to "no floor", so no price already being charged
becomes invalid. Floors are raised per plan, deliberately, in the plan editor.

## Next — Phase 3

Partner portal. The first job there is the one Phase 1 flagged:
`src/server/partners/portal.ts` still reads through `systemDb()`, which bypasses
RLS entirely. Moving it onto `partnerDb()` is what makes the isolation built in
Phase 1 actually load-bearing for the portal — until then the policies protect
everything except the screen most likely to need them.
