# CANVEXIA Platform — Implementation Plan

**Status: DRAFT — awaiting approval. No code has been written.**

Produced by a silent trace of `apps/servd` (88 Prisma models, ~946 files) against the
CANVEXIA brief. Read Part A before approving anything: the trace contradicts several
premises the brief is built on, and two of them change the shape of the work.

### Decisions received

| # | Decision | Status |
|---|---|---|
| **Q2** | Revenue split: **partner 70% / CANVEXIA 30%** of monthly merchant revenue. | ✅ Settled |
| **A2** | Billing provider: **Xendit**. | ✅ Settled — but see A2 below, it is not a config flip |
| **A2b** | **Each partner connects their own Xendit account**, under their own brand. Merchants pay the partner; CANVEXIA never holds the money. | ✅ Settled — reshapes Phase 4, see A2b |
| **Q1** | 70/30 applies to **new partners only**. Existing approved partners keep the zero-cut arrangement. | ✅ Settled — Phase 0 and 1 unblocked, see A1 |
| **Q8** | Topology: **Option B — CANVEXIA as the Xendit platform**, partners as sub-accounts, 30% split at settlement. | ✅ Decided, contingent — see D5 |
| Q3, Q6 | Naming collision; RLS shape. | Open — needed for Phase 1 |
| Q4, Q5 | Brand precedence; brand-mode conflict. | ✅ Settled in Phase 5 — D20, D21 |
| **Q7** | New verticals are **built from scratch in this monorepo**, not migrated. | ✅ Settled — see D24 |

---

## Part A — What the trace found

### A1. The `Partner` model already exists, and it encodes the *opposite* business model ⚠️

`prisma/schema.prisma:1165` defines `Partner`, and there is a live partner portal
(`src/app/(platform)/partner/*`, `src/server/partners/*`) with apply → approve → login →
create demo → convert flows already shipped.

But the current program is explicitly a **zero-revenue-share** arrangement.
From `src/server/partners/portal.ts:6-14`:

> "The program used to be an affiliate scheme: a referral link, a commission accruing on
> somebody else's invoices, a payout waiting to be approved. All of that is gone. A partner
> now gets one thing — they can set up as many restaurants as they like — and what they
> charge those restaurants is entirely between them and the restaurant. **Servd never sees
> it and never takes a cut**, so there is nothing to accrue and nothing to pay out."

`schema.prisma:1172-1177` confirms it: `payoutMethod`, `payoutDetailsEnc`, `taxInfoEnc` are
tombstoned — "Servd pays partners nothing… Nothing reads them." `ProgramSetting`
(`schema.prisma:1191`) was stripped down to a single training-video URL for the same reason.

**A commission system was deliberately built, then deliberately removed.** The CANVEXIA brief
reintroduces it as 70/30. That is a business-model reversal on a live program with existing
approved partners, not a greenfield build.

**Resolved: 70/30 applies to new partners only.** Existing approved partners keep the zero-cut
terms they signed. So the split is a **per-partner field with grandfathering**, not a platform
constant — and `Partner` is migrated in place rather than replaced by a parallel `Operator`
entity.

The codebase already has this exact pattern, with the reasoning written down. `POWERED_BY_SINCE`
(`src/lib/branding/powered-by.ts`) grandfathers restaurants that were trading before the badge
existed, because "quietly stamping a supplier's name on somebody's storefront after the fact is
not a change to spring on a paying customer." Same shape, same argument. Phase 1 follows that
idiom rather than inventing one.

Two traps this creates, both handled in Phase 1:

- **A zero default is the dangerous one.** `revenueSharePct` defaulting to 0 is correct for
  legacy rows and catastrophic for new ones — a partner created without the field explicitly set
  earns CANVEXIA nothing, silently, forever. The guard is the existing `Partner.tier` column
  (`schema.prisma:1171`), which already carries a legacy value (`"affiliate" survives only on old
  rows`): a new `operator` tier is invalid with a 0% share, enforced in code and asserted by test.
- **The grandfather attaches to the partner, not the merchant cohort.** Read literally, an
  existing zero-cut partner still earns CANVEXIA nothing on merchants they sign *next year*.
  That follows from what you said and I have planned for it — flagging it only because it is the
  kind of thing that is cheap to bound now (e.g. legacy terms cover merchants signed before date
  X) and expensive to renegotiate later.

