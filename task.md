# Reseta is live and has sign-in

`live: true` in the product registry — the partner portal will now create
pharmacy accounts. Full notes: `docs/canvexia/reseta.md`.

## Sign-in

Session → membership → pharmacy. **Nothing takes a pharmacy id from the browser.**

The routes used to be `/[slug]` and `/[slug]/pos`. They are now `/`, `/pos`,
`/staff`, `/login` — a slug in the path is a pharmacy id the browser chose, and
having one at all invites exactly one forgotten check. `getCurrentStaff()` reads
the Supabase session, then `pharmacy_staff`, and returns the pharmacy. There is
no URL to tamper with because there is no URL (D30).

Middleware renews the access token and does nothing else — no database, no
gating. It runs on the Edge, and a middleware that decides who may see what
needs the membership rows. Gating happens where the rows are.

One login can be staff at several pharmacies. The switcher writes a cookie;
`pickPharmacy` checks it against the memberships, so a cookie naming a pharmacy
you are not staff at is **ignored**.

### Roles

| | sell | Rx | void | stock | catalogue | reports | staff | settings |
|---|---|---|---|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| manager | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| pharmacist | ✅ | ✅ | — | ✅ | — | ✅ | — | — |
| cashier | ✅ | — | — | — | — | — | — | — |

**`dispenseRx` is law, not policy.** A cashier cannot complete a cart containing
a prescription-only item — and neither can a manager. Seniority is not a
licence. The server re-checks with the Rx flags read from the **database**, not
from the form.

### Your first account

```bash
pnpm --filter reseta staff:create -- <pharmacySlug> owner <email> <password> [name]
```

Staff are added at `/staff` after that. The script exists because `/staff` needs
someone already signed in.

Set the three Supabase variables first — see `apps/reseta/.env.example`.
Without `SUPABASE_SERVICE_ROLE_KEY` the app still runs and signs people in; only
*adding* staff fails, with a message saying so.

## I finally ran the DB-backed tests

I stood up a throwaway PostgreSQL 16, applied the schema and `rls.sql`, and ran
everything that had been skipping for want of a `DATABASE_URL`:

- **Reseta 76/76** — including the 14 DB-backed ones
- **Servd 1,034/1,034** — including its 38, against the new merchant-axis RLS
  and the renamed ledger column. No regression.

The connection role is not a superuser and has no `BYPASSRLS`, so those results
mean something. That also closed the `live` gate: `provisionPharmacy()` has now
run for real, and the three assertions `adding-a-vertical.md` asks for all pass.

## Two bugs that run found

**`pg` did not move with the script.** `apply-rls.mjs` moved to `packages/db`
last commit; its dependency stayed in `apps/servd`. `db:rls` failed with
`Cannot find package 'pg'` the first time I ran it from the new location —
which is the moment you would have hit it, applying policies to your database.

**`pharmacy_sale_items.productId` was `Restrict`.** I copied that from Reseta's
schema without noticing Servd had already hit the identical bug on
`order_items.menuItemId`: there is a migration called
`fix-orderitem-menuitem-setnull.sql` whose comment describes this exact failure.
Restrict makes a product undeletable once anyone has bought it, and a pharmacy
with sales undeletable entirely. Now nullable with `SET NULL` — the line already
snapshots `nameAtTime`, so history survives. Applied to the CANVEXIA database
too.

A test teardown found it. Nothing else would have.

## Still queued

1. **Apply the four migrations to servdph.com** — `docs/canvexia/deploy-runbook.md`.
   Unchanged, still correct, still not done. It also closes the `anon`-key hole
   from D27, which is live on that database now.
2. **Receiving stock.** Batches are created by fixtures and SQL. A receiving
   screen writing a `receive` movement is the obvious next piece.
3. **Voids and returns.** `status` and `voidedAt` exist; nothing sets them. A
   void must return stock to the batch it came from and write the compensating
   movement — never edit the sale.
4. **The receipt.** `fdaLtoNumber`, `prcLicenseNo` and `tin` are captured and
   displayed nowhere. A PH pharmacy receipt has to show them.
