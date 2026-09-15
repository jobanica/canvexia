# CANVEXIA — system architecture

Written at the end of Phase A1 because the antigravity protocol asks for it and
it did not exist, so every plan so far re-derived the same facts. Read this
before planning anything; it is the save state, not a tour.

Decisions with numbers (D2, D27, D31, D36, D37 …) are in
`docs/canvexia/decisions.md`. This file is the shape, not the history.

---

## 1. What the repository is

A pnpm + Turborepo monorepo. **One database, one schema, several products.**

```
apps/servd      Servd (restaurant ordering) AND the CANVEXIA partner portal
apps/resceta    Resceta (pharmacy POS)
apps/www        canvexia.com — the public site and the partner waitlist
packages/db     THE Prisma schema, the RLS policies, and code that writes
packages/core   Pure TypeScript: vocabulary, registries, maths. NO database.
packages/ui     Presentation used by more than one app. Today: the CANVEXIA mark.
```

**There is no `apps/partner`.** The portal is `apps/servd/src/app/(platform)/partner`.
**There is no `core` schema.** Every table is in `public` — a second schema means
a Prisma preview feature and annotating ~110 models on a live database.

### The rule that decides where code goes

| Needs | Goes in |
|---|---|
| A database | `packages/db` (takes a `Prisma.TransactionClient`, never opens one) |
| No database, shared by ≥2 apps | `packages/core` |
| A React component drawn by ≥2 apps | `packages/ui` |
| One app | that app |

`packages/core` owning no tables is deliberate: it is what lets two Next
processes agree on what a product or a role *is* without importing each other.
One consumer is not a library — `packages/ui` stayed an empty shell until the
portal and canvexia.com both drew the same logo.

---

## 2. Tenancy: the thing to get right

Three levels: **HQ → partner → merchant**. A merchant belongs to exactly one
product; a partner owns merchants across products.

### The axes (D29)

Each product has its own merchant table and its own scope column. They are
declared once in `packages/core/src/tenancy/merchant.ts` and mirrored in
`packages/db/prisma/rls.sql`; `tests/isolation/merchant-axes.test.ts` fails if
the two drift.

| Product | Merchant table | Tenant column | GUC |
|---|---|---|---|
| servd | `restaurants` | `restaurantId` | `app.current_restaurant_id` |
| pharmacy | `pharmacies` | `pharmacyId` | `app.current_pharmacy_id` |

The partner arm cuts across all of them: `app.current_partner_id`, resolved
through the merchant table's `partnerId` rather than denormalised onto every
tenant table — one column instead of fifty, and one place a merchant's owner is
recorded, so reassigning a merchant is one update rather than fifty.

### How a request gets a scope

Each app has a `server/tenancy/scoped-db.ts` with the same three wrappers:

```
restaurantDb(id, fn) / pharmacyDb(id, fn)   one merchant
partnerDb(partnerId, fn)                    one partner, all their merchants
systemDb(fn)                                trusted context — every policy OFF
```

Reach for the narrowest that can do the job. `systemDb` is not "the one that
works": code that reaches for it to make a query return rows has usually just
switched off the thing protecting it.

### RLS, and the two things that make it real

1. **`FORCE ROW LEVEL SECURITY`** — without FORCE the table owner silently
   bypasses policies and the guarantee is decoration.
2. **The role switch.** `DATABASE_URL` connects as `postgres`, which carries
   **`rolbypassrls = true`**. FORCE subjects the *owner* to policies; BYPASSRLS
   outranks it. So every scope wrapper switches to **`app_user`** (no BYPASSRLS)
   in the same round-trip that sets the GUC.

   **This is also a trap for tests.** A test that sets the scope GUC but not the
   role runs as `postgres`, observes no policy, and passes because of the
   `where` clause in the code under test. `tests/isolation/partner-seats.test.ts`
   opens with a guard asserting the connected role does not bypass RLS, and
   every isolation helper should do the same. *Several older Servd isolation
   suites do not yet — see §6.*

