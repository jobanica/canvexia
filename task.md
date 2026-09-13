# Phase 3 — Partner portal onto `partnerDb` ✅

Two bugs found while tracing, both blocking the portal move, both fixed.

## Bug 1 — the Phase 1 backfill gave partner merchants to HQ *(mine)*

`provisionDemo` set `demoPartnerId` and never `partnerId`, so every restaurant
any partner had ever created had `partnerId IS NULL` — and the Phase 1 backfill
swept every NULL to the house partner. That would have handed every partner's
book of business to CANVEXIA Davao: invisible to them under the Phase 1 policies,
and paid to HQ under Phase 4 statements.

**Reproduced side by side before fixing**, on a scratch database seeded with
pre-Phase-3 shaped rows:

| Backfill | `Cebu Diner`, built by Cebu Partner |
|---|---|
| Phase 1, as committed | → **CANVEXIA Davao** ❌ |
| Phase 3, fixed | → **Cebu Partner** ✅ |

Not yet run in production, so this was fixable in place rather than as a data
repair.

## Bug 2 — reassignment left the previous partner in control

`deletePartnerDemo`, `ownDemo` and the demo queries gated on `demoPartnerId`.
Phase 2 added reassignment, which moves `partnerId` and leaves `demoPartnerId`
naming the original builder — so after a merchant moved from A to B, **A could
still edit and delete it**.

The fix is a rule, now written down as D13: `demoPartnerId` is *provenance* and
is never an access check; `partnerId` is *ownership* and is the only thing
authorisation reads. HQ's per-partner counts moved too — counting by builder
credits a partner for merchants they no longer own or get paid for.

## Work

- [x] Backfill claims by creator first, sweeps to the house partner second
- [x] `provisionDemo` sets both columns at creation
- [x] Every ownership check moved from `demoPartnerId` to `partnerId`
- [x] `portal.ts` reads through `partnerDb()`; `where` clause kept for migration lag
- [x] `partners` gained a `partner_self` policy — it had none at all
- [x] Partner brand settings: `packages/core/src/branding/config.ts` + portal page
- [x] Three stale doc comments describing the removed commission program

## Verification

Offline: typecheck ✅ · **933 tests** ✅ (was 918) · build ✅ **118 pages** (was 117).

Live PostgreSQL 16: **DB-backed suite 25/25 across 4 files** — tenant isolation,
partner isolation, reassignment audit, and the new portal test. That last one
asserts a partner's dashboard shows only its own merchants, that a raw
`select id from restaurants` under a partner scope still cannot see another's,
and that one partner cannot write another's `partners` row.

## Caught in my own Phase 2 work

`tests/isolation/reassign-audit.test.ts` had six type errors. I added it *after*
my last typecheck run in Phase 2 and verified only with vitest, so it went in
broken. Fixed here. The lesson is mechanical: run typecheck **after** the last
file is written, not before.

## Deferred, with reasons

**Partner staff management.** `Partner` has a single `authUserId`; real staff
needs a `PartnerStaff` table with its own invite and role model — a schema and
auth change, not a screen. Nothing in Phase 4 depends on it.

**Statements view.** The ledger it reads does not exist until Phase 4. It would
render zero rows by construction.

**Partner custom domains.** `src/server/domains/*` already provisions domains,
but host → *partner* resolution is Phase 5. Wiring the button first ships a
setting that silently does nothing.

## Next — Phase 4

Per-partner Xendit, the ledger, statements. **Still blocked on Q8** (independent
partner accounts vs CANVEXIA-platform sub-accounts) — that needs a conversation
with Xendit, and it decides whether `Partner` stores gateway credentials or a
sub-account id. Phase 4b (the invoice-age suspension arm, D3) is not blocked and
can start regardless.
