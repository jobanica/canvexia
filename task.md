# Where CANVEXIA is, and what to do next

CANVEXIA is **separate from servdph.com** — its own database, its own merchants,
its own domains, and no connection between them (D31). Servd runs here as one
product among several, starting from zero merchants.

Two products are live: **Servd** (restaurants) and **Reseta** (pharmacy). Both
are provisioned by a partner through the portal. The database is up, policies
hold, and 1,163 tests pass.

| Domain | Serves | Deployment |
|---|---|---|
| **servdph.net** | Servd — restaurants | `apps/servd` |
| **canvexia.com** | CANVEXIA — the partner portal | `apps/servd`, same deployment |
| **risceta.com** | Reseta — pharmacy | `apps/reseta` |

---

# What to do next

## 1. Point the DNS and set the env

The domains are wired in code and in both `.env.example` files. What is left is
outside this repository — see `docs/canvexia/domains.md` for the full table.

**Two hosting projects:**

- `apps/servd` — add **both** `servdph.net` and `canvexia.com` to it. One
  deployment serves both; the middleware reads the Host header and rewrites.
- `apps/reseta` — `risceta.com`.

**DNS.** The two wildcards are load-bearing — a merchant subdomain and a partner
subdomain are both created by someone *using* the product, not by someone
editing DNS:

```
servdph.net      apex   → Servd deployment
www.servdph.net  CNAME
*.servdph.net    CNAME  ← every merchant storefront
canvexia.com     apex   → the SAME deployment
www.canvexia.com CNAME
*.canvexia.com   CNAME  ← every partner's branded portal
risceta.com      apex   → Reseta deployment
www.risceta.com  CNAME
```

Then set the env values from the two `.env.example` files in your host.

## 2. Then get a real merchant in

```bash
# a. Supabase Auth variables — apps/servd/.env.example, apps/reseta/.env.example
# b. a partner, then a merchant through the portal
# c. the first pharmacy login (the /staff screen needs someone signed in)
pnpm --filter reseta staff:create -- <pharmacySlug> owner <email> <password> "Name"
```

## 3. Then the next piece of Reseta

Independent of each other; my order, most useful first:

- **Voids and returns** — the biggest hole. `PharmacySale.status` and `voidedAt`
  exist and nothing sets them. A void must return stock **to the batch it came
  from** and write the compensating movement, never edit the sale. A counter
  that cannot correct a mistake gets corrected in the drawer instead.
- **The receipt** — `fdaLtoNumber`, `prcLicenseNo` and `tin` are captured and
  shown nowhere. A PH pharmacy receipt has to carry them, and an SC/PWD sale has
  to show the beneficiary's ID.
- **Expiry write-offs** — the dashboard shows what has expired; nothing can act
  on it. `expiry_writeoff` is already in the movement enum.

Say which and I will build it.

---

# What just changed, and what it caught

## servdph.com is out of this project

`docs/canvexia/deploy-runbook.md` is **deleted**, not corrected. It described
applying migrations and a merchant backfill to servdph.com's production
database, and it had been the first item on this list for three rounds. A
runbook is an instruction — left in `docs/canvexia/`, someone follows it.
Replaced by `docs/canvexia/servd-is-separate.md`; the content is in git history
for whoever runs that system.

Consequently: the four "pending" migrations are **not pending here** (this
database was built in one pass from the schema, D26), and the backfill has
**nothing to backfill** — no CANVEXIA merchant predates `partnerId`.

Two grandfather rules are now inert and both **stay**: `POWERED_BY_SINCE`, and
D2's rule that a legacy-tier partner sits on 0%. No row here can satisfy either.
They are guards, and a guard that never fires today still catches the row
somebody imports by hand later.

## canvexia.com would have served Servd's marketing

`parseHost` answered `platform` for the bare partner root. That was right while
`NEXT_PUBLIC_PARTNER_ROOT_DOMAIN` was unset and hypothetical, and wrong the
moment it became a real domain: **canvexia.com would have shown a page about
online ordering for restaurants** at the partner program's own address.

It now returns `partner_root` and the middleware rewrites to `/partner` — the
same rewrite a partner subdomain gets. A test asserted the old behaviour and was
right when written; it is now inverted, with the reason in the test name.

## The domain was in the source fourteen times — one was a live bug

The badge, the QR splash, the partner support link, the prospecting User-Agent
and ten `?? "https://servdph.com"` fallbacks. All now from
`NEXT_PUBLIC_APP_URL`, through `apps/servd/src/lib/branding/app-domain.ts`.

Thirteen were cosmetic. **One was not.** The super-admin feedback page decided
whether a reply would reach a real inbox by testing for `@staff.servdph.com`
spelled out. On any other domain that says *every* synthetic login is a real
inbox — so the reply form would tell you your answer had been emailed when it
had not, and nothing would say otherwise.

The test meant to cover it had reimplemented the rule locally with the domain as
a default argument, so it passed against its own copy while the shipped page was
wrong. It now calls the shipped function. **A test that reimplements the thing it
tests is testing itself.**

## One thing still true of the other system

servdph.com has the D27 RLS hole: twelve tables with no policy, and Supabase
grants the browser-side `anon` key full read/write on anything unprotected.
`prospect_leads` — names, phones, emails and addresses of sales leads — is one.

**Not this project's work**, and nothing here will fix it. Recorded because it
is a real exposure of real people's contact details on a system you run. The fix
is one command there: this repo's `rls.sql` closes it.

## Numbers

- **Servd 1,026 offline + 38 DB-backed**
- **Reseta 78 offline + 21 DB-backed**
- both typecheck, both build