3. **The backstop sweep** (D27). Any table in `public` with **no** policy gets
   `super_only` automatically. A new table therefore arrives locked and someone
   must open it deliberately. Twelve tables had been missed before this existed,
   `prospect_leads` among them.

4. **Grants are not policies.** Supabase grants `anon` full DML on `public` by
   default and the anon key ships in every browser. Tables holding personal data
   `REVOKE ALL … FROM anon, authenticated` on top of their policy —
   `partner_waitlist`, `prospects`, `partner_users`, `partner_invites`,
   `notification_prefs`.

---

## 3. Identity

| Who | Resolved by |
|---|---|
| HQ | `platform_admins` |
| Partner seat | `partner_users.authUserId` → **falls back to** `partners.authUserId` |
| Restaurant staff | `staff_users.authUserId` |
| Pharmacy staff | `pharmacy_staff.authUserId` |

Supabase Auth via `@supabase/ssr`. One Supabase identity may hold several
memberships — `resolveScope()` in `packages/core/src/identity/roles.ts` picks the
**narrowest**, because a person holding both an HQ and a merchant role is an
operator debugging a merchant, and running them as HQ would hand a one-restaurant
screen a super-admin context.

### Partner seats (A1)

`partner_users` holds `admin | sales | support` (a CHECK constraint enforces the
set; `PARTNER_USER_ROLES` in core owns the vocabulary). The capability matrix is
`packages/core/src/identity/permissions.ts` and is consulted by **both** the UI
and the server — the UI hides rather than disables, and RLS plus
`requireCapability()` are what make a URL guess fail.

`partners.authUserId` still works and is read second. Breaking every live session
to normalise a column is not a trade worth making; the A1 migration backfills an
admin seat for every partner that had a login, so both paths agree.

---

## 4. Products

A **code registry**, not a table: `packages/core/src/products/registry.ts`.
`live` there means "a merchant can be provisioned into it today" — it is **not**
what a public page should say. canvexia.com keeps its own public status map, so
Resceta reads "In development" despite `live: true`, because it has no paying
merchants and a landing page must not invent traction.

Provisioning goes through an adapter per product
(`packages/core/src/products/adapter.ts`). The portal calls
`provisionMerchantForPartner(productId, partnerId, payload)` and knows nothing
about restaurants or pharmacies. The shared write lives in `packages/db`
(`provisionPharmacyIn`) so two Next processes run one implementation (D36).

---

## 5. Money

`PartnerLedgerEntry` — one row per **settled** payment, never per invoice.
Immutable: a refund is another row. `providerRef` is unique, so a replayed
webhook cannot pay a partner twice. **The partner's share percentage is
snapshotted onto each row**, which is what lets a past month be recomputed
identically and stops a renegotiated rate rewriting statements already issued.

`Plan.priceFloor` (centavos, 0 = no floor) is the least a partner may charge.

Money is **centavos, integers** everywhere — except territory licence fees, which
are whole pesos and deliberately never added to a centavos total.

---

## 6. Known weak spots

- **Older Servd isolation suites do not switch role.** `partner-portal`,
  `partner-scope`, `provision`, `reassign-audit`, `settlement-scope` and
  `tenant-isolation` set the scope GUC but not `app_user`, so they run with
  BYPASSRLS and cannot observe a policy. They are green for the wrong reason.
  The fix is three lines each (copy `AS_APP_USER` from `partner-seats.test.ts`)
  and needs a database to verify.
- **No statement job and no PDF renderer.** The ledger is right; the monthly
  freeze and any PDF output do not exist.
- **Email cannot send.** Resend reads its key from
  `platform_settings.emailCredsEnc`, decrypted with
  `CREDENTIALS_ENCRYPTION_KEY`, which is unset on every deployment.
