# Servd

Multi-tenant, QR-based restaurant ordering platform. Diners scan a table QR,
browse a white-label menu, order, pay online, and leave feedback. Restaurants
get a real-time kitchen + cashier dashboard. You (the platform super-admin) sell
it as a subscription to many restaurants.

> **Status:** Phase 0 (scaffold + Servd design system) and Phase 1 (tenancy +
> auth + branding + RLS + isolation tests) are built. See the roadmap below.

## Tech stack

| Concern | Choice |
| --- | --- |
| App framework | Next.js (App Router) + TypeScript |
| Database | PostgreSQL via **Supabase** |
| ORM / migrations | Prisma |
| Auth | Supabase Auth (staff/admin/super-admin only; diners need no login) |
| Tenant isolation | `restaurant_id` on every row + **Postgres Row-Level Security** |
| Realtime (Phase 6+) | Supabase Realtime (broadcast ping + server refetch) |
| Object storage (Phase 1+) | Supabase Storage |
| Styling | Tailwind CSS driven by CSS variables (enables white-label) |
| Payments (Phase 9) | PayMongo behind a `PaymentGateway` interface |
| SMS (post-MVP) | Semaphore behind an `SmsProvider` interface |

## Multi-tenancy: two layers of isolation

1. **Application layer** — every request derives `restaurantId` from the trusted
   session (`src/server/tenancy/current-user.ts`), never from the URL/body.
2. **Database layer (the real guarantee)** — `packages/db/prisma/rls.sql` defines RLS
   policies on every tenant table. Queries run through `tenantDb(restaurantId,
   …)` (`src/server/tenancy/scoped-db.ts`), which sets a Postgres session
   variable the policies filter on. We use `FORCE ROW LEVEL SECURITY` so even
   the table owner is subject to policies — without it, RLS would be silently
   bypassed. The super-admin uses `systemDb(…)` to operate across tenants.

This is verified by `tests/isolation/tenant-isolation.test.ts`.

## Realtime (kitchen/cashier)

We treat realtime as a **signal, not a data channel**. When an order is placed or
its status changes, the server broadcasts a contentless `refresh` ping on a
per-restaurant channel (`orders-{id}`). Live screens react by refetching through
the session-scoped server actions (`getKitchenOrders`) — the same trusted,
tenant-isolated path everything else uses. This avoids needing per-restaurant JWT
claims to satisfy RLS on a streamed table. A 15s polling fallback keeps boards
fresh even if Supabase Realtime isn't configured (the UI shows Live vs Polling).

## Online payment (connected accounts)

Each restaurant connects its **own** PayMongo account — funds go straight to it,
Servd never holds the money. Credentials (secret key + webhook signing secret)
are encrypted at rest with **AES-256-GCM** (`src/lib/crypto/secrets.ts`,
`CREDENTIALS_ENCRYPTION_KEY`). The gateway is abstracted behind
`PaymentGateway` (`src/server/payments/gateway.ts`) with a PayMongo impl, so
swapping to Xendit/HitPay later doesn't touch the order flow.

Flow (pay-after-eating): diner taps **Pay online** → `createTableCheckout`
builds a hosted checkout for the table's outstanding orders and records a
*pending* payment per order → diner pays via GCash/card → **PayMongo webhook**
(`/api/webhooks/paymongo/[restaurantId]`) is the ONLY thing that marks orders
paid, after verifying the signature with that restaurant's secret. The client is
never trusted to confirm payment.

Setup per restaurant: enter keys at `/admin/payments`, then register the shown
webhook URL in the PayMongo dashboard. Restaurant subscription billing to the
platform remains **stubbed**.

## Pluggable printing

One ticket model (`src/lib/printing/ticket.ts`) renders to either ESC/POS bytes
(`escpos.ts`) or printable HTML. The transport is chosen per restaurant
(`restaurant.printMethod`) and dispatched in `src/server/printing/print.ts`:

| Method | Where it runs | Notes |
| --- | --- | --- |
| `network` | server → local print-bridge agent | Wi-Fi/USB ESC/POS; browsers can't open raw :9100, so a tiny agent relays it. Most reliable. |
| `cloud` | printer polls `/api/print/cloud/[id]?token=` | CloudPRNT/Server Direct; works on ANY device incl. iPad/iPhone. |
| `bluetooth` | browser (Web Bluetooth) | Chromium desktop/Android only, BLE ESC/POS only; runtime-detected with fallback. |
| `os_dialog` | browser (print HTML ticket) | AirPrint/OS dialog; device-agnostic fallback. |

Manual print is the "Print ticket" button on the cashier board; `autoPrint`
prints each new order automatically (server-driven methods only). Configure at
`/admin/printing`.

## White-label branding

