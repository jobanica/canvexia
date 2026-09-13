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

Steps 1 and 4 are one line each. Step 2 is the work, and how much work depends
entirely on whether the vertical already has multi-tenancy and a partner column.

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

## The part nobody has done yet

Servd is the only product in this monorepo. `jobanica/laundry`,
`jobanica/Pharmacy` and `jobanica/print-new` are separate repositories that share
no code with it — so for those, step 2 is not "write an adapter", it is "give
that codebase partner-aware multi-tenancy first", which is the work of Phase 1
repeated per repo.

That is **Q7**, still open. The adapter interface is deliberately the half that
does not depend on the answer: it is the same interface whether those apps move
into this repo or consume `@servd/core` as a published package from their own.
