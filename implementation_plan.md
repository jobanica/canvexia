# apps/www — CANVEXIA landing page

Mode C plan. Blockers below are **settled**; the build is approved and in
progress. Section A/B are kept as the record of what was decided and why.

## Decisions received

| # | Question | Answer |
|---|---|---|
| **A1** | Merchant count on the page | **No number at all.** "Customers don't need to know how many merchants we have." Simplest and the only one that needs no footnote — the page sells the model, not the traction. |
| **A2** | Restaurants link | `servdph.net` |
| **A3** | `canvexia.com` vs the portal | Landing page takes `canvexia.com`; **portal moves to `partner.canvexia.com`** — one DNS record, no new domain to buy. |
| **A4** | Schema | **`public`**, matching every other table. No `multiSchema`, no `@@schema` churn. |
| **B1** | Email | **Build the waitlist without it.** Insert + success state now; the confirmation send goes in once `CREDENTIALS_ENCRYPTION_KEY` and a Resend key exist. |
| **B2** | Design | The **`design`** skill. |

### Consequence of A3 — `parseHost` changes

`canvexia.com` currently returns `partner_root` and the middleware rewrites it
to `/partner`. With the landing page on the apex, that inverts:

- `canvexia.com`, `www.canvexia.com` → **apps/www** (a separate Vercel project)
- `partner.canvexia.com` → **apps/servd**, the portal
- `*.canvexia.com` (other) → a partner's own branded portal, unchanged

So `partner_root` stops meaning "the apex" and starts meaning one reserved
subdomain. `partner` joins the reserved-label list, and D31's routing table is
superseded. Tests in `apps/servd/tests/host/host.test.ts` assert the current
behaviour and will need inverting — deliberately, with the reason in the test
name rather than a comment.

### A note on filenames

The execution checklist does **not** go in `task.md`. That file is this
project's live status doc, and `implementation_plan.md` was already the original
platform plan before I overwrote it (now archived at
`docs/canvexia/platform-plan.md`). Generic "write X.md" instructions should not
clobber a repo's existing documents; the checklist lives at
`apps/www/TASKS.md`.

---

## A. Blocking — spec conflicts with the repo

### A1. "258 merchants in Davao" cannot go on this page as written

The spec says *Servd — LIVE, [X] merchants in Davao*, and your fill-list says
`258`. But **this project's database has zero restaurants.** I verified it
earlier in this session: `restaurants` is 0 rows, `orders` 0, `staff_users` 0.

`servdph.com` — where those 258 merchants presumably are — is **a different
business on a different database** and is explicitly not part of CANVEXIA
(D31, your own instruction). canvexia.com claiming 258 merchants would be a
number this company cannot evidence from its own systems.

Three honest options:

1. **Attribute it** — "Servd has 258 paying merchants in Davao City" as the
   founder's prior track record, stated as his, not as CANVEXIA's.
2. **Drop the number** — "LIVE — running in Davao City since [year]".
3. **Confirm the migration** — if those merchants are moving onto this
   database, the number becomes true here and the claim is fine.

Your spec's own rule says never invent merchant counts. This is that rule
firing on its first contact with reality. **Which one?**

### A2. The spec sends restaurants to `servdph.com`; D31 says `servdph.net`

Section: *"It is not a merchant-facing site (restaurants go to servdph.com)"*.
In this repo Servd is deployed at **servdph.net** — `servdph.com` is the
separate business. Any link I write to `.com` sends traffic off this platform.
**Confirm `.net`.**

### A3. `canvexia.com` is currently the partner portal

`parseHost` returns `partner_root` for `canvexia.com` and the middleware
rewrites it to `/partner` in `apps/servd`. That was D31's decision and it is
live right now.

The spec puts the landing page on `canvexia.com` and moves the portal to
`partner.canvexia.app`. That is a real change: `lib/host.ts`, the middleware
rewrite, `NEXT_PUBLIC_PARTNER_ROOT_DOMAIN`, a new Vercel project and domain,
and a superseding note on D31.

**Confirm**, and confirm you own (or will buy) `canvexia.app`. Alternative that
costs nothing: portal at `partner.canvexia.com`, same domain, one DNS record.

