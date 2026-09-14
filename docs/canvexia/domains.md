# Domains

Three domains, two deployments, one database. D31.

| Domain | Serves | Deployment |
|---|---|---|
| **servdph.net** | Servd — the restaurant product | `apps/servd` |
| **canvexia.com** | CANVEXIA — the partner portal | `apps/servd` (same deployment) |
| **risceta.com** | Reseta — the pharmacy product | `apps/reseta` |

`servdph.com` is a **different business on a different database** and is not part
of this project. If it is ever pointed here it resolves as an ordinary custom
domain — looked up as a restaurant, and not found.

---

## Who serves what

### servdph.net → `apps/servd`, platform mode

| Host | What it is |
|---|---|
| `servdph.net`, `www.servdph.net` | Servd's own site — marketing, `/create`, the admin and super-admin areas |
| `mango-grill.servdph.net` | one merchant's storefront |
| `app`, `admin`, `api`, `tutorials` `.servdph.net` | reserved; stay on the platform |
| `order.bistro.ph` (any other host) | a merchant's own custom domain |

### canvexia.com → the SAME deployment, partner mode

| Host | What it is |
|---|---|
| `canvexia.com`, `www.canvexia.com` | **CANVEXIA's front door** — the partner portal |
| `davao.canvexia.com` | that partner's own branded portal |
| `app`, `admin`, `api`, `tutorials` `.canvexia.com` | reserved; fall through to the platform |

**The bare root is the part that needed a change.** `parseHost` used to answer
`platform` for it, which was right while the partner root was a domain nobody
had configured and wrong the moment it became real: `canvexia.com` would have
served Servd's restaurant marketing at the partner program's address. It now
returns `partner_root`, and the middleware rewrites it to `/partner` — the same
rewrite a partner subdomain gets, because the only difference is that the root
has no partner to resolve, which the portal already handles by sending an
unauthenticated visitor to `/partner/login`.

One deployment serves both domains. They are not two apps: the middleware reads
the Host header and rewrites, which is why both roots must be added to the same
hosting project.

### risceta.com → `apps/reseta`

A separate deployment and **no host routing at all**. Reseta is one app, and
which pharmacy you are looking at comes from the session, never the URL (D30) —
so there are no subdomains to configure and nothing to parse.

---

## Configuration

`apps/servd/.env.example`:

```
NEXT_PUBLIC_APP_URL="https://www.servdph.net"
NEXT_PUBLIC_ROOT_DOMAIN="servdph.net"
NEXT_PUBLIC_PARTNER_ROOT_DOMAIN="canvexia.com"
INTERNAL_LOGIN_DOMAIN="staff.servdph.net"
```

`apps/reseta/.env.example`:

```
NEXT_PUBLIC_APP_URL="https://risceta.com"
```

Both apps point at the **same** `DATABASE_URL` — one schema and one database for
every product (D25).

`INTERNAL_LOGIN_DOMAIN` is where synthetic staff logins live, for a DIY or
partner-built account whose owner never gave an email. Nothing is ever delivered
there, which is exactly why it must not be a domain somebody else owns. Unset,
it derives from the root domain; with no root domain either it falls back to
`staff.invalid`, reserved by RFC 2606 so it can never resolve.

## DNS

Wildcards are load-bearing on two of the three. A merchant subdomain and a
partner subdomain are both created by someone using the product, not by someone
editing DNS.

| Record | Host | Why |
|---|---|---|
| `servdph.net` | apex → the Servd deployment | the platform site |
| `www.servdph.net` | CNAME | same |
| `*.servdph.net` | **wildcard** CNAME | every merchant storefront |
| `canvexia.com` | apex → the SAME deployment | the partner front door |
| `www.canvexia.com` | CNAME | same |
| `*.canvexia.com` | **wildcard** CNAME | every partner's branded portal |
| `risceta.com` | apex → the Reseta deployment | the pharmacy app |
| `www.risceta.com` | CNAME | same |

**QR codes do not depend on the merchant wildcard.** `qr.ts` always builds the
apex path (`/t/<token>`) unless the merchant has a verified custom domain — so a
printed QR keeps working whether or not `*.servdph.net` resolves. That is worth
knowing before printing anything: the wildcard is for the storefront URL people
type and share, not for the code on the table.

Nothing degrades gracefully on `canvexia.com`. A partner subdomain that does not
resolve is a partner who cannot reach their portal, and there is no fallback
path for it.

Merchants' own custom domains are added per-domain through the Vercel Domains
API (`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`), which is a separate mechanism from
any of the above.

## Changing a domain later

Nothing is hardcoded, so it is an environment change and a DNS change. The one
thing that is not reversible by editing env: **`INTERNAL_LOGIN_DOMAIN` is
written into rows.** A DIY account's login address is stored as
`slug@staff.servdph.net` in Supabase Auth and in `staff_users.email`. Changing
the variable afterwards does not rewrite them, so those accounts keep signing in
on the old address — which still works, because nothing is delivered there
anyway, but `isSyntheticLogin()` will stop recognising them and the feedback
screen will start offering to email addresses that are not inboxes.

If it ever has to change, migrate the stored addresses in the same step.
