# CANVEXIA Partner Portal — Phase A

Mode C plan. **Nothing is written yet.** Section 0 is the part to read first:
seven premises in the brief do not hold against this repository, and three of
them change what the sub-phases are rather than how they are built.

The previous occupant of this filename (the apps/www plan, now shipped) is at
`docs/canvexia/www-plan.md`.

---

## 0. Blocking — what the brief assumes vs. what is here

### 0.1 `apps/partner` does not exist

> *"apps/partner currently only lets a partner create a merchant."*

There is no `apps/partner`. The portal is six routes inside the Servd app:

```
apps/servd/src/app/(platform)/partner/{login,forgot-password,apply,brand,demo/[id]}/ + page.tsx
apps/servd/src/components/partner/*            9 components
apps/servd/src/server/partners/*              15 modules
```

It already does more than create a merchant: storefront demos with AI menu
scanning, demo→merchant conversion, a brand editor, pharmacy provisioning and
activation (D36), and a revenue-share-aware dashboard.

**This matters because a new app is a second Next process** — its own Prisma
client, its own Supabase SSR cookie handling, its own middleware, its own Vercel
project and domain. That is exactly the cost D36 was written about, and it buys
nothing here: the portal's routing already works and is branded (D37).

**Recommendation: build Phase A inside `apps/servd/src/app/(platform)/partner`.**
Extracting to `apps/partner` is a defensible later move, but it is a migration
with live sessions in it and should not be bundled with six feature phases. Say
the word if you want the extraction and I will scope it as its own phase.

Everything below assumes the existing location. Swapping is a path change, not
a design change.

### 0.2 There is no `core` schema, and `packages/core` has no database

The brief says `core.prospects`, `core.partners`, `core.audit_log`,
`core.products`, `core.brand_config`, `core.plan`.

- **There is no `core` schema.** All ~104 models are in `public`. This was
  settled for the landing page: `multiSchema` is a Prisma preview feature and a
  second schema means annotating every existing model on a live database, for a
  naming preference.
- **`packages/core` is seven files of pure TypeScript** — role vocabulary, GUC
  names, merchant axes, the product registry, brand config types. It owns no
  tables **by design**, and `packages/db` is where schema lives (D36).

So "A1 core additions" means **migrations in `packages/db`** plus type additions
in `packages/core`. No file in `packages/core` gains a query.

### 0.3 Four of the six tables named in the brief do not exist

| Brief calls it | Reality |
|---|---|
| `core.partners` | ✅ `public.partners` — but **no** `milestone_6mo_target`, `milestone_12mo_target`, `exclusivity_expires_at`, `license_started_at` |
| `core.audit_log` | ✅ `public.audit_log`, already has `partnerId`, `actorType`, `before`, `after` — fits as-is |
| `core.prospects` | ❌ does not exist. `prospect_leads` is a **different thing**: HQ's OpenStreetMap scraping list, super-admin-only, no partner scope |
| `core.brand_config` | ❌ no table. Brand is `Partner.brandConfig` (a `Json` column) shaped by `packages/core/src/branding/config.ts` |
| `core.products` | ❌ no table. Products are a **code registry** (`PRODUCTS` in `packages/core/src/products/registry.ts`) |
| `core.plan` floors | ✅ `Plan.priceFloor` exists, in centavos, default 0 |

`core.products` is the one worth a decision rather than a note — see 0.7.

### 0.4 There is no partner-staff identity at all

> *"add `partner_sales` and `partner_support` roles to core if only
> `partner_staff` exists; migrate existing `partner_staff` → `partner_sales`"*

`partner_staff` exists **only as a string in a TypeScript union**
(`packages/core/src/identity/roles.ts`). There is no partner-staff table, no
rows, and nothing to migrate. **A partner is one Supabase user**, joined by
`Partner.authUserId`.

So §7 (Team) is not "add two roles". It is: a new `partner_users` table, an
invite flow, a second way for `getCurrentPartner()` to resolve an identity, and
RLS that reads a role rather than a partner id. That is the largest single piece
of work in Phase A and it is **a prerequisite for the permissions §7 asks to
enforce in RLS** — which means A1 grows, or A6 moves earlier.

**Recommendation:** partner users land in **A1**, not A6, because every later
phase's RLS references the role. A6 keeps the invite UI and the activity log.

### 0.5 There is no statement job, and no PDF pipeline

> *"frozen on the 1st (Asia/Manila) by the statement job from the platform
> build"* · *"PDF via the existing Playwright pipeline in apps/servd"*

Neither exists.