### A4. There is no `core` schema, and adding one is not a small change

The spec asks for `core.partner_waitlist` and `core.territories`. This schema
has **no `multiSchema` preview feature** and **no `@@schema` annotations** —
all ~100 models live in `public`.

Adding a `core` schema means enabling a Prisma preview feature, declaring
`schemas = [...]` on the datasource, and annotating **every existing model**.
On a live database, for a naming preference.

**Recommendation:** `public.partner_waitlist` and `public.territories`,
matching every other table here. Say the word if you want `core` anyway and
I will scope it as its own migration.

---

## B. Blocking — things that do not exist yet

### B1. Confirmation email cannot send today

Resend exists (`apps/servd/src/server/email/provider.ts`) but is **database
backed**: the API key is encrypted into `platform_settings.emailCredsEnc` and
decrypted with `CREDENTIALS_ENCRYPTION_KEY`.

- `CREDENTIALS_ENCRYPTION_KEY` is **not set** on either deployment
  (`/api/health` reports `false`)
- no email credentials have ever been entered — this database is fresh

So "send a confirmation email" needs: the env var set, a Resend key entered in
super-admin, and a verified sending domain. **Build the waitlist without email
for now** (insert + success state), with the send behind a feature check that
no-ops when unconfigured? Or hold the whole thing until email is set up?

### B2. The `frontend-design` skill named in the spec is not in this environment

`/mnt/skills/user/frontend-design/SKILL.md` does not exist here. Available:
`design` and `anthropic-skills:graphic-designer`. **Which?** Or neither and I
work from the logo.

---

## C. Answers to your two "ask before planning" questions

**Resend / Supabase clients — reuse or move to `packages/core` first?**
Neither, and for a reason that just came up in this session. `packages/core`
has no database access by design. The pattern we settled on for exactly this
(D36) is `packages/db`, which owns Prisma — that is where `provisionPharmacyIn`
went so both apps could call one implementation.

- **Supabase client** — `apps/www` writes through a *server action* and a
  service-scoped Prisma call, not a browser client. It needs no Supabase client
  at all. Copy `lib/supabase/server.ts` only if you later add auth here.
- **Resend** — the provider reads `platform_settings`, so it is DB-shaped
  already. Move `sendEmail` into `packages/db` alongside the provisioning
  helper, and have both apps call it. Same argument as D36: two copies of a
  send path drift, and the drift is silent.
- **Rate limiting** — **do not add Upstash or an in-memory counter.**
  `apps/servd/src/server/build/rate-limit.ts` already does DB-backed,
  IP-hashed, fixed-window limiting, and its own comment says why in-memory
  enforces nothing on serverless. Extract it to `packages/db`, add a
  `www:waitlist` bucket. No new dependency, paid or otherwise.

**Design items marked "propose":**

Your logo answers the asset question — near-black mark with a coral→orange
gradient quadrant. Proposed palette taken from it:

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1A1A1E` | Text, wordmark, buttons |
| `coral` | `#E8536A` | Accent start |
| `ember` | `#F2894E` | Accent end |
| `paper` | `#FAFAF8` | Page ground |
| `line` | `#E5E4E0` | Hairlines |

One accent, used as a flat colour almost everywhere and as the gradient only on
the mark itself — a gradient in the logo and a gradient on every button is the
"US startup clone" look you asked to avoid. **Approve or adjust the hexes** —
I sampled them by eye from the PNG, so they are close, not exact. If you have
the brand hexes, give me those.

I also need the logo **as files in the repo** — I can see the images in chat
but cannot write them to disk. Drop `canvexia-wordmark.svg` (or `.png`) and
`canvexia-mark.svg` somewhere and tell me where.

---

## D. Still unfilled

| Placeholder | Needed for | Default if you skip |
|---|---|---|
| `BOOKING_URL` | "Book a call" (nav + hero) | I hide the button |
| `PORTAL_URL` | "Partner login" | `/login` stub page per spec |
| Minimum price floor | Calculator input `min` | ₱999 (your fill-list value) |
| Social handles | Founder block, footer | I omit the links |
| Founder photo | Section 8 | Text-only block |
| Product screenshots | Hero, products | Placeholder frames |
| English-first or Taglish-first | All copy | English headlines, Taglish accents |

