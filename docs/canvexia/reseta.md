# Reseta — the pharmacy vertical

The first vertical built here rather than migrated (D24). `apps/reseta`.

Derived from `jobanica/Pharmacy`, a working MVP, for the domain facts — batches,
FEFO, the statutory SC/PWD arithmetic — and from nothing at all for the tenancy,
which is CANVEXIA's. See D28 for what was taken and what was deliberately not.

---

## The one thing left to do

**`live` is `false` in the product registry**, so the partner portal lists
Reseta but refuses to create an account in it (`product_not_live`).

Everything else is done and verified. The gate is one specific thing:
`provisionPharmacy()` has not been run against a real database, because this
repository has no `DATABASE_URL`. `adding-a-vertical.md` says to flip the flag
only after provisioning has been run for real, and the rule earns its keep —
`live: true` makes the portal offer pharmacy accounts, so an adapter bug that
only shows against a database becomes a merchant with an account they cannot
use, discovered by them.

To close it:

```bash
export DATABASE_URL=...   # the CANVEXIA project
export DIRECT_URL=...
pnpm --filter reseta test:isolation     # 7 DB-backed tests; they skip without the URL
```

They assert the three things the flag depends on: a pharmacy is owned by the
partner that created it, that partner sees it through RLS **with no where
clause**, and no other partner sees it at all. Green ⇒ set
`live: true` in `packages/core/src/products/registry.ts`. One line.

**Run them as a non-superuser.** A superuser bypasses RLS regardless of `FORCE`
and every assertion passes for the wrong reason.

## What is in it

| | |
|---|---|
| Tables | 9, all `pharmacy*`, all keyed on `pharmacyId` |
| Policies | `tenant_isolation` on all 9, created by the axis loop without naming any of them |
| Routes | `/` (dev console), `/[slug]` (dashboard), `/[slug]/pos` (counter) |
| Tests | 40 offline, 7 DB-backed |

**Catalogue · batches · suppliers · stock movements · POS · expiry and low-stock
reporting.** Not in this pass: HRIS, loyalty, prescriptions as records, stock
transfers, stocktakes, PO receiving, z-readings, online orders. Reseta has all of
those and they are all real; none is load-bearing for the platform question this
pass had to answer.

## The three things worth knowing before changing it

### 1. Stock is batches, not a number

`pharmacy_batches` is what makes this a pharmacy system rather than a shop
system. On-hand is `sum(quantity)` over **unexpired** batches, computed on read
— expired stock is not sellable, so it is not stock. A stored count and a batch
list are two numbers that drift, and the one that matters for dispensing is the
batch list.

A recall names a **lot**, not a product. That is why a sale line is per *batch*:
a quantity spanning two batches becomes two lines, each snapshotting the lot
number and expiry.

### 2. FEFO, not FIFO

`src/lib/pharmacy/fefo.ts`. Dispense the batch expiring **soonest**. Received
date only breaks ties, because a delivery received last week routinely expires
before one received last year.

Expired batches are excluded outright rather than sorted last — dispensing an
expired medicine is not a worse option, it is not an option, and leaving them in
the list to be picked when everything else runs out is exactly the situation
where a busy counter dispenses one.

Dates are compared in **Asia/Manila**, not server-local. A UTC server marks
stock expired eight hours early: between midnight and 08:00 Manila it is still on
yesterday's date, so a batch expiring today reads as expired for the whole
morning shift. A test caught this; nothing about it is visible in normal use.

### 3. The SC/PWD discount is statute, and the obvious formula is wrong

`src/lib/pharmacy/discount.ts`. RA 9994 (Senior Citizens) and RA 10754 (PWD) both
give 20% off the **VAT-exclusive** price, and the sale is VAT-exempt:

```
net = (price / 1.12) * 0.8
```

`price * 0.8` is the mistake this invites, and it overcharges by exactly the VAT
on the discounted price — ₱9.60 on a ₱112 box, on every line, silently, forever.

The VAT rate is a column on the merchant, not a constant: a statutory rate change
must not mean a code change to a statutory calculation.

The till computes its preview with the **same function** the server uses. A till
that shows one number and charges another is the worst bug available here, and
two copies of this formula is how it would happen.

## How it plugs into the platform

```
partner portal
  → provisionMerchant("pharmacy", partnerId, {...})   @servd/core, knows nothing about pharmacies
    → resetaAdapter.provisionMerchant                 apps/reseta, the only file that knows
      → provisionPharmacy                             writes pharmacies.partnerId
```

The adapter is 25 lines. Servd's is 45, and the difference is the whole argument
for D24: Servd's has to wrap a creation path that predates CANVEXIA and thread
ownership through it, while `pharmacies.partnerId` existed before the first row.

Ownership is set in the statement that creates the row, never in a follow-up
update. A pharmacy created without a partner is invisible to its partner under
RLS and absent from every statement, and **nothing errors to say so**.

## Setting it up on a database

1. `packages/db/prisma/manual/add-pharmacy-vertical.sql` — idempotent; renames
   `partner_ledger_entries."restaurantId"` to `merchantId` rather than dropping
   it (`prisma migrate diff` emits the destructive version).
2. `pnpm --filter @servd/db db:rls` — the axis loop covers the pharmacy tables
   automatically; there is no pharmacy-specific policy to remember.
3. Confirm zero tables without RLS, and an empty Supabase security advisor.

## What it still needs

- **Sign-in.** There is no session. `/` lists every pharmacy, which is why it
  says it is a development console. `pharmacy_staff` exists and carries the
  roles; wiring Supabase Auth changes who gets an id, not what the id can reach.
- **Receiving stock.** Batches are created by the isolation fixture and by SQL.
  A receiving screen writing a `receive` movement is the next obvious piece.
- **Voids and returns.** `PharmacySale.status` and `voidedAt` exist; nothing
  sets them. A void must return stock to the batch it came from and write the
  compensating movement — never edit the sale.
- **The receipt.** `fdaLtoNumber`, `prcLicenseNo` and `tin` are captured and
  displayed nowhere. A PH pharmacy receipt has to show them.