The house partner (CANVEXIA Davao) is new, so it takes the 70/30 path like any other operator —
the statement simply nets out internally, which keeps the brief's "no special cases" rule intact.

### A2. Xendit is chosen — but it cannot auto-charge, and it never auto-suspends ⚠️

**Decision: Xendit.** `PlatformSetting.billingProvider` (`schema.prisma:130`) already accepts
`"xendit"`, `src/server/billing/xendit.ts` is a real implementation, and there is already a
super-admin credentials form (`XenditForm.tsx`). So switching is a config change.

What it costs is not a config change. Traced end to end:

1. **No off-session charging.** `xendit.ts:68-72` — `chargeSavedCard()` is a deliberate no-op
   returning `{ status: "pending" }`. The header comment is explicit: "Off-session card
   charging would need Xendit's recurring / payment-methods API; until then the cron simply
   re-issues an invoice." PayMongo (`paymongo.ts`) does implement it.
2. **So every renewal is a manual payment.** `verifyAndParseWebhook` never returns a
   `paymentMethodId`, so `Subscription.providerPaymentMethodId` stays null, so
   `hasSavedCard` (`run-cron.ts:55`) is always false, so `lifecycle.ts` returns
   `await_payment` and the cron issues a hosted invoice and sets the merchant `past_due`
   (`run-cron.ts:121-129`). Every merchant, every month.
3. **And nobody is ever auto-suspended for non-payment.** `failedCharges` is incremented in
   exactly one place — `run-cron.ts:156`, the charge-*failure* branch — which the `canCharge`
   guard at `run-cron.ts:119` makes unreachable under Xendit. `failedCharges` stays 0 forever,
   so `lifecycle.ts`'s `failedCharges >= MAX_FAILED_CHARGES` suspension arm never fires.

Point 3 directly undercuts the brief's own answer to **P1 (revenue leakage)**, which says "an
account with an active plan but no payment gets suspended by the plan state machine (Servd
already has this)". It has it — **on the PayMongo path only**. On Xendit a merchant sits in
`past_due` indefinitely, still using the product, while CANVEXIA books 30% of revenue it never
collected. On a 70/30 split that is a straight loss, because the partner statement would show
invoices *issued*, not *collected*.

The fix is bounded, not a blocker — Xendit does have a recurring/payment-methods API, and the
existing code comment names it as the missing piece. I have added it to Phase 4 as explicit
scope rather than letting it be discovered later. Until it lands, suspension must be driven by
*invoice age* rather than by `failedCharges`.

None of this changes the abstraction: `BillingProvider` is a clean 4-method interface and the
revenue-share work talks to it, not to a vendor.

### A2b. Partner-connected Xendit accounts — precedent exists, but three things break

**Decision: each partner connects their own Xendit account, for their own brand.** Merchants
pay into the *partner's* account; CANVEXIA never touches the money and invoices its 30% after
the fact.

**The good news — this is an existing pattern, one level up.** Servd already runs
connected accounts for *diner* payments: `Restaurant.paymentGateway` +
`Restaurant.paymentCredentialsEnc` (`schema.prisma:560-561`), AES-256-GCM through
`src/lib/crypto/secrets.ts` keyed by `CREDENTIALS_ENCRYPTION_KEY`. And
`PlatformSetting.xenditCredsEnc` (`schema.prisma:131`) already stores exactly the shape a
partner connection needs — `{ secretKey, callbackToken }`. So partner-level Xendit is the same
encryption helper and the same credential shape, moved from the platform row onto `Partner`.

**What breaks — all three are load-bearing:**

1. **The provider is a process-wide singleton.** `getBillingProvider()` resolves from the
   single `PlatformSetting` row (id `"platform"`). Every call site assumes one gateway for the
   whole platform. It must become `getBillingProviderForPartner(partnerId)`, and every billing
   call site has to carry a partner through it.

2. **The webhook cannot tell partners apart.** `/api/webhooks/billing/route.ts` verifies
   against the *one* platform token. Xendit authenticates with `x-callback-token`, which is
   per-account — so with N partners the route cannot know whose event it is before verifying,
   and trying every partner's token in turn is both O(N) and a timing oracle. It needs a
   per-partner URL. The codebase already has that pattern:
   `/api/webhooks/delivery/[restaurantId]/route.ts`.