The calculator check in your spec — 30 × ₱999 × 70% = **₱20,979** — is correct;
I will assert it in a test.

---

## E. File plan (once the above is settled)

### New app

```
[NEW] apps/www/package.json              name "www", versions matched to apps/servd
                                         (next ^15.5.19, react 19.0.0, tailwind ^3.4.17)
[NEW] apps/www/next.config.mjs           transpilePackages: ["@servd/core", "@servd/db"]
[NEW] apps/www/tailwind.config.ts        CANVEXIA palette — NOT Servd's plum/mango
[NEW] apps/www/vercel.json               regions ["hnd1"], ignoreCommand turbo-ignore
[NEW] apps/www/.env.example
[NEW] apps/www/tsconfig.json, postcss.config.mjs, vitest.config.ts
```

### Page

```
[NEW] src/app/layout.tsx                 fonts, metadata, palette vars
[NEW] src/app/page.tsx                   sections 1–12, server component
[NEW] src/app/opengraph-image.tsx        next/og — copy the shape of
                                         apps/servd/src/app/create/opengraph-image.tsx
[NEW] src/app/privacy/page.tsx, terms/page.tsx
[NEW] src/app/login/page.tsx             "Partner portal launching soon" stub
[NEW] src/components/…                   Nav, Hero, Steps, WhatYouGet, Products,
                                         Calculator (client), TierCards,
                                         CityFinder (client), Compare, ForWhom,
                                         Founder, WaitlistCities, Faq (client),
                                         WaitlistForm (client), Footer
```

`packages/ui` is an empty shell — one `package.json`, no source. Building
locally, per your spec.

### Data

```
[MODIFY] packages/db/prisma/schema.prisma   + PartnerWaitlist, Territory
                                            (public schema — see A4)
[NEW]    packages/db/prisma/manual/add-partner-waitlist.sql
[MODIFY] packages/db/prisma/rls.sql         anon INSERT on partner_waitlist only;
                                            territories readable; HQ reads both
[NEW]    packages/db/prisma/seed-territories.mjs   one line per city, per your spec
[NEW]    packages/db/src/waitlist.ts        joinWaitlist(tx, input) + position query
[MODIFY] packages/db/src/index.ts           export it
[MOVE]   rate-limit.ts → packages/db        + "www:waitlist" bucket
```

**RLS is the part I will not rush.** `anon` having INSERT on a table that
collects names, emails and mobile numbers is exactly the shape of the hole
found and closed in D27 — `anon` had read/write on `prospect_leads`. The
policy will be INSERT-only with no USING clause, so `anon` can write and
cannot read back, and I will prove it with a test that inserts as `anon` and
then fails to select.

### Tests

```
[NEW] apps/www/tests/calculator.test.ts     30 × ₱999 → ₱20,979; the 30% split
[NEW] apps/www/tests/territories.test.ts    Cebu→Large 79k, Digos→Mid 49k,
                                            Mati→Small 29k, Davao→HQ,
                                            unknown city→Small
[NEW] apps/www/tests/waitlist-input.test.ts PH mobile (+63 / 09xx), required fields
[NEW] apps/www/tests/isolation/waitlist.test.ts   anon can INSERT, anon CANNOT
                                                  SELECT; position counts per city
```

### Deploy

```
[NEW] Vercel project "www", root apps/www, domain canvexia.com (after A3)
```

---

## F. Order of work

1. Schema + RLS + seed, with the isolation test proving `anon` cannot read back
2. Shared helpers into `packages/db` (waitlist, rate limit, email)
3. App shell, palette, nav, footer
4. Sections 1–4, 7, 8, 10, 12 (static)
5. Calculator, city finder, FAQ (client, tested)
6. Waitlist form + server action + success state
7. OG image, metadata, Lighthouse pass
8. Vercel project and domain

---

## Halting for approval

Nothing is written. I need **A1, A3, A4, B1, B2** answered to start, and the
D-table filled to finish. A2 is a one-word confirm.
