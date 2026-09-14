# Where Reseta is, and what to do next

Stock can now get **in** (`/receiving`), get **sold** (`/pos`), and be **seen**
(`/`). People sign in and are gated by role. `live: true` — the partner portal
will create pharmacy accounts.

---

# What to do next

## 1. Apply the four migrations to servdph.com — do this first

This has been outstanding through three pieces of work and it is the only item
with a live customer on the other end. `docs/canvexia/deploy-runbook.md`, six
steps, rehearsed end to end.

It also closes the `anon`-key hole from **D27**: Supabase grants the
browser-side key full read/write on any table without RLS, and `prospect_leads`
— names, phones, emails and addresses of your sales leads — is one of twelve
tables on servdph.com that have no policy at all right now. Step 2 of the
runbook fixes it.

**I cannot do this one.** No credentials, and applying migrations to a live
database is not something to run unattended.

## 2. Get Reseta onto a real pharmacy

In order:

```bash
# a. the three Supabase variables — see apps/reseta/.env.example
# b. the first account (the /staff screen needs someone already signed in)
pnpm --filter reseta staff:create -- <pharmacySlug> owner <email> <password> "Name"
# c. sign in at /login, receive a delivery at /receiving, sell it at /pos
```

A pharmacy is created by a partner through the CANVEXIA portal, not by a form in
Reseta — so you need a partner and a merchant first.

## 3. Then the next piece of Reseta

Pick one; they are independent. My order, most useful first:

- **Voids and returns.** `PharmacySale.status` and `voidedAt` exist and nothing
  sets them. A void must return stock **to the batch it came from** and write
  the compensating movement — never edit the sale. This is the biggest hole: a
  counter that cannot correct a mistake gets corrected in the drawer instead.
- **The receipt.** `fdaLtoNumber`, `prcLicenseNo` and `tin` are captured and
  displayed nowhere. A PH pharmacy receipt has to show them, and an SC/PWD sale
  has to show the beneficiary's ID.
- **Expiry write-offs.** The dashboard shows what has expired; nothing can act
  on it. `expiry_writeoff` is already in the movement enum.

Say which and I will build it.

---

# What just landed

## Receiving (`/receiving`)

Stock enters the system here and nowhere else, so it is the cheap place to catch
a bad date or a fat-fingered quantity. Every line becomes **its own batch** —
two deliveries of the same lot are two batches, because they carry different
costs and FEFO breaks ties on received date.

**Refused** (wrong, not merely unusual): already-expired stock · a new product
with no selling price · zero, negative or fractional quantities · a negative
cost.

**Warned, and it still goes through**: short-dated within 90 days · no lot
number · no expiry printed · zero cost. Samples are real and so are cheap
short-dated buys — and a receiving screen that blocks a real delivery gets
worked around, which is worse than the thing it avoided.

**The double-submit guard.** The form mints one `deliveryRef` per delivery, not
per submit, and the write path refuses a reference it has seen. Without it a
slow connection plus an impatient second click doubles the stock on the shelf —
and nothing downstream notices, because the batches and the movements are both
internally consistent, just twice.

**A pharmacist can receive but cannot create a product.** Creating one means
pricing it, and the price is what the till charges. Manager or owner.

## Numbers

- **Reseta 99/99**, including 21 DB-backed
- **Servd 1,034/1,034**, including its 38 — no regression
- both apps typecheck and build

Run against a throwaway PostgreSQL 16 whose connection role is neither a
superuser nor `BYPASSRLS`, so the isolation results mean something.
