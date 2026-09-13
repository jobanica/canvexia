# Phase 6 — the product adapter ✅

The brief's requirement, in one line: *"Adding a new vertical must not require
touching the partner portal."* The portal called `provisionDemo` — Servd's own
restaurant-creation function — so adding laundry meant editing the portal, and
the portal then knew about laundry.

- [x] `ProductAdapter` + registry + `provisionMerchant(productId, partnerId, payload)`
      in `packages/core`
- [x] Servd's adapter — fifteen lines, wrapping `provisionDemo` rather than
      reimplementing creation
- [x] `createPartnerDemo` goes through the dispatch; nothing in the portal path
      names a restaurant
- [x] Guards: unknown product · not live · no adapter · invalid input · partner
      not approved
- [x] `docs/canvexia/adding-a-vertical.md` — the scaffold
- [x] 13 unit tests + 6 end-to-end

## Verification

Offline: typecheck ✅ · **996 tests** ✅ (was 983) · build ✅ 118 pages.

Live PostgreSQL: **38/38 across 6 DB-backed files**. The new one provisions a
merchant through the real dispatch and asserts the chain Phases 1–3 built:

| Check | Result |
|---|---|
| Merchant created, owned by the partner | ✅ `partnerId` and `demoPartnerId` both set |
| Slug assigned by the product, returned by the adapter | ✅ matches the row |
| Visible to that partner **with no where clause** | ✅ RLS alone |
| Invisible to another partner | ✅ zero rows |
| Suspended partner | ✅ refused |
| Product not live | ✅ refused with `product_not_live` |

## Design points worth keeping

**A registry, not an import.** Core cannot import Servd without depending on a
Next app and a Prisma schema. The vertical knows about core; core knows only that
something claimed a product id.

**The shared payload is deliberately small.** Every field on it must be rendered
for every vertical, so each addition taxes all of them. Product-specific fields go
in `extra`, and the friction of needing your own step for it is the point.

**The adapter sets ownership itself.** The dispatch cannot — only the adapter
knows where its product records an owner, and a merchant created without one is
invisible to its partner and absent from every statement, with nothing erroring.

**A payload cannot override the partner.** The partner comes from the session;
asserted by test, because a payload field winning would let one partner open
accounts owned by another.

## Q7 split this phase, and only half is built

**Built** — the interface, the dispatch, Servd's adapter, the portal calling
through it. The same interface holds whether the other verticals move into this
monorepo or consume `@servd/core` from their own repositories.

**Not built** — migrating `jobanica/laundry`, `jobanica/Pharmacy`,
`jobanica/print-new`. Three codebases sharing no code with Servd, none attached
to this session. For those, "write an adapter" is preceded by "give that codebase
partner-aware multi-tenancy", which is Phase 1 repeated per repo.

They sit in the registry as `live: false`: visible to partners, refused by the
dispatch. That is the honest state until Q7 is answered.

The scaffold is **written, not generated** — `docs/canvexia/adding-a-vertical.md`,
from having done it for Servd. A code scaffold for repositories nobody here has
read would be fiction.
