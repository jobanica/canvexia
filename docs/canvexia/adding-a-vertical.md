# Adding a vertical

What it takes to make a new product provisionable, written from actually doing it
for Servd rather than from imagining it.

The promise the adapter exists to keep: **adding a vertical does not mean editing
the partner portal.** If you find yourself opening a file under
`src/app/(platform)/partner/` to add a product, something below has been skipped.

---

## The short version

1. Add an entry to `packages/core/src/products/registry.ts` with `live: false`.
2. Implement `ProductAdapter` for it.
3. Register the adapter from a module the app imports.
4. Flip `live: true` once provisioning works against a real database.

Steps 1 and 4 are one line each. Step 2 is the work — and for a vertical written
here from scratch (D24) it is small, because the partner axis exists before the
first row. The three MUSTs under step 2 are written against Servd's adapter,
which had to retrofit all of this; read them as requirements, not as difficulty.

---

## 1. Register the product

```ts
// packages/core/src/products/registry.ts
laundry: {
  id: "laundry",
  name: "Laundry",
  description: "Pickup and delivery laundry with subscriptions and rider ops.",
  live: false,
},
```

`live: false` is not a placeholder — it is load-bearing. The portal lists the
product so partners can see what is coming, and `provisionMerchant` refuses it
with `product_not_live`. A product visible but not creatable is a deliberate
state; a product creatable before its adapter works is an account a partner
cannot use and a merchant who finds out first.

## 2. Implement the adapter

```ts
import { registerProductAdapter, type ProductAdapter } from "@servd/core";

export const laundryAdapter: ProductAdapter = {
  productId: "laundry",
  async provisionMerchant(input) {
    // input: { partnerId, name, address?, phone?, logoUrl?, tagline?, extra? }
    // Create the tenant however this product creates tenants.
    // Return the id and slug it assigned.
    return { merchantId, slug };
  },
};
```

Three things the adapter MUST do, each learned from the Servd one:

**Set ownership itself.** The dispatch cannot do it — only the adapter knows
where its product records an owner. A merchant created without a `partnerId` is
invisible to its partner under the RLS policies and absent from every statement,
and nothing errors to say so. Servd's adapter gets this by passing `partnerId`
into `provisionDemo`, which writes both `partnerId` (ownership) and
`demoPartnerId` (provenance) — see D13 for why those are different questions.

**Assign the slug, and return the one you assigned.** Uniqueness is the
product's problem, not the portal's. Servd's adapter reads the slug back rather
than guessing it, because `provisionDemo` is what guarantees it is unique.

**Wrap the product's existing creation path rather than reimplementing it.**
Servd's adapter is fifteen lines because `provisionDemo` already handles the
things that are easy to get wrong the second time: a unique slug, a
complimentary open-ended trial so ordering is unlocked while the partner is
pitching, the receipt header. A second creation path is a second thing to keep in
step.

## 3. Register it

```ts
// apps/<product>/src/server/products/index.ts
import "./laundry-adapter";   // imported for the side effect
```

Anything that dispatches must import **that** module, not `@servd/core`
directly — otherwise the registry is empty and every product reports
`no_adapter`. `apps/servd/src/server/products/index.ts` is the worked example.

## 4. Flip it live

Only after provisioning has been run against a real database and the merchant it
created is:

- owned by the right partner,
- visible to that partner through RLS with **no where clause** in the query,
- invisible to any other partner.

`apps/servd/tests/isolation/provision.test.ts` asserts exactly those three and is
the template. Copy it before writing the adapter, not after — it is a shorter
list of requirements than this document.

---

## What the adapter does NOT do

- **Check the partner.** Whether an operator may open accounts is the platform's
  question, and it is answered in `provisionMerchantForPartner` before dispatch.
  An adapter that re-checks is duplicating a rule that will drift.
- **Decide the price or the split.** Those are partner terms (D1, D2), not
  product facts.
- **Know about CANVEXIA branding.** The brand engine resolves per partner (D20);
  a vertical renders what it is handed.

---

## This is the primary path now

**D24: new verticals are built from scratch in this monorepo**, not migrated.
`jobanica/laundry`, `jobanica/Pharmacy` and `jobanica/print-new` are
specification — read them for what the product must do — rather than code to move
across.

That makes step 2 easier than it reads above. Servd's adapter wraps an existing
creation path because Servd had one before CANVEXIA existed; a vertical written
here writes creation **once**, with the partner axis already in place. No
backfill, no grandfathering, no reconciling an identity model that predates
tenancy — the whole class of problem that produced the Phase 1 and Phase 3
ownership bugs simply does not arise when `partnerId` exists before the first row.

Two things to settle before the first new vertical, not after:

- **One Prisma schema or one per product.** Everything so far assumes one
  database: the RLS policies, `restaurants."partnerId"`, `partner_ledger_entries`.
  A second app either adds its domain tables beside Servd's or needs its own
  database, in which case the partner and ledger tables need a home both can
  reach. Sharing is lighter and is what the current design implies — but decide
  it rather than discover it.
- **What goes in `packages/db` and `packages/ui`.** They are empty stubs today.
  The moment there are two apps here, the shared tenancy and billing models and
  the shared components belong in them rather than in whichever app was written
  first.
