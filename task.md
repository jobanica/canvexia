# Where CANVEXIA is, and what to do next

CANVEXIA is separate from servdph.com — its own database, its own merchants, its
own domains (D31). Two products live: **Servd** (restaurants) and **Reseta**
(pharmacy). 1,199 tests pass.

| Domain | Serves | Deployment |
|---|---|---|
| **servdph.net** | Servd — restaurants | `apps/servd` |
| **canvexia.com** | CANVEXIA — the partner portal | `apps/servd`, same deployment |
| **risceta.com** | Reseta — pharmacy | `apps/reseta` |

---

# Your pharmacy account

Created in the CANVEXIA database and verified — the password hash actually
verifies, the identity row is there, and the membership resolves.

| | |
|---|---|
| Pharmacy | **CANVEXIA Pharmacy Davao** (`canvexia-pharmacy-davao`) |
| Owned by | CANVEXIA Davao — the house partner |
| Sign in | `owner@risceta.com` |
| Password | `a9eETJaAPvFE-Rx7` — **temporary, change it** |
| Role | owner (every permission) |
| Status | **pending** |

**It is `pending` on purpose, and that is the one thing to decide.** A pharmacy
cannot legally dispense before its FDA Licence to Operate is on file, so
provisioning creates it pending and defaulting to active would mean the platform
had enabled it. Everything works except selling. When the LTO is in hand:

```sql
update pharmacies
   set status = 'active',
       "fdaLtoNumber" = 'YOUR-LTO',
       "prcLicenseNo" = 'YOUR-PRC',
       tin = 'YOUR-TIN',
       "updatedAt" = now()
 where slug = 'canvexia-pharmacy-davao';
```

Rename it freely — Reseta has no slug in its URLs (D30), so the name and slug
are display only.

---

# What to do next

## 1. Deploy Reseta and sign in

The account is waiting; the app is not up. Set the env from
`apps/reseta/.env.example` — the same `DATABASE_URL` Servd uses, plus the
Supabase Auth keys from the same project — and deploy `apps/reseta`.

Then: sign in → **Receive** a delivery → **Counter** to sell it → **Receipts**
to void or return it. That is the whole loop, and it is worth walking once
before anyone else touches it.

## 2. The receipt

The last real gap in the counter. `fdaLtoNumber`, `prcLicenseNo` and `tin` are
captured and displayed **nowhere** — a PH pharmacy receipt has to carry them,
and an SC/PWD sale has to show the beneficiary's ID. Nothing prints today.

## 3. Then one of

- **Expiry write-offs.** The dashboard shows what has expired; nothing can act
  on it. `expiry_writeoff` is already in the movement enum.
- **A daily Z-reading.** The void window depends on "the business day" and
  nothing closes one off — it is reckoned from the Manila calendar date, which
  is right until a pharmacy trades past midnight.
- **DNS**, when you are ready — `docs/canvexia/domains.md` has the table.

---

# What just landed: voids and returns

Two operations, and the difference is not paperwork.

**Void** — the sale never happened. Every unit back to the **exact batch it
left**, receipt marked voided. **Same business day only**: a receipt is a
reported figure, and voiding one from a closed day changes a number that has
been filed. That is what a credit note exists to avoid. The window is a signpost
to the right instrument, not a block — a reversal screen that simply refuses
gets worked around, and the workaround is a drawer that does not reconcile.

**Return** — its own document, its own number series (`CN00000001`), any time.

## Two places I did not follow Reseta

`jobanica/Pharmacy` was the source for the domain facts, and on returns it does
two things I deliberately did not copy:

**It restocks every return.** Once a medicine has left the premises nobody can
verify how it was stored or whether the pack was tampered with. A shop can
restock a returned kettle; a pharmacy cannot restock a returned box of
antibiotics. `disposition` defaults to **destroyed**, and restocking is a
per-line choice needing `manageStock` — not merely permission to hand the money
back.

**It restocks into the newest batch.** Its return items point at a *product*, so
the lot is already lost. Mine point at the original sale *line*, which names the
batch — so a restock goes back where it came from. A recall names a lot, and a
unit from one lot counted into another makes both figures wrong.

A test asserts both: a void leaves `SOON` and `LATER` at exactly their starting
quantities rather than piling everything into the newest batch.

## The refund is prorated

Priced from the original line, then scaled by what was actually paid. Not an
edge case: **every SC/PWD sale is discounted**, so refunding list price would
overpay on every statutory return — ₱112 of shelf price against ₱80 taken.

## One invariant worth knowing about

A test runs at the end over every product: **the movement ledger sums to the
batch quantities.** The batch quantity is the balance and the ledger is the
statement explaining it. A reversal that touched one without the other shows up
there and nowhere else.

## Numbers

- **Reseta 101 offline + 34 DB-backed**
- **Servd 1,026 offline + 38 DB-backed**
- both typecheck, both build; RLS covers the two new tables automatically
  (the axis loop, D29), 100 of 100 tables forced, advisor clean