The Servd palette (`src/styles/globals.css`) is the **default**. Diner pages
(`/order/[slug]/…`) wrap content in `<BrandProvider>`, which overrides the
`--brand-*` CSS variables with the restaurant's own colors. Same components, no
conditionals — they just re-skin. Platform chrome (login/admin/super-admin) keeps
the Servd identity.

## Project layout

```
prisma/        schema.prisma · rls.sql · seed.mjs
scripts/       apply-rls.mjs
src/
  app/
    (platform)/   Servd-branded: login, signup, admin, kitchen, cashier, super-admin
    (diner)/      white-label: order/[slug]/[tableToken]
    icon.svg      app icon → favicon/PWA
  components/      Wordmark, diner/BrandProvider, …
  lib/            supabase clients, theme/brand
  server/         db, tenancy (current-user, scoped-db), restaurants
  styles/         globals.css (design tokens)
tests/           theme (unit) · isolation (RLS)
```

## Getting started

```bash
cp .env.example .env.local      # fill in Supabase + DB URLs
npm install
npx prisma db push              # create tables
npm run db:rls                  # apply Row-Level Security policies
node packages/db/prisma/seed.mjs            # two demo restaurants (mango-grill, guava-cafe)
npm run dev
```

**Storage bucket (menu photos):** in Supabase → Storage, create a **public**
bucket named `menu-images`. Uploads are namespaced per restaurant
(`{restaurantId}/{uuid}.ext`) and validated server-side (JPEG/PNG/WebP, ≤ 5 MB)
in `src/server/storage/menu-images.ts`.

To run the **isolation tests** against your database:

```bash
npm run db:rls
DATABASE_URL="postgres://…" npm run test:isolation
```

### Linking a staff login (Supabase Auth)

Auth identities live in Supabase `auth.users`. To make a login work, create a
Supabase user, then insert a matching `staff_users` (or `platform_admins`) row
with that user's `authUserId`. A self-serve signup flow lands at the end of
Phase 1; until then provision via Supabase dashboard + seed.

## What's deliberately stubbed / deferred

- **Restaurant subscription billing** — `plans`/`subscriptions` are modeled and
  feature-gating can read them, but no recurring charge is taken. The super-admin
  sets status manually.
- **Payments (Phase 9)** — interface + DB fields exist; PayMongo impl not built.
  Model: **connected accounts** (each restaurant uses its own PayMongo account;
  funds go straight to them). Platform split-payments deferred to a later phase.
- **SMS (post-MVP)** — full schema (consent, double-opt-in, credit ledger) is in
  place; sending/opt-in flows not built yet.
- **Custom subdomains/domains** — `restaurants.subdomain` reserved, unused.

## Inventory (premium module)

Gated by the `inventory` plan module. Ingredients (`inventory_items`), suppliers,
purchase orders (receive → **weighted-average cost**), and recipes
(`recipe_components`, edited on the menu item page). Stock changes only via
`stock_movements` (sale/waste/received/adjustment/count) — a full audit trail.
When the kitchen marks an order **done**, ingredients auto-deduct (idempotent via
`order.inventoryDeductedAt`); if `autoOutOfStock` is on, items whose ingredient
hits zero flip to unavailable (reuses `isAvailable`). `/admin/inventory` shows
low-stock + 30-day COGS; counts record variance. (Email/SMS low-stock alerts
deferred.)

## HRIS (premium module)

Gated by the `hris` module; accessible to owner + a new **`manager`** role.
Employees (profiles, pay rate/type, emergency contact, document uploads to a
**private** `employee-documents` bucket), scheduling (shifts, weekly roster,
availability, shift-swap requests), time & attendance (QR personal clock at
`/clock/[token]` + PIN station at `/clock`, worked hours + overtime flag,
timesheet approval), leave (types, requests with approval, balances), and
**payroll prep** (`/admin/hr/payroll`): hours → gross + CSV. **No statutory PH
rates are hardcoded** (SSS/PhilHealth/Pag-IBIG/BIR/13th-month) — compliant
payroll is a separate later phase; OT multiplier/contribution rates stay
configurable.

## Custom domains (premium)

Gated by the `custom_domain` plan module. A restaurant can serve its diner pages
on `mango-grill.servd.app` (subdomain) or its own `order.mybistro.com` (auto-SSL
via the **Vercel Domains API**, behind a `DomainProvider` interface). `middleware.ts`
routes by host shape (Edge-safe, no DB) and rewrites tenant hosts to
`app/sites/[host]/…`, which resolves the restaurant by host and reuses the exact
diner UI — order/pay/bill still resolve by `slug`, so they work on any host. The
printable table QR points to the branded host when set. Configure
`NEXT_PUBLIC_ROOT_DOMAIN`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (a one-time
wildcard `*.servd.app` domain on the Vercel project enables subdomains). Manage
at `/admin/domains`.

## Internationalization (i18n)