**What DOES exist, and it is the good half:** `PartnerLedgerEntry` — one row per
**settled** payment (not per invoice), immutable, `providerRef` unique so a
replayed webhook cannot pay twice, and **the partner's share percentage
snapshotted onto the row** so renegotiating a rate cannot silently rewrite
statements already issued. `apps/servd/src/server/billing/settle.ts` writes it.
That is the ledger A4 needs, and it is already correct.

Missing: the monthly freeze, the statement row, and any PDF rendering at all.
Searched for playwright, puppeteer, @react-pdf, jspdf — **none are dependencies
of any app.** The only PDFs in this repo are *uploads* accepted by the menu
scanner. Printing everywhere else is `window.print()` plus print CSS.

**Recommendation for A4:** statements are a **derived view first, a frozen row
second**. Compute from the ledger on read (it is immutable, so a past month
always recomputes identically), and add `partner_statements` only for the
frozen-on-the-1st number and the payout status HQ edits. For PDF: a
`/revenue/statements/{id}/print` route with print CSS and the browser's own
"Save as PDF" — the same mechanism every receipt in this repo already uses. It
ships in A4 instead of blocking on a headless-browser dependency, and if you
want a real generated PDF later it is one route to swap.

### 0.6 The digest email cannot send, and neither can the lead notification

§2 (notify the partner of a new lead) and §8 (7:00 AM digest) both need email.
Resend exists but reads its API key from `platform_settings.emailCredsEnc`,
decrypted with `CREDENTIALS_ENCRYPTION_KEY` — **unset on every deployment**, and
no key has ever been entered. This is the same blocker the waitlist hit.

**Recommendation:** build the preference storage and the digest *composition*
(testable, pure), put the send behind the existing provider, and let it no-op
loudly when unconfigured. What must not happen is a UI that says "we emailed
you" when nothing was sent — the waitlist success state took the same care.

### 0.7 Small things that still need an answer

| # | Item | Recommendation |
|---|---|---|
| a | **Milestone shape.** §1 says two targets (6mo, 12mo). Your fill-note says three (10 by month 1, 25 by month 3, 50 by month 6). These are different models. | Store a **JSON array of `{month, target}`** on `partners`, defaulting to your three. It covers both and lets HQ set a per-partner ladder without another migration. |
| b | **`core.products` training URL.** | Add `docsUrl`/`trainingUrl` to the **registry** (code), not a table. Products are code — a table would mean two sources for "what products exist". |
| c | **`{slug}.canvexia.app` default domain.** | **canvexia.app is not owned and canvexia.com does not resolve** — all three domains are NXDOMAIN (see `docs/canvexia/domains.md`). Default to `{slug}.canvexia.com` and treat it as *planned*, not *active*, until DNS exists. |
| d | **Vercel Domains API credentials.** | They exist and work — `VercelDomainProvider` behind a `DomainProvider` interface, already used for restaurant custom domains. A5 reuses it; no stub needed. The env var to add is the per-product **project id**. |
| e | **MFA.** | Not enabled in this Supabase project and not used anywhere. §8 says "if already enabled" — it is not, so A6 omits it. |
| f | **"View as partner" hook.** | Buildable now: `resolveScope()` in `packages/core` already takes a `prefer.partnerId`. The hook is an HQ-only wrapper that sets it and writes an audit row. |
| g | **Charts.** | `recharts ^3.8.1` is already a dependency of apps/servd. Nothing to add. |
| h | **`system_architecture.md`** | Does not exist. The protocol says to read it. I will **write it** at the end of A1, recording the tenancy model, the GUC/RLS pattern, and the registry — so later phases stop re-deriving it. |

---

## 1. The non-negotiable: RLS before screens

Every screen in this brief is partner-scoped, and this repository has been
burned by exactly this once: D27 found twelve tables with no policy at all,
`prospect_leads` among them — names, emails, phone numbers of sales leads,
writable by anyone who read the page source.

So, for every new table:

1. `FORCE ROW LEVEL SECURITY` — without FORCE the owning role bypasses policies
   and the guarantee is decoration.
2. A policy keyed on `app.current_partner_id()`, plus the super-admin escape.
3. **A test that authenticates as partner B and fails to read partner A's row**,
   including by primary key. `apps/servd/tests/isolation/` has seven of these to
   copy; `partner-scope.test.ts` is the closest shape.
4. `REVOKE ALL … FROM anon, authenticated` where the table holds personal data.
   `partner_waitlist` does this; `prospects` carries mobile numbers and
   addresses and will do the same.

**A2 does not start until A1's isolation suite passes against a real database.**

---

## 2. Sub-phases

### A1 — Schema, roles, RLS, and the identity that everything else needs