- **No domain is registered.** `canvexia.com`, `servdph.net` and `resceta.com`
  are all NXDOMAIN. Everything answers on `.vercel.app`. See
  `docs/canvexia/domains.md`.
- **Turborepo runs in strict env mode.** A variable read by source and missing
  from `turbo.json` is absent from the build AND from the cache key, so a
  redeploy silently serves the previous build. `tests/deploy/turbo-env.test.ts`
  derives the list from source; it has caught this twice.
- **Postgres is unreachable from the agent sandbox** (HTTPS only). DB-backed
  suites skip there; assertions are proved against the real database as SQL over
  the Supabase Management API instead. That is a substitute for running the
  suite, not the same thing.

---

## 6b. The HQ console (`/hq`)

CANVEXIA's own console, added in H1–H2. **A route group inside `apps/servd`,
not a separate app** — a new Next process would need its own Prisma client,
Supabase cookie handling, middleware and Vercel project, plus a copy of every
`@/server/*` module the HQ screens import.

- **Two consoles, one deployment.** `/hq` is CANVEXIA across every partner and
  product. `/super-admin` is *Servd's* own back office (content engine,
  storefronts, CRM, outreach). Screens that belong to the first are MOVED, not
  copied: `/super-admin/partners` is a permanent redirect. Two screens that both
  edit a partner's terms is how the terms come to disagree with themselves.
- **Identity is `platform_admins`**, one path, no fallback — unlike the partner
  portal's two, which exist because it had live sessions to preserve. `role` is
  `NULL | 'ops'` and **NULL means super admin**; `parseHqRole` is the only place
  that knows.
- **RLS is not the boundary here.** Both HQ roles run in a super-admin context
  and can read every row in the schema — that is what an HQ console is. The
  capability matrix in `packages/core` is the whole of the separation, which is
  why `requireHqAction()` re-checks at the server action and not only in the
  layout.
- **Path rules are for sections, not roots.** `"/hq"` in `OPS_SECTIONS` would
  have matched `/hq/team`. The overview is in `OPS_EXACT_PATHS` instead.

### "View as partner"

The one flow in this repository that puts one party inside another's data. Six
properties, each load-bearing, all in `server/hq/impersonate.ts`:

1. **No role escalation.** Never touches Supabase Auth, never mints a partner
   session. A **separate cookie** from the partner session, so code that only
   knows about the other one cannot accept this.
2. **A row, not just a signature** — a signature cannot be revoked and leaves
   nothing to audit.
3. **The SHA-256 is stored, never the token.** A row that reads back into a
   working session turns a database leak into a login.
4. **Single-use, 30 minutes, checked against the row** — never against the
   cookie, which carries the token and nothing else.
5. **Read-only enforced at the action.** `getCurrentPartner()` RESOLVES an
   impersonated session, so calling it in an action and acting on the result is
   *precisely the bug*. Every partner action goes through
   `requireWritablePartner()`, which refuses impersonation **before** consulting
   capabilities — an impersonated session presents as `admin`, so the capability
   check would answer yes. Two source-level tests fail if a new action file
   reaches for the old function.
6. **The operator is told.** A banner on every portal screen, plus start, end
   and duration in the audit log.

### What the HQ screens deliberately do not show

- **Two of the brief's five attention rules are absent**: domains stuck
  unverified and escalations open. No partner domain has ever been registered
  (no domain in this project resolves), and there is no ticket system. An
  always-empty section reads as everything being handled.
- **Payout account numbers never leave `server/hq/partners.ts`.** The encrypted
  blob is selected only to answer "do details exist" and reduced to a boolean
  before it returns. A field that never reaches the component cannot be rendered
  by a component written later.

### The rest of the console (H3–H7)