3. **`providerRef` stops being a safe lookup key — this is a security issue.**
   `activateByProviderRef(event.providerRef)` settles an invoice by gateway ref alone, which
   was safe when every ref came from one trusted account. With per-partner gateways, refs are
   minted by N *different* Xendit accounts, so uniqueness across them is not guaranteed and the
   trust boundary differs per account. A partner replaying or guessing a ref could settle
   another partner's invoice. Every `*ByProviderRef` lookup must be scoped by partner.
   Same applies to `markAddonPaidByProviderRef`, `activateFeatureSubByProviderRef`,
   `activatePreviewByProviderRef`.

**And it moves the collection risk onto CANVEXIA.** Money lands with the partner; the 30% is an
arrears invoice. Combined with A2 (no auto-charge, no auto-suspend on Xendit), CANVEXIA's
revenue now depends on collection it neither controls nor can enforce. The ledger still stays
authoritative — the *platform* creates the invoices on the partner's account, so it sees every
issuance and settlement — but only for merchants the partner actually bills through the
platform. A partner collecting cash off-platform is invisible; the mitigation is plan state
(an unbilled merchant is capped/suspended), not the ledger.

**Which is why Q8 matters.** Two shapes, and they differ in schema, not just policy:

- **Option A — independent accounts.** Each partner connects a standalone Xendit account.
  Simple, partner owns the relationship, and CANVEXIA carries the full collection risk on 30%
  it has already earned.
- **Option B — CANVEXIA as the Xendit platform.** Partners onboard as sub-accounts beneath
  CANVEXIA's Xendit platform relationship, with the 30% split at settlement rather than
  invoiced in arrears. Collection risk disappears. Costs: CANVEXIA holds the platform
  relationship and partners get KYC'd through it, which is a heavier partner onboarding step.

I have **not** verified what Xendit's platform/sub-account product actually supports
contractually or technically — that is a conversation with Xendit, not something to read out of
this codebase, and the difference between A and B is worth having it before Phase 4 is built.
Option B is strictly better for CANVEXIA's cash position if Xendit supports it on your account
type.

### A3. Servd Delivery's "city-franchise" logic is not in this repo

D7 says to fold it in as a module. `src/server/delivery/` is four files, and `servdgo.ts` is an
**HTTP client for an external service** — `jobanica/ServdGo` is a separate repository. Cities,
riders and the HQ/partner split live over there (`servdgo.ts:29`, `:86`, `:241`). There is no
in-repo hierarchy to fold. D7 as written is unactionable; it becomes either "leave ServdGo as
an external provider" (my recommendation) or a separate migration project.

### A4. Branding is merchant-level; there is no partner brand at all

`Restaurant` already carries `displayName`, `logoUrl`, `brandPrimaryColor`, `brandAccentColor`,
`coverImageUrl`, `tagline` (`schema.prisma:504-513`), rendered through CSS variables
(`tailwind.config.ts` `brandColor()`, `src/lib/theme/brand.ts`).

`Partner` has **no** brand fields. And host resolution (`src/lib/host.ts`) maps a hostname to a
*restaurant* — `subdomain` → restaurant slug, `custom` → restaurant custom domain. There is no
host → partner path.

So Phase 5's "brand engine" is a **new resolution layer above the existing one**, not a rewire
of it. That is easier than the brief implies (the CSS-variable plumbing is done) but it needs a
precedence rule that does not exist yet: when a merchant's own colors and its partner's brand
disagree on a customer-facing page, who wins? See Q4.

### A5. "Powered by" vs full white-label already exists — as a paid unlock

`src/lib/branding/powered-by.ts` implements exactly P2's two brand modes, but keyed to the
*merchant*, sold as a feature unlock, and with a grandfathering cutoff
(`POWERED_BY_SINCE = "2026-08-21T00:00:00+08:00"`). Restaurants trading before that date never
get the badge; anyone who buys the white-label unlock loses it.

The brief instead makes brand mode a **partner-level** setting tied to the revenue split
(70/30 vs 65/35). Those two designs conflict: today a merchant can buy away the badge that,
under the brief, its partner's contract requires. Needs reconciling — see Q5.

### A6. RLS is single-axis, and its table list is hand-maintained