```
[MODIFY] packages/db/prisma/schema.prisma
           Partner        + milestones Json?, licenseStartedAt, exclusivityExpiresAt,
                            onboardingSteps Json?
           + PartnerUser    id, partnerId, authUserId?, email, name, role, status,
                            invitedAt, acceptedAt, deactivatedAt
           + PartnerInvite  token hash, email, role, expiresAt, acceptedAt
           + Prospect       partnerId, businessName, ownerName, mobile, address,
                            productId, stage, source, nextFollowUpAt, notes,
                            assignedToId, lostReason, convertedMerchantId,
                            convertedProductId, createdAt
           + NotificationPref  partnerUserId, event, email bool, messenger bool
[NEW]    packages/db/prisma/manual/add-partner-portal.sql
[MODIFY] packages/db/prisma/rls.sql        prospects, partner_users, partner_invites,
                                           notification_prefs → partner-scoped
[MODIFY] packages/core/src/identity/roles.ts
           ROLES += partner_sales, partner_support   (partner_staff KEPT as an
           alias — it is in a shipped type union; removing it is a breaking
           change for no gain)
[NEW]    packages/core/src/identity/permissions.ts   can(role, capability)
[MODIFY] apps/servd/src/server/partners/auth.ts      resolve via PartnerUser first,
                                                     fall back to Partner.authUserId
[NEW]    apps/servd/tests/isolation/partner-portal.test.ts
[NEW]    system_architecture.md
```

**Migration risk to call out now:** `Partner.authUserId` is how every existing
partner logs in, including the two live rows. A1 must keep that path working
while `partner_users` becomes the new one — so the migration **backfills a
`partner_users` row with role `admin` for every partner that has an
`authUserId`**, and `auth.ts` checks the new table first and the old column
second. No session breaks.

**Verify:** `pnpm --filter @servd/db db:push && pnpm --filter @servd/db db:rls`
then `pnpm --filter servd exec vitest run tests/isolation/`. The suite must
prove: partner B cannot read A's prospects, by list or by id; a `sales` user
cannot read revenue; a deactivated user resolves to no partner.

### A2 — Overview + Merchants + create-from-prospect

```
[MODIFY] (platform)/partner/page.tsx          → stat cards, milestones, attention list
[NEW]    components/partner/StatCards.tsx, MilestoneTracker.tsx, AttentionList.tsx,
         GrowthChart.tsx (recharts), OnboardingChecklist.tsx
[NEW]    (platform)/partner/merchants/page.tsx, merchants/[id]/page.tsx
[NEW]    server/partners/overview.ts, merchants.ts, merchant-actions.ts
[NEW]    lib/partners/milestones.ts        pace maths — PURE, tested without a DB
[NEW]    lib/partners/attention.ts         the five rules — PURE, tested
[NEW]    tests/partners/milestones.test.ts, attention.test.ts
```

The two `lib/` modules are pure on purpose: "at risk = behind linear pace" and
"no orders in 14 days" are the assertions worth writing tests for, and they do
not need a database to be right.

**MRR across products** is the trap here. `PartnerLedgerEntry.merchantId` is *the
id within a product* and deliberately not a foreign key — the table it points at
depends on `productId`. So the merchant directory is a **fan-out over the
registry**, not a join. That belongs behind one function.

**"Log in as merchant"** is the highest-risk item in the whole brief: a
partner-triggered session in a merchant's account. Scoped tightly — 30-minute
expiry, a banner the merchant page cannot suppress, an audit row written
*before* the session is minted, and never available to `partner_sales`.

**Verify:** `pnpm --filter servd build`, the two pure suites, and an isolation
test that a partner's merchant list contains none of another partner's.

### A3 — Pipeline + lead form

```
[NEW] (platform)/partner/pipeline/page.tsx        kanban + list toggle
[NEW] components/partner/PipelineBoard.tsx (client), ProspectCard.tsx, ProspectForm.tsx
[NEW] app/l/[slug]/page.tsx                       PUBLIC branded lead form
[NEW] server/partners/prospects.ts, server/partners/lead-form.ts
[NEW] lib/partners/prospect-input.ts              validation — PURE, tested
[NEW] tests/partners/prospect-input.test.ts, tests/isolation/prospects.test.ts
```

The public lead form is the one **unauthenticated write** in Phase A, so it gets
the waitlist's treatment exactly: a server action (never a browser write), no
`anon` grant on the table, PH mobile normalised to one stored shape, and the
DB-backed IP rate limiter already in `packages/db`.

Drag-and-drop: **no new dependency.** HTML5 drag events on desktop plus a
stage `<select>` on the card, which is also the mobile path and the accessible
one. The brief asks for mobile-first here and a drag-only kanban is neither.

