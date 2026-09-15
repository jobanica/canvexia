# Domains

Three domains, two deployments, one database. D31.

| Domain | Serves | Deployment |
|---|---|---|
| **servdph.net** | Servd — the restaurant product | `apps/servd` |
| **canvexia.com** | CANVEXIA — the public site | `apps/www` — **not yet pointed here** |
| **partner.canvexia.com** | CANVEXIA — the partner portal | `apps/servd` — **not yet pointed here** |
| **resceta.com** | Resceta — the pharmacy product | `apps/resceta` |

> **NO DOMAIN IS REGISTERED YET.** `canvexia.com`, `servdph.net` and
> `resceta.com` all return NXDOMAIN — checked, not assumed. The table above is
> the INTENDED routing; nothing in it is live. Today everything answers on
> Vercel URLs:
>
> | What | Where it actually is today |
> |---|---|
> | The public site | `https://canvexia-www.vercel.app` |
> | The partner portal | `https://canvexia-two.vercel.app/partner/login` |
> | Resceta | `https://resceta.vercel.app` |
>
> On a `*.vercel.app` host `parseHost` returns `platform`, so the middleware
> does NOT rewrite `/` to `/partner` — the portal is reachable at its real path
> and the apex shows Servd. That is why the portal URL above carries
> `/partner/login` and the bare host does not.
>
> **When the domains are bought**, D37 is a two-step flip and both steps go
> together or one brand is dark:
>
> 1. Add `canvexia.com` + `www.canvexia.com` to the `canvexia-www` project.
> 2. Add `partner.canvexia.com` to the `canvexia` project, and set
>    `NEXT_PUBLIC_PORTAL_URL` on `canvexia-www` to
>    `https://partner.canvexia.com/partner/login`.
>
> `parseHost` already answers `partner_root` for BOTH the apex and
> `partner.canvexia.com`, so the order of those two steps cannot strand the
> portal.

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

### resceta.com → `apps/resceta`

A separate deployment and **no host routing at all**. Resceta is one app, and
which pharmacy you are looking at comes from the session, never the URL (D30) —
so there are no subdomains to configure and nothing to parse.

---

## Deployment: two projects, one repository

Two Vercel projects, both connected to this repo. They differ by **Root
Directory** and nothing else:

| Project | Root Directory | Domains |
|---|---|---|
| `canvexia` | `apps/servd` | `servdph.net`, `*.servdph.net`, `canvexia.com`, `*.canvexia.com`, and every merchant's own custom domain |
| `resceta` | `apps/resceta` | `resceta.com`, `www.resceta.com` |
| `canvexia-www` | `apps/www` | `canvexia-www.vercel.app` today; `canvexia.com` after the flip above |

`canvexia.com` is on the **Servd project** on purpose. One deployment serves
both roots; the middleware reads the Host header and rewrites. Adding it to a
project of its own would give you a second copy of the same app with a second
database connection and no partner portal on either.

Two settings on each project are not defaults and both matter:

- **Include source files outside of the Root Directory in the Build Step — on.**
  Both apps generate Prisma from `../../packages/db/prisma/schema.prisma` and
  compile `@servd/core` from source (`transpilePackages`). With this off the
  install succeeds and the build fails on a schema it cannot find.
- **Node 22.x**, matching `engines` in both `package.json` files.

`regions` and `crons` come from each app's `vercel.json`, not the dashboard.
Both deploy to `hnd1` (Tokyo — the closest region to Manila). Only Servd has
crons; Resceta has no scheduled work.

### Only the app that changed gets deployed

This is **not** what Vercel does by default. Every project connected to a repo
rebuilds on every push to it, so a one-line change in `apps/servd/src` would
redeploy the pharmacy too.

Both `vercel.json` files therefore set:

```json
"ignoreCommand": "npx turbo-ignore"
```

`turbo-ignore` asks Turborepo whether this package — or anything it depends on —
actually changed since this project's last successful deployment, and cancels
the build if nothing did. It reads the real dependency graph, so:

| Changed | Rebuilds |
|---|---|
| `apps/servd/**` | Servd |
| `apps/resceta/**` | Resceta |
| `packages/db/**` (the schema) | **both** |
| `packages/core/**` | **both** |
| `pnpm-lock.yaml`, `turbo.json`, root config | **both** |

The two `packages/**` rows are the reason to use `turbo-ignore` rather than a
path filter: a schema change *has* to rebuild both apps, and a hand-written
"did `apps/resceta` change?" check would miss it.

It fails safe — when it cannot tell (first deployment, no prior successful
build, missing git history) it builds. If it ever skips a build you wanted,
**Redeploy** from the dashboard runs unconditionally.

### The variables the build can see

Turborepo 2 runs tasks in strict env mode: a build only sees the variables
`turbo.json` declares under `tasks.build.env`. A variable missing from that list
is `undefined` during the build *and* absent from the cache key, so changing it
in the dashboard invalidates nothing.

Nothing errors when this happens, which is why
`apps/servd/tests/deploy/turbo-env.test.ts` derives the list from the source and
fails if the two drift. Add a `process.env.SOMETHING` and the test tells you to
declare it.

### One database, no per-project switch

Both projects point `DATABASE_URL` at the same Supabase project (D25). There is
no staging copy and no per-project override, so a schema change is live for both
apps the moment it is applied — **migrate first, then deploy**, and never the
other way round. A deploy that expects a column that is not there yet fails for
every merchant on both products at once.

`VERCEL_PROJECT_ID` — used to attach merchants' custom domains through the
Domains API — must be the **Servd** project's id. Now that a second project
exists, the wrong id silently points a restaurant's domain at the pharmacy app.

## Configuration

`apps/servd/.env.example`:

```
NEXT_PUBLIC_APP_URL="https://www.servdph.net"
NEXT_PUBLIC_ROOT_DOMAIN="servdph.net"
NEXT_PUBLIC_PARTNER_ROOT_DOMAIN="canvexia.com"
INTERNAL_LOGIN_DOMAIN="staff.servdph.net"
```

`apps/resceta/.env.example`:

```
NEXT_PUBLIC_APP_URL="https://resceta.com"
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
| `resceta.com` | apex → the Resceta deployment | the pharmacy app |
| `www.resceta.com` | CNAME | same |

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
