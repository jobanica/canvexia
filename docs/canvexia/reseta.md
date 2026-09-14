# Reseta — the pharmacy vertical

The first vertical built here rather than migrated (D24). `apps/reseta`.

Derived from `jobanica/Pharmacy`, a working MVP, for the domain facts — batches,
FEFO, the statutory SC/PWD arithmetic — and from nothing at all for the tenancy,
which is CANVEXIA's. See D28 for what was taken and what was deliberately not.

---

## Status: live

`live: true` in the product registry — the partner portal will create pharmacy
accounts. The gate `adding-a-vertical.md` sets is three things, and all three
are asserted against a real database in
`apps/reseta/tests/isolation/provision.test.ts`:

1. the **real** adapter creates a pharmacy owned by the right partner
2. that partner sees it through RLS **with no where clause**
3. no other partner sees it — not even by primary key

The same run dispenses FEFO across two batches, checks the stock ledger
explains the balance, and checks receipt numbers come out gapless.

```bash
export DATABASE_URL=... DIRECT_URL=...
pnpm --filter reseta test        # 76; the DB-backed ones skip without the URL
```

**Run them as a non-superuser.** A superuser bypasses RLS regardless of `FORCE`
and every assertion passes for the wrong reason.

## Signing in

Session → membership → pharmacy. Nothing takes a pharmacy id from the browser.

- `src/middleware.ts` renews the Supabase access token and does **nothing else**.
  No database, no route gating — it runs on the Edge, and a middleware that
  decides who may see what needs the membership rows, which means Prisma.
- `src/server/tenancy/current-user.ts` reads the session, then
  `pharmacy_staff`, and returns the pharmacy. **This is the only source of a
  pharmacy id.**
- `requireStaff(permission?)` is the gate. Pages and actions call it; the nav is
  filtered separately as a convenience, not as the check.

**The routes have no `[slug]` segment, and that is the point.** They used to.
A slug in the path is a pharmacy id the browser chose, and having one at all
invites exactly one forgotten check.

One login can be staff at several pharmacies — `pharmacy_staff` is unique on
(pharmacyId, authUserId), not on authUserId. The switcher writes a cookie, and
`pickPharmacy` checks it against the memberships: a cookie naming a pharmacy you
are not staff at is **ignored**, not honoured.

### Roles

| | sell | Rx | void | stock | catalogue | reports | staff | settings |
|---|---|---|---|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| pharmacist | ✅ | ✅ | — | ✅ | — | ✅ | — | — |
| cashier | ✅ | — | — | — | — | — | — | — |

**`dispenseRx` is law, not policy.** Under PH practice a prescription-only
medicine is dispensed by, or under the direct supervision of, a registered
pharmacist — so a cashier cannot complete a cart containing one, and neither can
a manager. Seniority is not a licence. The counter says so before they try; the
server checks again with the Rx flags read **from the database**, never from the
form, so a browser that omits the flag cannot talk a cashier's till into
dispensing an antibiotic.

Owner is a superset **by construction**, not a list — a permission added later
must not silently exclude the person who owns the business. An unknown role
grants nothing rather than throwing: the value comes from a database column, and
a crash inside a render is a 500 on every page rather than a denied permission.

### The first account

Staff are added at `/staff` by an owner or manager. That screen needs someone
signed in, so the first account at a pharmacy comes from the bootstrap script:

```bash
pnpm --filter reseta staff:create -- <pharmacySlug> owner <email> <password> [name]
```

Auth user first, membership second — never the reverse, which leaves a
membership pointing at an `authUserId` that does not exist if the second step
fails: a row that looks fine in the staff list and can never be signed into.

Removing staff deletes the membership and **leaves the Auth user alone**. It may
be their login at another pharmacy, and one branch must not remove someone's
access to a different one. The last owner cannot be removed, and nobody can
remove themselves.

## What is in it

| | |
|---|---|
| Tables | 9, all `pharmacy*`, all keyed on `pharmacyId` |
| Policies | `tenant_isolation` on all 9, created by the axis loop without naming any of them |
| Routes | `/login`, `/` (dashboard), `/pos` (counter), `/receiving`, `/staff`, `/logout` |
| Tests | 78 offline, 21 DB-backed |

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

## Receiving

`/receiving`, gated on `manageStock`. Stock enters the system here and nowhere
else, so this is the cheap place to catch a bad expiry date or a fat-fingered
quantity — everything downstream (FEFO, the expiry report, the recall trail) is
only as good as what this lets through.

**Every line becomes its own batch row**, even when the lot number matches
something already on the shelf. Two deliveries are two deliveries: they carry
different costs and FEFO breaks ties on received date. Merging them would
flatten both, and the older batch's margin would quietly become the newer one's.

### Refuse versus warn

The distinction is the whole design of `src/lib/pharmacy/receiving.ts`.

**Refused** — wrong, not merely unusual:

- stock that has **already expired** (accepting it puts a write-off on the shelf
  and hides a supplier problem)
- a line with no product and no name for a new one
- a new product with **no selling price** — the till would hand it out free
- a quantity that is zero, negative or fractional; a negative cost

**Warned, and it still goes through:**

- **short-dated** stock, expiring within 90 days — buying it cheap is a normal
  trade
- **no lot number** — a box of gauze has none, but a recall names a lot, so that
  batch cannot be traced
- **no expiry printed** — stated deliberately with a checkbox, and the warning
  says what it costs: the batch is dispensed last, after all dated stock
- **zero cost** — samples and donations are real; so are typos

A receiving screen that blocks a real delivery gets worked around, and the
workaround is worse than the thing it avoided. So the error list is short and
every entry on it is something nobody should be doing.

### The double-submit guard

The form mints a `deliveryRef` **once**, not per submit, and the write path
refuses a reference it has already seen. Without it a slow connection and an
impatient second click would double the stock on the shelf — and nothing
downstream would notice, because the batches and the movements would both be
internally consistent, just twice.

### Who may create a product

A pharmacist has `manageStock` but not `manageCatalogue`, so they can receive
into products that already exist and cannot add a new one. That is not
awkwardness for its own sake: creating a product means **pricing** it, and the
price is what the till charges. Manager or owner. The screen says so.

## What it still needs

- **Voids and returns.** `PharmacySale.status` and `voidedAt` exist; nothing
  sets them. A void must return stock to the batch it came from and write the
  compensating movement — never edit the sale.
- **The receipt.** `fdaLtoNumber`, `prcLicenseNo` and `tin` are captured and
  displayed nowhere. A PH pharmacy receipt has to show them.