`prisma/rls.sql` enforces isolation on one GUC, `app.current_restaurant_id`, plus an
`app.is_super_admin` bypass (`rls.sql:32-41`). `tenantDb()` / `systemDb()`
(`src/server/tenancy/scoped-db.ts`) set them.

Two things matter for the brief's §5 ("every tenant-data table carries `partner_id` and
`merchant_id`"):

1. The tenant table list at `rls.sql:77-92` is a **hardcoded array of 43 table names**, not a
   catalogue query. There are 88 models. Any table not in that array has no RLS at all.
   Adding a partner axis means touching that array, and the existing drift risk
   (`scripts/schema-drift.mjs`, `tests/db/migration-hint.test.ts` exist to chase it) gets worse.
2. Partner isolation today is **app-level only** — `portal.ts:40` says "strictly filtered by
   partnerId (app-level isolation)" and reads through `systemDb()`, which *bypasses* RLS. So
   the brief's P5 concern is real and currently unmitigated.

Denormalising `partner_id` onto 43+ tables is the brief's stated approach. I would push back:
every tenant table already has `restaurantId`, and `restaurant.partnerId` is one join away. A
`app.current_partner_id` GUC with policies that check
`restaurantId IN (SELECT id FROM restaurants WHERE "partnerId" = app.current_partner_id())`
gives the same guarantee with one new column instead of 43, at the cost of a subquery per
policy. Worth benchmarking in Phase 0 rather than assuming. See Q6.

### A7. Already done — do not rebuild

| Brief asks for | Already exists |
|---|---|
| Vercel custom domains (D6, P7) | `src/server/domains/vercel.ts`, `provider.ts`, `actions.ts` |
| Subdomain fallback (D6) | `src/lib/host.ts` `parseHost()`, `NEXT_PUBLIC_ROOT_DOMAIN` |
| Plan state machine (Phase 4) | `src/lib/billing/lifecycle.ts` — pure, unit-tested, trialing→active→past_due→suspended with dunning |
| Price/plan admin (Phase 2) | `src/app/(platform)/super-admin/{plans,feature-pricing,subscriptions,invoices}` |
| Provisioning entry point (Phase 4 of brief §4) | `src/server/storefront-demo/provision.ts` — the seed of `provisionMerchant()` |
| Merchant→partner link | `Restaurant.demoPartnerId` (`schema.prisma:493-495`), survives demo→real conversion |
| Audit log | `AuditLog` (`schema.prisma:1234`) — **but** `restaurantId` is required, so HQ/partner-level actions cannot be logged in it as-is |
| Monorepo (D5) | Done in the previous commit — `apps/servd`, `packages/{core,ui,db}` |

### A8. The real work is the product dimension, and the brief underweights it

All 88 models key off `restaurantId`. There is no product registry, no `Merchant` abstraction —
`Restaurant` *is* the tenant root. The brief's Phase 1 asks for "partner + merchant tenancy
tables" as if merchant were a new concept; in practice it means introducing a tenant identity
that `Restaurant` becomes a *specialisation of*, without breaking 43 RLS policies, ~900 files
of `restaurantId` plumbing, and a live Davao customer base.

This is the expensive part of the project and it is one line in the brief.

### A9. The other verticals are separate repos, not in this session

`list_repos` shows `jobanica/laundry` (pushed 2026-09-12), `jobanica/Pharmacy` (2026-09-06),
`jobanica/print-new` (private, likely PrintOSph), `jobanica/ServdGo`. None are attached here and
none share code with Servd.

So "build new verticals on the core" is really: publish `@canvexia/core` as a consumable
package **and** migrate three existing codebases onto it. Phase 6's "scaffold for the next
vertical" is not a scaffold — it is a fourth migration. This needs its own estimate.

---

## Part B — Blocking questions

The brief says to use defaults if unanswered. I can default D2–D7. **Q1 I cannot default**,
because getting it wrong means writing code against live partner agreements that say the
opposite.

