# Phase 1 — Partner axis, core package, house-partner backfill ✅

The database now enforces partner isolation. Before this, partner scoping existed
only in application code, and the partner portal read through `systemDb()`, which
turns every policy off.

- [x] `restaurants."partnerId"` — the ownership column the whole axis hangs on
- [x] `Partner` operator fields — slug, brandConfig, territory, revenueSharePct,
      collectionMode, brandMode
- [x] `audit_logs` — nullable restaurantId, plus partnerId and actorType, so an
      HQ or partner action can be recorded at all
- [x] `prisma/manual/add-partner-tenancy.sql` — hand-run migration, idempotent,
      self-verifying
- [x] `prisma/rls.sql` — `app.current_partner_id()` and a partner arm on every
      tenant policy
- [x] `packages/core` — GUC names, role model, product registry; wired into a
      real caller
- [x] `apps/servd/src/server/tenancy/scoped-db.ts` — `partnerDb()`
- [x] `src/lib/partners/revenue-share.ts` + 17 tests — the grandfather rule
- [x] `scripts/backfill-house-partner.mjs` — dry-run by default, idempotent
- [x] Q6 answered with a benchmark, not a guess (see D8)

## Verification

Offline: typecheck ✅ · 900 tests ✅ (was 883) · build ✅ 115 pages.

Against a live PostgreSQL 16 cluster, following the path production will take —
push the **pre-CANVEXIA** schema, run the hand-run SQL, then `db:rls`:

| Check | Result |
|---|---|
| `add-partner-tenancy.sql` on a pre-CANVEXIA database | ✅ applies clean, self-check returns 3× true |
| Column drift afterwards vs the new schema | ✅ none — the migration covers every change |
| `db:rls` with the partner policies | ✅ applies clean |
| Drift + RLS coverage after | ✅ 0 rows |
| Backfill dry run | ✅ printed the plan, wrote nothing (verified: 0 partners, 0 assigned) |
| Backfill `--apply` | ✅ house partner created, 1 restaurant moved |
| Backfill re-run ×2 | ✅ "Nothing to do" — idempotent |
| **`partner-scope.test.ts` — the Phase 1 gate** | ✅ **5/5, was 0/5** |
| `tenant-isolation.test.ts` — regression check | ✅ 9/9 |
| Unknown partner sees | ✅ 0 restaurants, 0 orders |
| No scope at all sees | ✅ 0 restaurants |

## Deviations from the plan, with reasons

1. **`partnerDb()` lives in the app, not `packages/core`.** Core would have had
   to depend on `@prisma/client`, which is generated from the app's schema —
   a dependency pointing the wrong way. Core owns the GUC *names*; the app owns
   the client that sets them. Moving the schema into `packages/db` is the real
   fix and is its own migration.
2. **Child tables (`order_items`, `payments`, `modifiers`, `sms_messages`) got no
   partner arm.** They fail closed — a partner reads empty, not another partner's
   rows. Nothing in the portal needs them until Phase 4, and a policy granting
   access no caller uses is a policy nobody has tested.
3. **`partnerId` is a bare column, no Prisma relation**, matching the existing
   `demoPartnerId` precedent. Phase 2 can add the relation when it needs
   `include`.

## Next — Phase 2

HQ admin: products and plans with price floors, partner management, merchant
directory across partners, and reassignment. Reassignment is the one to design
carefully — D8 makes it the operation that a future denormalised `orders.partnerId`
depends on.

**Not yet run in production.** The migration, `db:rls` and the backfill are all
still to be applied to the live database, in that order, with the backfill dry
run read by a person first.
