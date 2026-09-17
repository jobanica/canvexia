# Resceta — the pharmacy vertical

The first vertical built here rather than migrated (D24). `apps/resceta`.

Derived from `jobanica/Pharmacy`, a working MVP, for the domain facts — batches,
FEFO, the statutory SC/PWD arithmetic — and from nothing at all for the tenancy,
which is CANVEXIA's. See D28 for what was taken and what was deliberately not.

---

## Status: live

`live: true` in the product registry — the partner portal will create pharmacy
accounts. The gate `adding-a-vertical.md` sets is three things, and all three
are asserted against a real database in
`apps/resceta/tests/isolation/provision.test.ts`:

1. the **real** adapter creates a pharmacy owned by the right partner
2. that partner sees it through RLS **with no where clause**
3. no other partner sees it — not even by primary key

The same run dispenses FEFO across two batches, checks the stock ledger
explains the balance, and checks receipt numbers come out gapless.

```bash
export DATABASE_URL=... DIRECT_URL=...
pnpm --filter resceta test        # 171; the DB-backed ones skip without the URL
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
pnpm --filter resceta staff:create -- <pharmacySlug> owner <email> <password> [name]
```

Auth user first, membership second — never the reverse, which leaves a
membership pointing at an `authUserId` that does not exist if the second step
fails: a row that looks fine in the staff list and can never be signed into.

Removing staff deletes the membership and **leaves the Auth user alone**. It may
be their login at another pharmacy, and one branch must not remove someone's
access to a different one. The last owner cannot be removed, and nobody can
remove themselves.

### Forgetting a password

`/forgot-password` → Supabase emails a link → `/reset-password`. Both are client
components: the recovery token arrives in the URL **fragment**, which never
reaches a server, and the new password goes straight to Supabase rather than
through a Server Action body.

`/reset-password` checks for a session before it offers the form and waits on
`onAuthStateChange` rather than reading synchronously on mount — the fragment
exchange is asynchronous, and a synchronous read shows "this link has expired"
to somebody whose link is fine.

There was none of this before, and with no login handover either, a forgotten
password meant the `staff:create` script and the service-role key.

## What is in it

| | |
|---|---|
| Tables | 11, all `pharmacy*`, all keyed on `pharmacyId` |
| Policies | `tenant_isolation` on all 11, created by the axis loop without naming any of them |
| Routes | `/login`, `/forgot-password`, `/reset-password`, `/` (dashboard), `/pos`, `/receipts`, `/receipts/<id>`, `/receipts/<id>/print`, `/receiving`, `/catalogue`, `/settings`, `/staff`, `/logout` |
| Tests | 130 offline, 41 DB-backed |

**Catalogue · batches · suppliers · stock movements · POS with voids, returns
and a printable BIR receipt · expiry and low-stock reporting.** Not in this pass: HRIS, loyalty, prescriptions as records, stock
transfers, stocktakes, PO receiving, z-readings, online orders. The source MVP has all of
those and they are all real; none is load-bearing for the platform question this
pass had to answer.

### What is NOT here, and is not a domain feature

Known gaps against what a Servd merchant gets, so nobody rediscovers them:

- **No billing at all.** `Subscription.restaurantId` — a pharmacy has no
  subscription row, so no plan, no expiry, no renewal, no invoice. Worse,
  `recordSettlement` takes a `restaurantId` and reads `tx.restaurant`, so a
  pharmacy can never produce a ledger entry: a partner selling Resceta earns
  nothing this platform records and CANVEXIA's 30% never accrues.
- **HQ cannot reassign, move or re-plan a pharmacy** — three `productId !==
  "servd"` refusals in `hq/merchants-actions.ts`, each with its own message.
- **No login handover.** `convertPartnerDemo` is Servd-only, so the first
  account at a pharmacy still comes from the `staff:create` script. The reset
  flow below is what stops that being the only recovery path as well.
- No partner branding, no feedback inbox, no HQ announcements, no tutorials.
- No PWA, no service worker, no offline queue — arguably needed more at a
  pharmacy counter than at a restaurant till.