| # | Question | Why it blocks |
|---|---|---|
| ~~Q1~~ | ✅ **Answered: new partners only.** `Partner` is migrated in place; the split is per-partner with grandfathering (A1). | Phase 0 and 1 unblocked. |
| **Q2** | Which side gets 70? The brief flags this itself. | Default: partner 70 / HQ 30. Safe to default — it is one field's value. |
| **Q3** | `Partner` (affiliate-era, live) vs the brief's `Partner` (city operator) are different things with one name. Rename the existing to `Referrer`/`Reseller`, or migrate it into the new meaning? | Naming collision across ~8 server modules and 3 route groups. |
| **Q4** | On a diner-facing page, when a merchant's brand colors and its partner's brand config disagree, who wins? (A4) | The brief says customer-facing surfaces render partner brand; the product currently renders *merchant* brand, which is what restaurants pay for. |
| **Q5** | Brand mode is currently a per-merchant paid unlock with a grandfathering date (A5). The brief makes it a per-partner contract term. Which governs? | A merchant who already bought white-label under a `powered_by` partner is a live contradiction. |
| **Q6** | `partner_id` denormalised onto 43+ tables, or one `restaurants.partnerId` + subquery policies? (A6) | Determines migration size: 1 column vs 43, and a backfill on a live DB either way. |
| ~~Q7~~ | ✅ **Neither.** New verticals are built from scratch as `apps/*` in this monorepo, on `packages/core` from day one. The existing laundry / Pharmacy / print-new repositories become specification, not code to migrate. | Removes the 3-repo migration entirely; see D24 for what it costs instead. |
| ~~Q8~~ | ✅ **Option B.** Partners are sub-accounts under CANVEXIA's Xendit platform; the 30% comes off at settlement, so there is nothing to collect. `Partner` stores a sub-account id, not credentials. | Two facts still to confirm with Xendit (D5) — a "no" on either reopens it. |

Answers to Part 4's other questions (territory, collection mode, onboarding fee) are needed
before Phase 2/3 but do not block Phase 0–1.

---

## Part C — Phases

Sequencing differs from the brief in one way: I inserted **Phase 0**, and I moved the
house-partner migration *earlier* (into Phase 1) rather than leaving it to Phase 5. Migrating
live Davao merchants under a house partner is the riskiest single step; doing it while the
schema is still small is far safer than after four phases of new tables depend on it.

### Phase 0 — Decisions, spike, and safety net *(no feature code)*

**Purpose:** resolve Q1–Q7 and de-risk the two assumptions that would be expensive to reverse.

- [NEW] `docs/canvexia/decisions.md` — records Q1–Q7 answers as ADRs.
- [NEW] `docs/canvexia/rls-partner-spike.md` — benchmark of denormalised `partner_id` vs
  join-based policies (A6) on a seeded DB at realistic row counts.
- [NEW] `apps/servd/tests/isolation/partner-scope.test.ts` — **written first, failing.**
  Attempts cross-partner reads; is the acceptance gate for Phase 1.
- [MODIFY] `apps/servd/prisma/rls.sql` — no policy changes yet; replace the hardcoded
  `tenant_tables` array (`rls.sql:77-92`) with a catalogue query over
  `information_schema.columns WHERE column_name = 'restaurantId'`, so the list cannot drift
  before we start adding to it.
- [MODIFY] `apps/servd/scripts/schema-drift.mjs` — assert every `restaurantId` table has RLS.

**Verification:** `pnpm --filter servd test` (new isolation test fails as expected, everything
else green); `pnpm --filter servd db:rls` against a scratch DB, then re-run drift check.

### Phase 1 — `packages/core`: identity, tenancy, partner axis

Depends on Q1, Q3, Q6.

- [NEW] `packages/core/src/identity/` — role model spanning `hq_admin`, `partner_admin`,
  `partner_staff`, `merchant_owner`, `merchant_staff`; one Supabase identity, many memberships.
  Wraps, does not replace, `PlatformAdmin` and `StaffUser`.
- [NEW] `packages/core/src/tenancy/scoped-db.ts` — adds `partnerDb(partnerId, fn)` alongside
  the existing `tenantDb`/`systemDb`, setting a new `app.current_partner_id` GUC.
- [NEW] `packages/core/src/products/registry.ts` — `servd | printosph | laundry | pharmacy`.
- [MODIFY] `apps/servd/prisma/schema.prisma` — `Restaurant.partnerId` (nullable, indexed);
  `Partner` gains `slug`, `brandConfig` (Json), `territory`, `revenueSharePct`,
  `collectionMode`, `brandMode`. Per Q6, either this only, or `partnerId` on 43 tables.