**Verify:** a prospect created at `/l/{slug}` is visible to that partner and to
no other; stage moves write audit rows.

### A4 — Revenue + pricing + statements

```
[MODIFY] packages/db/prisma/schema.prisma   + PartnerStatement (frozen month,
                                              payout status, HQ-editable)
[NEW]    packages/db/src/statements.ts      computeStatement(tx, partnerId, month)
                                            — derives from the ledger
[NEW]    (platform)/partner/revenue/page.tsx, revenue/[month]/page.tsx,
         revenue/[month]/print/page.tsx, revenue/pricing/page.tsx
[NEW]    server/partners/revenue.ts, pricing-actions.ts
[NEW]    app/api/cron/freeze-statements/route.ts    1st, Asia/Manila
[NEW]    tests/partners/statement.test.ts           recompute-stability + split maths
```

The test that matters: **a past month recomputed twice returns the same
numbers**, and a partner whose share changed mid-period is paid at the rate
snapshotted on each ledger row, not at today's rate. That property is already
designed into the ledger; A4's job is not to lose it.

Pricing writes validate against `Plan.priceFloor` (centavos, 0 = no floor) and
the "apply to existing on next cycle" checkbox writes a scheduled change rather
than mutating live subscriptions.

### A5 — Brand + domains + sender identity

```
[MODIFY] (platform)/partner/brand/page.tsx        + live preview, contrast check
[NEW]    components/partner/BrandPreview.tsx (client), DomainList.tsx
[NEW]    (platform)/partner/domains/page.tsx
[NEW]    server/partners/domains.ts               reuses server/domains/provider.ts
[MODIFY] packages/core/src/branding/config.ts     + senderName, replyTo, smsSenderName
[NEW]    lib/partners/contrast.ts + test          WCAG ratio — PURE
```

Reuses the existing `DomainProvider` abstraction rather than calling Vercel
directly, so the stub path the brief asks about already exists. New env: the
per-product Vercel project id, added to `turbo.json` (strict env mode strips
anything undeclared — this has bitten twice).

### A6 — Team + settings + digest + checklist

```
[NEW] (platform)/partner/team/page.tsx, settings/page.tsx
[NEW] components/partner/InviteForm.tsx, TeamTable.tsx, NotificationPrefs.tsx,
      PayoutDetailsForm.tsx, AgreementCard.tsx
[NEW] server/partners/team-actions.ts, settings-actions.ts
[NEW] packages/db/src/digest.ts          composeDigest() — PURE over a data bundle
[NEW] app/api/cron/partner-digest/route.ts   07:00 Asia/Manila
[NEW] tests/partners/digest.test.ts, tests/isolation/team.test.ts
```

Payout details reuse `lib/crypto/secrets.ts` (the existing envelope encryption)
and are **displayed masked and never prefilled**. Note this inherits the
`CREDENTIALS_ENCRYPTION_KEY` dependency — unset today, so A6 must fail closed
with a clear message rather than storing plaintext.

Permissions are enforced **in RLS and in the UI**, and the brief is right that
the UI must hide rather than disable: a disabled Revenue tab still tells a
`sales` user what they are missing and invites a URL guess. The RLS is what makes
the guess fail.

---

## 3. What I would change about the brief

Three things, stated once:

1. **§7 Team is a prerequisite, not a finale.** Every phase's RLS references a
   partner role that does not exist yet. Moving the `partner_users` table into
   A1 is the difference between writing the policies once and writing them twice.
2. **§4's PDF should not block A4.** Print CSS ships now; a headless renderer is
   a dependency decision worth making on its own.
3. **"Log in as merchant" deserves its own review.** It is the one feature here
   that lets one tenant into another tenant's data by design. I have scoped it
   inside A2, but I would rather build it last, after the isolation suite is
   dense enough to catch a mistake in it.

---

## Halting for approval

I need:

- **0.1** — build in `apps/servd/.../partner` (recommended) or extract `apps/partner`?
- **0.4** — partner users in **A1** (recommended) or keep them in A6?
- **0.5** — statements derived + print-CSS PDF (recommended), or block on a real PDF renderer?
- **0.7a** — milestones as a `{month, target}` ladder defaulting to 10/25/50 at months 1/3/6?
- **0.7c** — default domain `{slug}.canvexia.com`, marked *planned* until DNS exists?

`[BOOKING_URL]` is filled: `https://calendar.app.google/CnFH1CSDhdkuh8476`.

Nothing will be written until A1 is approved, and A2 will not start until A1's
isolation tests pass against a real database.