Suspension is NO LONGER on that list: `setStatus` in
`servd/src/server/partners/merchant-actions.ts` writes `pharmacies.status` for
`productId === "pharmacy"`, which the counter already honours.

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
    → rescetaAdapter.provisionMerchant                 apps/resceta, the only file that knows
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

### `/catalogue` — and why it had to exist

Receiving was for a while the ONLY way a product came into being, and it set two
of the sixteen columns on `pharmacy_products`: `name` and `priceCentavos`.
Nothing anywhere could update one afterwards. Three things followed:

1. **`requiresPrescription` was written in zero places and read in six** — the
   sale gate, the counter's warning, the dashboard badge, `authoriseSale`. So
   the rule this file calls law rather than policy was enforced flawlessly
   against a flag that was false for every product in every pharmacy and could
   not be changed. A cashier could complete a cart containing an antibiotic,
   and every layer above behaved exactly as designed.
2. **`reorderPoint` defaulted to 0**, and the dashboard computes `onHand <=
   reorderPoint`. Low stock therefore fired only once an item had run out — a
   post-mortem, not a warning. The catalogue shows 0 as "not set" and counts how
   many are still in that state, because every product created before this
   screen has one.
3. A price could never be corrected after the first delivery.

Writes run in `systemDb` for the same reason as `settings.ts`: `audit_logs` sits
on the restaurant axis and has no pharmacy policy, so an insert under the
pharmacy scope is refused, and splitting a change to a statutory flag from its
own audit row across two transactions is how a change ends up with no trail.
The whole record is stored either side, not a diff — what the Rx flag USED to be
is the question an inspection asks.

Products are **archived**, never deleted. Batches, stock movements and sale
lines all point at the row; removing it would orphan a receipt already handed to
a customer.

## Undoing a sale

Two operations, and the difference is not paperwork.

**Void** — the sale never really happened. Rung up twice, wrong customer,
cashier error. Every unit goes back to the **exact batch it left**, and the
receipt is marked voided. **Same business day only.**

**Return** — the sale happened and is being partly undone. Its own document with
its own number (`CN00000001`), any time. Stock does **not** go back on the shelf
by default.

### Why the void window

A receipt is a reported figure. Voiding one from a day already closed off
changes a number that has been filed — which is exactly what a credit note
exists to avoid: you do not edit history, you post a correction against it. So a
void is available while the day is open and a return afterwards. That is a
signpost rather than a block; it routes you to the instrument that fits instead
of inviting a workaround.

A sale that already has a credit note cannot be voided either. It has been
partly undone, and voiding as well gives the money back twice.

### Returned medicine does not go back on the shelf

`disposition` defaults to `destroyed`, and that is a pharmacy fact rather than a
preference. Once a medicine has left the premises nobody can verify how it was
stored or whether the pack was tampered with. A shop can restock a returned
kettle; a pharmacy cannot restock a returned box of antibiotics.

`restocked` exists for the case that genuinely happens — a sealed item handed
back across the counter before the customer left — and it is a per-line choice
that needs `manageStock`, not merely the permission to take the money back.

**When it is restocked, it goes into the lot it CAME from.** A return points at
the original sale *line*, which names the batch. The system this was derived
from points at the product and restocks the newest batch, which puts a unit from
one lot into another and makes both counts wrong. A recall names a lot.

Either way a movement is written. Destroyed stock still moved — it left the
customer and did not come back to the shelf — and a ledger that only records
what it kept cannot explain what it did not.

### The refund is prorated

Priced from the original line, never today's price, and then scaled by what the
customer actually paid. A ₱1,000 sale discounted to ₱800 refunds 80% of list.
Skipping this would overpay on **every** SC/PWD return, because every SC/PWD
sale is discounted — ₱112 of shelf price against ₱80 actually taken.

## What it still needs

- **Voids and returns.** `PharmacySale.status` and `voidedAt` exist; nothing
  sets them. A void must return stock to the batch it came from and write the
  compensating movement — never edit the sale.
- **The receipt.** `fdaLtoNumber`, `prcLicenseNo` and `tin` are captured and
  displayed nowhere. A PH pharmacy receipt has to show them.
