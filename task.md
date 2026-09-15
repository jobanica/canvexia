# Where CANVEXIA is, and what to do next

CANVEXIA is separate from servdph.com — its own database, its own merchants, its
own domains (D31). Two products live: **Servd** (restaurants) and **Resceta**
(pharmacy). 1,295 tests pass, none skipped.

| Domain | Serves | Deployment |
|---|---|---|
| **servdph.net** | Servd — restaurants | `apps/servd` |
| **canvexia.com** | CANVEXIA — the partner portal | `apps/servd`, same deployment |
| **resceta.com** | Resceta — pharmacy | `apps/resceta` |

---

# Your pharmacy account

Created in the CANVEXIA database and verified — the password hash actually
verifies, the identity row is there, and the membership resolves.

| | |
|---|---|
| Pharmacy | **CANVEXIA Pharmacy Davao** (`canvexia-pharmacy-davao`) |
| Owned by | CANVEXIA Davao — the house partner |
| Sign in | `owner@resceta.com` |
| Password | **not in this repo** — see below |
| Role | owner (every permission) |
| Status | **pending** |

**It is `pending` on purpose, and that is the one thing to decide.** A pharmacy
cannot legally dispense before its FDA Licence to Operate is on file, so
provisioning creates it pending and defaulting to active would mean the platform
had enabled it. Everything works except selling.

The licence numbers go in through **Settings** in Resceta. **Activation is done
in the CANVEXIA partner portal** — `/partner`, under *Your pharmacies* — not in
psql (D36). The portal refuses until the FDA LTO is on file, and writes an audit
row naming the partner who did it and the licence number they acted on.

So the order is: record the LTO in Resceta's Settings, then press **Activate**
in the partner portal.

Rename it freely — Resceta has no slug in its URLs (D30), so the name and slug
are display only.

### The password is not written down here, and that is the fix

`jobanica/canvexia` is a **public** repository, and the first temporary password
for this account was committed to this file. It was readable by anyone for the
length of five commits, and it is still in the git history — rewriting history
would not undo a public clone, an index, or a fork.

So it was **rotated**, which is the only thing that actually closes it. The
replacement was handed over in chat and deliberately not committed. Change it
again from the app the first time you sign in.

Nothing else was exposed: the Supabase anon key is public by design, and the
service-role key and database password have never been in the repository. The
account had never been signed into, and `audit_logs` records no action against
it.

**Do not put the next one in a file here.** If a credential has to be shared,
share it out of band and rotate it after.

---

# What to do next

## 1. Deploy Resceta and sign in

The account is waiting; the app is not up. Set the env from
`apps/resceta/.env.example` — the same `DATABASE_URL` Servd uses, plus the
Supabase Auth keys from the same project — and deploy `apps/resceta`.

**Deployment: two projects, one repository** — `docs/canvexia/domains.md` has
the whole setup. The short version: a second Vercel project with Root Directory
`apps/resceta`, **Include source files outside of the Root Directory** turned on,
Node 22. Both `vercel.json` files set `ignoreCommand: npx turbo-ignore`, so a
change in `apps/servd` no longer redeploys the pharmacy — but a change in
`packages/db` still correctly rebuilds both.

Then, in this order:

1. **Settings** → enter the TIN, address, FDA LTO and PRC number as the
   documents arrive. None of them is required to save: until they are in, the
   receipt prints marked *NOT AN OFFICIAL RECEIPT*, which is the honest
   version. The **VAT rate** is the one field that will not save blank — an
   empty box would read as 0, i.e. "not VAT-registered".
2. Run the activation SQL above.
3. **Receive** a delivery → **Counter** to sell it → **Print receipt** →
   **Receipts** to void or return it.

That is the whole loop, and it is worth walking once before anyone else touches
it.

## 2. Then one of

- **Expiry write-offs.** The dashboard shows what has expired; nothing can act
  on it. `expiry_writeoff` is already in the movement enum.
- **A daily Z-reading.** The void window depends on "the business day" and
  nothing closes one off — it is reckoned from the Manila calendar date, which
  is right until a pharmacy trades past midnight.
- **DNS**, when you are ready — `docs/canvexia/domains.md` has the table. There
  is nothing to change in Resceta for it: the app reads no absolute URL, so it
  runs the same on a `vercel.app` address or a custom domain.

---

# What just landed: the receipt

`lib/pharmacy/receipt.ts` builds the document — the arithmetic *and the order of
the summary rows*, tested, rather than laid out in JSX. It prints on an 80mm
thermal roll from `/receipts/<id>/print`, and the counter links straight to it
after a sale.

## The stored discount is not the statutory discount

The finding that made the module worth having. On a ₱112.00 shelf price a Senior
Citizen pays ₱80.00, so the stored `discountCentavos` is **₱32.00** — but ₱12.00
of that is VAT removed *before* the 20%. Printing ₱32.00 as "20% discount" says
28.6%, and **₱32.00 is not what the pharmacy may claim**: the statutory discount
is a tax deduction and the deductible figure is ₱20.00.

A statutory sale now prints the five rows a BIR examiner reads:

```
Total (VAT-inclusive)              ₱112.00
Less VAT (12%)                     −₱12.00
Total (VAT-exempt)                 ₱100.00
Less 20% Senior Citizen discount   −₱20.00
Amount due                          ₱80.00
```

The receipt *screen* was showing the wrong figure too. It renders from the same
function now — two screens disagreeing about a statutory number is worse than
either being wrong alone.

## Every figure is a subtraction from a stored one

`totalSale` rounds per line, so re-totalling on the receipt can land a centavo
from the money that changed hands. The rounding drift is pushed entirely into
the statutory discount — the residual — so the printed rows add up to what was
charged by construction. Same rule in the VAT box: the exempt portion is carved
out first and the VAT derived by subtraction, so `vatable + vat + exempt` equals
the amount due for every input. A DB-backed test asserts both through a real
sale, not a fixture.

## A blank where the TIN goes still looks official

The tempting behaviour is to print the receipt with the missing fields left out.
The customer cannot tell the difference; an auditor can. So the paper prints
**NOT AN OFFICIAL RECEIPT** and names what is missing, and `isOfficial` stays
false until nothing is. On a statutory sale the beneficiary's name and ID are on
that list — the discount is not valid without them.

Not being VAT-registered is *not* a gap. Set the VAT rate to 0 and the receipt
drops the VAT box and prints the non-VAT wording, because a box of zeros says
"VAT-registered, sold nothing VATable" — a different statement.

## And a settings screen, because otherwise it is permanently blank

`manageSettings` had been in `roles.ts` since the start with nothing using it.
Those four fields could only be set with raw SQL. `/settings` is owner-only and
writes the whole record either side of the change to `audit_logs` — not a diff
of field names, because what an audit asks is what the TIN *used to be*.

## Numbers

- **Resceta 161 offline + 45 DB-backed**
- **Servd 1,043 offline + 46 DB-backed**
- both typecheck, both build

One more thing turned up while verifying: `turbo run test` was **hiding
`DATABASE_URL`** from the test task (strict env mode again, same root cause as
the build-env fix), so all 79 DB-backed tests across both apps skipped
themselves and the run reported green. Declared now, and asserted by the same
drift test — a suite that skips is worse than one that fails, because nobody
investigates a pass.