- **Grandfathering (A1).** `Partner.revenueSharePct` ships as
  `@default(dbgenerated("0"))` — `dbgenerated` and not a plain Prisma default, for the reason
  written at `schema.prisma:538-548`: a plain default is emitted into every INSERT and breaks
  creates on a live DB that has not yet run the hand-run SQL. Zero is right for legacy rows.
  `Partner.tier` gains `operator`; legacy rows stay `reseller`.
- [NEW] `apps/servd/tests/billing/partner-share.test.ts` — asserts an `operator`-tier partner
  cannot be created or saved with a 0% share, and that legacy `reseller` rows keep 0%
  untouched. This is the guard against the silent-zero trap; it lands with the column.
- [MODIFY] `apps/servd/prisma/rls.sql` — partner-axis policies; `app.current_partner_id()` helper.
- [NEW] `apps/servd/prisma/manual/add-partner-tenancy.sql` — hand-run migration matching the
  repo's existing convention (`prisma/manual/*.sql`, applied out-of-band on the live DB).
- [NEW] `apps/servd/scripts/backfill-house-partner.mjs` — idempotent, dry-run by default:
  creates CANVEXIA Davao and points every existing `Restaurant.partnerId` at it.
- [MODIFY] `AuditLog` — make `restaurantId` nullable, add `partnerId`, `actorType`, so HQ and
  partner actions are loggable (A7).

**Schema migrations:** 1 hand-run SQL file + backfill script.
**RLS:** partner policies on all `restaurantId` tables; `restaurants` policy gains a partner arm.
**Verification:** `pnpm --filter servd test` — the Phase 0 isolation test must now **pass**;
`pnpm --filter servd build`; backfill dry-run output reviewed before any live run.

### Phase 2 — HQ admin

Extends the existing `(platform)/super-admin` group rather than creating a new app — it already
has plans, subscriptions, invoices, partners and feature-pricing screens.

- [MODIFY] `src/app/(platform)/super-admin/partners/*` — territory, split %, collection mode,
  brand mode, product enablement.
- [NEW] `src/app/(platform)/super-admin/products/` — registry + per-plan **price floors**.
- [NEW] merchant directory across partners + reassignment action (audit-logged).
- [MODIFY] `src/lib/billing/planLimits.ts`, `src/server/billing/super-admin-actions.ts` —
  enforce floor on write.

**Verification:** `pnpm --filter servd test`, plus a new test asserting a below-floor price is rejected.

### Phase 3 — Partner portal

- [MODIFY] `src/server/partners/portal.ts` — from a demo work-list to a real operator console.
  **Must stop reading through `systemDb()`** and move to `partnerDb()` (A6).
- [NEW] brand settings, domain management (reusing `src/server/domains/*`), staff management,
  statements view.
- [MODIFY] `src/server/partners/demo.ts` — `createPartnerDemo` / `convertPartnerDemo` refactored
  to call the shared `provisionMerchant()`.

### Phase 4 — Per-partner Xendit, ledger, statements

Reshaped by A2 and A2b. Depends on **Q8**. This is now the largest phase, not the smallest.

**4a — Per-partner gateway (Option B)**
- [MODIFY] `schema.prisma` — `Partner.gatewayCredsEnc` (`{ secretKey, callbackToken }`, reusing
  `src/lib/crypto/secrets.ts` verbatim) under Option A, or `Partner.gatewaySubAccountId` under
  Option B.
- [MODIFY] `src/server/billing/index.ts` — `getBillingProvider()` →
  `getBillingProviderForPartner(partnerId)`. Touches every billing call site.
- [NEW] `src/app/api/webhooks/billing/[partnerId]/route.ts` — per-partner webhook, modelled on
  the existing `/api/webhooks/delivery/[restaurantId]/route.ts`.
- [DELETE] `src/app/api/webhooks/billing/route.ts` — only after every partner is migrated to a
  per-partner URL; keep it returning 410 for a deprecation window rather than 404.
- [MODIFY] `activate.ts`, `addons.ts`, `feature-subscriptions.ts`, `build/activation.ts` —
  **every `*ByProviderRef` lookup scoped by `partnerId`** (A2b item 3, security).
- [NEW] `tests/billing/provider-ref-scope.test.ts` — asserts partner A's webhook cannot settle
  partner B's invoice. Treat as the acceptance gate for 4a.