- **Territories.** 143 seeded cities. `partners.territory` stays free text and
  `territoryId` is the authoritative link; the reconciliation names its two
  aliases (`Davao`→`Davao City`, `Tagum City`→`Tagum`) **one at a time** rather
  than matching by a rule — "Santa Cruz" appears in more than one province, and
  a fuzzy rule licenses somebody for the wrong place. Assignment history is
  append-only with a partial unique index on the one open row per territory.
- **Conversion is one transaction**: partner + seat + invite + territory +
  assignment + application + audit + a QUEUED email. Half of that is worse than
  none of it.
- **`outbound_emails` is a queue, not a sender.** `CREDENTIALS_ENCRYPTION_KEY`
  is unset, so Resend credentials cannot even be stored. Nothing drains it yet.
- **Billing.** The ledger is the source; freezing records only what computation
  cannot produce. Adjustments are ledger rows with a sign convention worth
  re-reading before touching (`server/hq/billing-actions.ts`). Overdue is
  COMPUTED from the freeze date, never read from a column nothing sets.
- **`cron_runs` exists because a run that produced nothing looked identical to
  one that never fired** — and the freeze cron had returned 401 on every firing
  since it shipped, because `CRON_SECRET` was unset. Both are fixed; the first
  successful run was recorded on 2026-09-15.
- **Products.** `packages/core`'s registry stays the source of truth for what
  exists and what is `live`; `product_settings` overlays only the editable
  fields, and the merge in `server/hq/products.ts` is where "the code wins" is
  enforced. A product cannot be created from HQ.
- **Plan floors are a two-step**, and the "who would this break" count includes
  partners with NO price override — if the proposed floor is above the catalogue
  price, that is everybody.
- **Merchants.** Two directories on purpose: `server/partners/directory.ts` is
  restaurant-only and feeds the reassign form; `server/hq/merchants.ts` spans
  both axes. Merging them would offer pharmacies to a form that cannot move one.
- **National accounts carry one known limit**: `referralPartnerId` is on the
  PARTNER, so the house account records one referrer in total. A second national
  account keeps the first rather than overwriting another partner's claim.
- **Announcements.** The segment is evaluated in the app; the policy only
  guarantees drafts are invisible. Nothing ticked means everybody; NULL
  `enabledProducts` matches a product segment.
- **Two HQ seat refusals are load-bearing**: you cannot deactivate yourself, and
  the last active super admin cannot be removed — either would make the console
  that grants access unreachable from inside it.

---

## 7. Conventions worth not re-deriving

- Manual migrations in `packages/db/prisma/manual/*.sql`, idempotent, run by
  hand, then `pnpm --filter @servd/db db:rls`. `manual/` is a **record of what
  was run**, not a queue to replay.
- DB-backed tests are `hasDb ? describe : describe.skip`.
- Pure logic lives in a `lib/` or `packages/core` module with its own test —
  statutory maths, milestone pace, permissions, mobile normalisation. If a rule
  is worth arguing about, it is worth testing without a database.
- `NEXT_PUBLIC_*` is inlined at **build** time: changing one needs a redeploy,
  and it must be read as a literal `process.env.NEXT_PUBLIC_X` reference.
- **Every serverless function runs in `sin1`** (Singapore), beside the Supabase
  project in `ap-southeast-1`. This is set in TWO places and both matter: the
  `regions` key in each app's `vercel.json`, and `serverlessFunctionRegion` on
  the Vercel project, which is a dashboard setting and therefore not in this
  repository. The projects defaulted to `iad1` (Washington), which put the
  Pacific between every query and its answer — that alone was most of a
  seven-second partner dashboard. If a NEW app ever feels inexplicably slow,
  check the project's region before reading any code.
- **A scoped read is four round trips, not one.** `tenantDb`/`partnerDb`/
  `systemDb` each open a transaction: BEGIN, the SET that applies the scope, the
  query, COMMIT. So reads that belong to one screen share one scope wrapper, and
  independent reads go out through `Promise.all` rather than one `await` after
  another. Awaiting nine scope wrappers in series is how the overview page got
  slow the first time.
