# Next: one command, then Reseta goes live

The first vertical is built. **Reseta** — pharmacy POS, batch inventory, expiry
tracking — at `apps/reseta`. Full notes in `docs/canvexia/reseta.md`.

## The one thing left

`live` is `false` in the product registry, so the partner portal lists Reseta
and refuses to open an account in it. The gate is one specific thing:
`provisionPharmacy()` has not run against a real database, because this
repository has no `DATABASE_URL`.

```bash
export DATABASE_URL=...   # the CANVEXIA project
export DIRECT_URL=...
pnpm --filter reseta test:isolation
```

Green ⇒ set `live: true` in `packages/core/src/products/registry.ts`. One line.

I did not flip it myself. `live: true` makes the portal offer pharmacy accounts,
so an adapter bug that only shows against a database becomes a merchant with an
account they cannot use — discovered by them.

## Why pharmacy, and not laundry or print

I opened the three repositories D24 names as the specification. Two are **empty**:

| Repository | The brief says | Actually |
|---|---|---|
| `jobanica/print-new` | *"fully specced, 22-phase build, 33-table schema"* | **empty** |
| `jobanica/laundry` | pushed 2026-09-12 | **empty** |
| `jobanica/Pharmacy` | — | **347 files, complete MVP**, 39 tables, live |

Your own constraint then picks the vertical: *"Do not guess on schema for
Pharmacy or Laundry."* For laundry and print there is nothing to read, so
building either means guessing. For pharmacy there is a working schema to derive
from. See D28.

## Three domain facts I took rather than invented

- **FEFO, not FIFO** — dispense the batch expiring *soonest*. A delivery received
  last week routinely expires before one received last year.
- **The SC/PWD discount is 20% off the VAT-EXCLUSIVE price** and the sale is
  VAT-exempt. `price * 0.8` is the obvious formula and it overcharges every
  beneficiary by the VAT on the discounted price — ₱9.60 on a ₱112 box, silently.
- **Receipt numbers are allocated by incrementing a counter** inside the sale
  transaction. Counting rows reissues a number after a void; BIR wants the
  sequence gapless.

## What else changed

**The schema moved to `packages/db`** (D25). Its stated blocker was that ~20
error strings name `prisma/manual/add-X.sql` — which is an argument for moving
them *atomically with the directory*, not for waiting on a database this repo
cannot reach. All 37 references moved in the same commit.

**RLS now loops over merchant axes** (D29). `pharmacies` sits beside
`restaurants`; each product has its own merchant table carrying `partnerId`, and
`rls.sql` iterates over the axes instead of hard-coding `restaurantId`. Adding a
product is **one array entry** — applying it created `tenant_isolation` on all
nine pharmacy tables without naming any of them.

`partner_ledger_entries."restaurantId"` became `merchantId` + `productId`. It was
never a restaurant id in meaning, and it cannot be a foreign key when which table
it indexes depends on the product.

## Proved against the live CANVEXIA database

Two partners, a pharmacy each, read back as `app_user` with **no where clause**:

- partner sees its own pharmacy, products and lot numbers — and nothing else
- a partner fetching a rival's batch **by primary key** gets nothing
- a partner updating a rival's pharmacy to claim it affects **0 rows**
- a merchant reading `partner_ledger_entries` gets nothing
- **98 of 98** tables RLS-enabled and forced · security advisor **empty**

Fixture deleted afterwards; the database holds reference data and the house
partner only.

Offline: **1,036 tests pass** (996 Servd + 40 Reseta), both apps typecheck, both
build. CI now runs `pnpm -r` so a third app is covered without editing it.

## Still queued

1. **Apply the four migrations to servdph.com** — `docs/canvexia/deploy-runbook.md`.
   Unchanged and still correct; this work does not advance it. It also closes the
   `anon`-key hole from D27, which is live there now.
2. **Sign-in for Reseta.** No session yet; `/` lists every pharmacy, which is why
   it says it is a development console.
3. **Receiving, voids, and the receipt** — see the end of `docs/canvexia/reseta.md`.