`next-intl` with **cookie-based locale** (no URL changes) — English + Filipino,
add a language by dropping a `messages/<code>.json` catalog. The diner flow
(menu, cart, item, feedback, bill, pay, SMS opt-in) and login/signup are
translated; a language switcher on the diner header persists the choice. Admin
chrome stays English for now (catalog is ready to extend). **Menu content** is
translatable per restaurant: `menu_item_translations` / `category_translations`
overlay the base text with a fallback, editable on the item page.

## Subscription billing (restaurants pay the platform)

`BillingProvider` interface (PayMongo impl on the **platform's** account, swappable).
New signups get a **30-day free trial** (no card upfront). Near/at trial end the
owner adds a card via hosted checkout (`/admin/billing`); that card is saved and
auto-charged monthly by a **Vercel Cron** (`/api/cron/billing`, guarded by
`CRON_SECRET`). The pure lifecycle (`src/lib/billing/lifecycle.ts`) drives
trial → active → past_due (dunning) → suspended; a signature-verified billing
webhook (`/api/webhooks/billing`) is the only thing that marks invoices paid.

Plans (`Starter ₱1,999 / Pro ₱2,499 / Business ₱4,999`) carry `limits`
(enforced, e.g. `maxTables`) and `plan_modules` (`inventory / hris /
custom_domain`) that the entitlements helper gates F/G/H on. Suspended
restaurants are blocked from staff/admin screens (owner is routed to billing);
super-admin sees MRR and can un-suspend. Restaurant subscription billing is **no
longer stubbed.**

## Feedback & reputation

After payment, every diner gets the same ask — a 1–5 star rating + optional
comment (stored for the owner's inbox at `/admin/feedback`) — and the same Google
review invite, shown to **everyone regardless of rating**. Online payment routes
to the feedback screen on success when `feedbackMode` is `on_device`/`both`; a
"Leave feedback" link is always available for cash payers. Owners set the Google
link + feedback mode at `/admin/reputation`. The automated follow-up SMS invite
is Phase 11.

## SMS marketing (Semaphore)

Platform-held provider account, metered per restaurant via the credit ledger
(`adjustCredits`) — you resell credits; the super-admin tops them up and assigns
each restaurant's registered sender name. `SmsProvider` abstracts Semaphore.

Consent is enforced by design:
- opt-in is always optional (never blocks ordering/paying); the checkbox is
  **unchecked by default**, standalone (not bundled with terms), and states who/
  what/frequency/how to stop — the exact wording is stored as proof;
- **double opt-in by default**: a contact is `pending` until they reply YES
  (handled by `/api/webhooks/sms`); single opt-in is a per-restaurant fallback;
- **STOP** opts a number out immediately; campaigns send to `confirmed` contacts
  only — never pending/opted-out;
- marketing consent is tracked separately from any transactional number.

Compose/send + delivery results at `/admin/sms`; the diner opt-in appears on the
feedback screen, kept separate from the (non-incentivized) Google review ask.

## Compliance guardrails (built into the design)

- **No review gating.** The Google review invite is shown to ALL diners
  regardless of rating (`feedback.google_invite_shown`). Sentiment-based routing
  is never implemented.
- **SMS consent is separate from transactional.** `customer_contacts` tracks
  `marketing_consent` (none/pending/confirmed/opted_out) with stored proof, and
  defaults to double opt-in.

## Roadmap

| Phase | What | Status |
| --- | --- | --- |
| 0 | Scaffold + Servd design system | ✅ |
| 1 | Tenancy, auth, branding, RLS + isolation tests | ✅ |
| 2 | Menu management (categories, items, modifiers) | ✅ |
| 3 | Tables + printable QR | ✅ |
| 4 | Diner menu → cart | ✅ |
| 5 | Place order (modifier pricing, snapshotting) | ✅ |
| 6 | Real-time kitchen display | ✅ |
| 7 | Cashier dashboard + pluggable printing | ✅ |
| 8 | Request bill | ✅ |
| 9 | Online payment (PayMongo, webhooks) — **high risk** | ✅ |
| 10 | Post-payment feedback + Google review invite | ✅ **(MVP complete)** |
| 11 | SMS marketing (post-MVP) — **compliance risk** | ✅ |

### Extension phases (post-MVP roadmap: A–H)
| Phase | What | Status |
| --- | --- | --- |
| A | Self-serve signup + onboarding wizard + branding editor | ✅ |
| B | Subscription billing (restaurants pay the platform) | ✅ |
| C | Analytics & reporting | ✅ |
| D | Internationalization (i18n) | ✅ (diner-first) |
| E | Menu item videos | ✅ |
| F | Custom subdomains / domains | ✅ |
| G | HRIS module (plan-gated) | ✅ **(all phases complete)** |
| H | Inventory module (plan-gated) | ✅ |
```