**4b — Close the Xendit suspension hole (A2)**
- [MODIFY] `src/lib/billing/lifecycle.ts` — add an invoice-age suspension arm so non-payment
  escalates without depending on `failedCharges`, which Xendit never increments.
- [NEW] tests covering: merchant never pays → suspended after N days; paying merchant is not.
- Optional, larger: implement `chargeSavedCard` against Xendit's recurring/payment-methods API
  so auto-charge works at all. Recommend scheduling this, not skipping it.

**4c — Ledger and statements**
- [NEW] `packages/core/src/billing/ledger.ts` — immutable events; statements computed from the
  ledger only, and recording **settled** amounts, not issued ones (A2b).
- [NEW] monthly statement job, Asia/Manila, added to the existing cron array in
  `apps/servd/vercel.json` (which already runs `/api/cron/billing` at 03:00).
- Under Option A the statement is a CANVEXIA→partner receivable; under Option B it reconciles
  an already-taken split. Same ledger either way.

### Phase 5 — Brand engine into Servd

- [MODIFY] `src/lib/host.ts` — resolve host → partner **as well as** → restaurant, with the
  precedence rule from Q4.
- [MODIFY] `src/lib/branding/powered-by.ts` — reconcile per-merchant unlock with per-partner
  brand mode (Q5), preserving the `POWERED_BY_SINCE` grandfathering.
- **Gate:** `servdph.com` must render byte-identically before/after. Verified by snapshotting
  the rendered diner page pre- and post-change, not by eyeball.

### Phase 6 — Product adapter

Q7 settled: new verticals are built from scratch here (D24), so this phase is the
interface and nothing else. Originally: `provisionMerchant(productId, partnerId,
payload)` + a reference adapter. As a migration of laundry/Pharmacy/print-new: separate plan.

---

## Part D — Risks

1. **Live customers throughout.** Davao restaurants are trading. Every schema change goes
   through `prisma/manual/*.sql` hand-run migrations, and the codebase has scar tissue about
   this — see `schema.prisma:538-548`, where a plain Prisma `@default` broke restaurant
   creation on a DB that hadn't run the SQL yet. New columns must use `dbgenerated()` defaults
   for the same reason.
2. **RLS bypass via `systemDb()`.** Partner reads currently run super-admin. Until Phase 3, a
   partner-portal bug is a cross-partner data leak, not a 403.
3. **Backfill is one-way.** Pointing every restaurant at a house partner has no clean undo.
   Dry-run + row-count assertions + a DB snapshot first.
4. **Phase 5 regression surface is the whole diner experience** — the highest-traffic,
   lowest-tolerance surface in the product.
5. **Cross-partner settlement (A2b item 3).** Until `*ByProviderRef` is partner-scoped, a
   per-partner gateway means one partner's webhook can settle another's invoice. This is the
   one item in the plan I would not ship behind a flag — it must land with 4a or not at all.
6. **CANVEXIA's 30% is unsecured under Option A.** Money never touches CANVEXIA; the share is
   a receivable from a partner whose own collection tooling (Xendit invoices, no auto-charge)
   is weak. Two layers of collection risk stacked. Option B removes both.
7. **`CREDENTIALS_ENCRYPTION_KEY` becomes systemically critical.** It already protects
   restaurants' diner-payment credentials; it would now also protect every partner's gateway
   secret. Key rotation has no story in the codebase today.

---

## What I need from you

**Settled:** partner 70 / CANVEXIA 30 · Xendit · partner-connected gateway accounts ·
70/30 for new partners only, existing partners grandfathered.

**Phase 0 is unblocked and needs nothing further** — it is decisions, a spike, and a safety net,
with no feature code. Say the word and I will start it.

Still open, in the order they bite:

| | Needed by | Can I default it? |
|---|---|---|
| **Q3** naming collision (`Partner` legacy vs operator) | Phase 1 | Yes — legacy rows keep `tier: reseller`, no rename |
| **Q6** `partner_id` on 43 tables vs join-based policies | Phase 1 | No — Phase 0's spike answers it with a benchmark |
| ~~Q8~~ topology | — | ✅ Decided: Option B (D5), contingent on two answers |
| ~~Q4, Q5~~ brand precedence · brand-mode conflict | — | ✅ Settled (D20, D21) |
| ~~Q7~~ vertical scope | — | ✅ Settled: built from scratch here (D24) |

No application files have been modified. The only file written is this plan.
