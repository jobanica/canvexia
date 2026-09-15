# CANVEXIA HQ Admin — Phase A (H1–H7)

Mode C plan. **Nothing is written yet.** Section 0 is the part to read first:
eleven premises in the brief do not hold against this repository, and five of
them change *what* gets built rather than how.

The previous occupant of this filename — the partner-portal Phase A plan, now
shipped as A1–A6 — is archived at `docs/canvexia/partner-portal-plan.md`.
Traced before writing: `system_architecture.md`, the archived plan,
`packages/core`, `packages/db/prisma/{schema.prisma,rls.sql,manual/}`,
all 32 `/super-admin` routes, all 19 `apps/servd/src/server/partners/*`
modules, and the live database and Vercel projects.

---

## 0. Blocking — what the brief assumes vs. what is here

### 0.1 `apps/hq` does not exist. Neither does `apps/partner`.

CANVEXIA's internal console today is **`/super-admin` inside `apps/servd`** —
32 pages, gated by `requireSuperAdminPage()` and an `owner`/`ops` split in
`src/lib/platform/admin-scope.ts`. It is not, however, one console: it mixes
two different jobs.

| Job | Screens today |
|---|---|
| **CANVEXIA HQ** — across partners and products | `partners`, `merchants`, `plans`, `products`, `invoices`, `payments`, `announcements`, `feature-pricing` |
| **Servd's own back office** — one product's ops | `content-engine/*` (6), `storefronts`, `crm`, `outreach`, `prospecting`, `funnel`, `email`, `bizops/*` (5), `tutorials`, `feedback`, `accounts`, `subscriptions` |

The brief is right that these are two consoles. It is wrong that the second one
is a new Next app.

**A new app is a second Next process** — its own Prisma client, its own Supabase
SSR cookie handling, its own middleware, its own Vercel project, its own
deployment, its own `NEXT_PUBLIC_*` build-time inlining, and its own copy of
every `@/server/*` import that the HQ screens need (`reassignMerchant`,
`getMerchantDirectory`, `freezeStatement`, the scope wrappers, the audit
helper). Those modules live in `apps/servd/src/server` and cannot be imported
across apps; moving them to `packages/db` is a real migration in its own right.
This is exactly the cost D36 was written about.

**Recommendation: a new route group `apps/servd/src/app/(platform)/hq`,**
CANVEXIA-branded, sharing the Prisma client, the RLS wrappers and the
`platform_admins` identity. The eight HQ screens above **move** to `/hq` and
their old paths become permanent redirects — moved, not duplicated, because two
screens that both edit plan floors is how the floors end up disagreeing. The
Servd-specific screens stay at `/super-admin`.

If you want `apps/hq` as a genuinely separate deployment, say so and I will
scope the extraction as its own phase — it is a three-day job of moving server
modules into `packages/db`, not a line in H1. **Everything below assumes the
route group.** Swapping is a path change, not a redesign.

### 0.2 There is no `core` schema

Every table named `core.x` in the brief is an unprefixed table in `public`.
`packages/core` is pure TypeScript with **no database access at all**, by
design. The mapping:

| Brief | Reality |
|---|---|
| `core.partners` | `partners` ✅ exists |
| `core.territories` | `territories` ✅ exists, **143 rows** |
| `core.partner_waitlist` | `partner_waitlist` ✅ exists, **0 rows** |
| `core.audit_log` | `audit_logs` ✅ exists |
| `core.ledger_events` | `partner_ledger_entries` ✅ exists, **0 rows** |
| `core.territory_assignments` | ❌ does not exist |
| feature flags | ❌ does not exist |
| adjustments | ❌ does not exist |
| HQ announcements | ⚠️ `announcements` exists but is **merchant**-targeted (`announcement_reads.staffUserId`); it has no partner arm |

### 0.3 There is no HQ login at all

`platform_admins` has **zero rows** — checked, not assumed. Nobody can currently
sign into `/super-admin` on this database. So H1 cannot start with "invite an
HQ user", because there is no one to send the invite. It needs a **bootstrap**:
a one-off SQL insert binding a named Supabase auth user to an
`hq_super_admin` row, run by hand like every other migration here.

Related: `platform_admins.role` is `NULL | "ops"`, where NULL means owner. The
brief's `hq_super_admin` / `hq_ops` map onto that cleanly, and I would **keep
NULL meaning super admin** rather than backfill — the same reasoning that is
already written on the column.

### 0.4 The territory map has no coordinates

> *"Map view using the coordinates already in the seed"*

There are none. `packages/db/prisma/territories.mjs` is `[name, province,
region]` and nothing else; `territories` has ten columns and no `lat`/`lng`.
143 cities with no coordinates is not "leave null where unknown" — it is a map
with nothing on it.

Three honest options, and I want your pick:

1. **Drop the map from Phase A.** Territories get a filterable table and a
   region grouping. Cheapest, and loses nothing you cannot see in a list.
2. **Add the columns, geocode the 143 seed cities once** from a public dataset,
   commit the result as seed data. Half a day, and it is real data.
3. **Add the columns, leave them null, HQ types coordinates in.** An empty map
   that fills up over a year nobody will spend.

**I recommend (1) for Phase A and (2) as a follow-up**, because a map is a
nice-to-have and an unpopulated one is worse than the table it replaced.

### 0.5 Territories cannot be assigned, split, or merged yet

`territories` has no `partnerId`, no `parentId`, and no assignment history.
`partners.territory` is **free text** — "Davao", "Tagum City" — with no foreign
key to the 143 rows. So §2 of the brief is not CRUD over an existing
relationship; the relationship does not exist. H3 has to create it *and*
reconcile the two live partners' free-text values onto real territory rows
without losing what is there.

### 0.6 The statement job exists but has never run

`freezeStatement` and `/api/cron/freeze-statements` are built, tested and
scheduled (`0 1 1 * *`). But **`CRON_SECRET` is not set on the Vercel
project** — checked against the live env list — so every firing has returned
`401 Unauthorized`. `partner_statements` has 0 rows, and `partner_ledger_entries`
has 0 rows, so there would be nothing to freeze anyway.

H6 therefore starts by setting `CRON_SECRET` and proving one run, before any
"last run / next run" panel can tell the truth. I will also add a
`cron_runs` record so the panel reads a fact rather than inferring from the
newest statement's `frozenAt`.

### 0.7 Email cannot send, so convert-to-partner cannot email

`CREDENTIALS_ENCRYPTION_KEY` is **not set** on the project. `encryptJson` is
what stores the Resend credentials, so email is not merely unconfigured — it
cannot be configured. The welcome email in §3 of the brief is blocked on one
environment variable, exactly as the partner digest was in A6.

H3 will build the conversion transaction and **queue** the welcome email through
the existing `partner_notifications` path, so it sends the moment the key
exists, and show HQ "welcome email not sent — email is not configured" rather
than a silent no-op.

### 0.8 The house partner exists but nothing says so

`CANVEXIA Davao` is a real row (`da4357c2-…`, approved, operator, 70%,
`territory: "Davao"`). But it is an ordinary partner row: nothing marks it as
the house account, so H4's "reassign to house partner" and "flag as national
account" have no target to resolve. H1 adds `partners.isHouse` (boolean,
default false, partial-unique so there can be only one) and sets it on that row.

`referral_partner_id` for the national-account referral fee does not exist
either — H4 adds it, and the statement line it implies is **H6's** work, not
H4's, or the column lands with nothing reading it.

### 0.9 "View as partner" has no mechanism anywhere

No impersonation exists in this repository. The partner portal has a
`merchants.impersonate` capability and a screen that deliberately says the flow
is not built — *"half an impersonation flow is a security hole with a
spinner."* That judgement still stands, so the plan specifies the mechanism
rather than assuming one:

- A **signed, single-use, 30-minute token** (HMAC over
  `{hqAdminId, partnerId, exp, nonce}`), stored in an `impersonation_grants`
  row so it can be revoked and so the audit log has something to point at.
- Redeeming it sets a **separate cookie** from the partner session and yields a
  **read-only** partner context: the scope wrapper runs with the partner GUC,
  and every partner server action refuses when the impersonation cookie is
  present. Read-only is enforced at the action, not by hiding buttons.
- No Supabase role escalation, no sharing of the partner's session, no way for
  the grant to outlive its `exp` even if the cookie is kept.
- Banner on every page; `hq.impersonation.start` and `.end` audit rows with the
  real duration.

This is the single most dangerous thing in the brief. If you would rather ship
H1–H7 without it, the rest of the plan is unaffected — say the word.

### 0.10 `admin.canvexia.app` is not a domain this project owns

Nothing is registered: `canvexia.com`, `servdph.net` and `resceta.com` are all
NXDOMAIN (see `docs/canvexia/domains.md`). The partner root is `canvexia.**com**`,
not `.app`; `.app` appears only in comments about a future
`{slug}.canvexia.app`. Meanwhile `parseHost` **already** resolves
`admin.canvexia.com` to `platform`, so `/hq` would be reachable there the day
the domain is bought, with no code change.

Phase A therefore builds `/hq` at the path, reachable at
`https://canvexia-two.vercel.app/hq`, and the domain flip joins the two-step
list already in `domains.md`. I will not write a third unregistered hostname
into the codebase as though it resolved.

### 0.11 Small things that still need an answer

- **`writeAudit()` cannot write an HQ row.** It takes `restaurantId` as a
  required argument and sets neither `partnerId` nor `actorType`, which is why
  six partner modules bypass it with raw `tx.auditLog.create`. H1 widens the
  helper and moves those six onto it — otherwise "every mutation → audit_log"
  is a convention enforced by remembering.
- **No login is rate-limited or logged.** Neither `/partner/login` nor
  `/super-admin`. The brief asks for it on HQ; `hitRateLimitIn` already exists
  in `packages/db` and is used by the public lead form, so this is small.
- **Six existing isolation suites cannot observe RLS** — they never switch off
  the `postgres` role, which carries `BYPASSRLS` (`system_architecture.md` §6).
  H1's cross-partner tests must follow the A1 pattern (`set_config('role',
  'app_user')`), not the older one.
- **Postgres is unreachable from this sandbox** (HTTPS only). DB-backed suites
  skip here; H1's gate will be proved as SQL over the Supabase Management API,
  the same substitute used for A1 and A3. That is a substitute for running the
  suite, not the same thing.
- **The console will render zeros.** 0 restaurants, 0 ledger rows, 0 statements,
  0 waitlist entries, 2 partners, 1 pharmacy. Every stat card, MoM figure and
  12-month chart in §1 has nothing to draw. This is not a blocker but it does
  mean empty states are the *main* state to design, and that I cannot verify a
  number against a real one.

---

## 1. The non-negotiables

Applied to every sub-phase, not re-argued in each.

1. **RLS before screens.** A table added in H1 gets its policy in the same
   migration. `rls.sql`'s backstop sweep (D27) locks any policy-less table to
   super-admin on sight, so the failure mode is "HQ-only", not "world-readable"
   — but relying on the backstop is how a table ends up unreadable by the app
   that needs it.
2. **HQ reads through `systemDb`, and that is the point.** `/hq` is the one
   place that legitimately crosses partners. Every other context must not, so
   each new HQ module states in its header why it is allowed to.
3. **Every mutation writes an audit row in the same transaction.** Via the
   widened `writeAudit()`, with `actorType: "hq"`, the actor's email, and
   before/after.
4. **Typed confirmation for anything destructive or money-affecting.** The
   partner's exact name, or the exact amount. Server-side re-check, not a
   client-side `confirm()`.
5. **`hq_ops` is enforced at the action, not the layout.** The layout hides;
   `requireHqAction(capability)` refuses. A server action is reachable by its id
   from any page.
6. **No secret is ever displayed.** Payout details stay masked in HQ exactly as
   they are in the portal; demo-account *credentials references* are stored, the
   credentials are not.

---

## 2. Sub-phases

### H1 — Roles, tables, RLS, audit, and the identity everything else needs

No screens. This is the phase the brief says must pass before H2.

**[MODIFY]**
- `packages/core/src/identity/roles.ts` — add `hq_super_admin`, `hq_ops` to
  `ROLES`; `HQ_USER_ROLES = ["super_admin", "ops"]`; keep `hq_admin` as a legacy
  synonym exactly as `partner_staff` is kept.
- `packages/core/src/identity/permissions.ts` — a second matrix,
  `HQ_CAPABILITIES`: `partners.read/write/suspend`, `territories.write`,
  `applications.write`, `merchants.reassign`, `plans.floor`, `billing.run`,
  `billing.adjust`, `hq.team`, `hq.impersonate`, `announcements.write`.
  `hq_ops` gets everything except `partners.suspend`, `plans.floor`,
  `billing.adjust`, `hq.team` — the brief's four exclusions, named.
- `apps/servd/src/lib/platform/admin-scope.ts` — `AdminRole` gains the `/hq`
  prefixes; NULL still means super admin.
- `apps/servd/src/server/audit/log.ts` — `restaurantId` becomes optional;
  `partnerId` and `actorType` become fields; a new `writeHqAudit()` wrapper.
- Six partner modules (`team`, `prospects`, `revenue`, `lead-form`,
  `pharmacies`, `reassign`) move from raw `auditLog.create` onto the helper.

**[NEW]**
- `packages/db/prisma/manual/add-hq-admin.sql` — idempotent, `REVOKE ALL … FROM
  anon, authenticated`, and RLS for each new table:
  - `territory_assignments` (territoryId, partnerId, assignedAt, releasedAt,
    reason, actorEmail) — history, append-only.
  - `territories`: `+ partnerId`, `+ parentId`, `+ assignable` (a split parent
    becomes false).
  - `partners`: `+ isHouse`, `+ referralPartnerId`, `+ legalName`,
    `+ businessName`, `+ tin`, `+ address`, `+ agreementPath`,
    `+ licenseFeePaidCentavos`, `+ licenseFeePaidAt`, `+ licenseFeeRef`,
    `+ enabledProducts` (Json). Every one nullable or DB-defaulted — the table
    has live rows.
  - `feature_flags` (productId, key, enabled, **partnerId nullable**) — the
    column the brief asks for so per-partner flags are not a later migration.
  - `ledger_adjustments` → written as `partner_ledger_entries` rows with
    `kind IN ('credit','debit','refund','waiver')` plus a nullable
    `adjustmentReason` and `actorEmail`. **Not a second table**: the ledger is
    already append-only and immutable, and a parallel adjustments table is how
    a statement and its explanation drift apart.
  - `hq_announcements` + `hq_announcement_reads` (per **partner**, not per staff
    user), `segment` Json, `scheduledFor`.
  - `impersonation_grants` (see 0.9).
  - `cron_runs` (job, startedAt, finishedAt, ok, detail).
- `packages/db/prisma/manual/bootstrap-hq-admin.sql` — the one-off from 0.3,
  with the auth user id as the only thing to fill in.
- `apps/servd/src/server/hq/auth.ts` — `requireHqPage()`,
  `requireHqPage(capability)`, `requireHqAction(capability)`, plus login rate
  limiting and an `hq.login` audit row.
- `apps/servd/tests/isolation/hq-scope.test.ts` — the gate.

**Migration order:** `add-hq-admin.sql` → `db:rls` → `bootstrap-hq-admin.sql`.

**Verification (the H1 gate — all must pass before H2):**
1. `app_user` + partner A's GUC cannot read partner B's `territory_assignments`.
2. …nor `ledger_adjustments` rows belonging to B.
3. …nor any `hq_announcements` row not targeted at A.
4. An HQ context (`app.is_super_admin`) reads all of the above.
5. `anon` and `authenticated` get `42501` on every new table.
6. `hq_ops` is refused by `requireHqAction("billing.adjust")` and by the four
   other excluded capabilities.
7. `writeAudit()` writes a partner-scoped row with no `restaurantId`, and the
   six migrated modules still write what they wrote before (snapshot test).
8. The backstop sweep leaves no new table policy-less.

`pnpm turbo run typecheck test` — and the SQL assertions run over the
Management API, since the suite skips in this sandbox.

---

### H2 — Overview + Partners

**[NEW]**
- `app/(platform)/hq/layout.tsx` — CANVEXIA chrome, reusing `PortalShell`'s
  structure and `packages/ui`'s `brand.tsx`. **Not** the partner's brand
  variables: `/hq` is always CANVEXIA coral/ember on ink.
- `app/(platform)/hq/page.tsx` — stat cards, health board, attention list,
  12-month chart.
- `app/(platform)/hq/partners/page.tsx`, `partners/[id]/page.tsx` with the six
  tabs.
- `server/hq/overview.ts`, `server/hq/partners.ts` + `partners-actions.ts`.
- `server/hq/impersonate.ts` + `app/(platform)/partner/view-as/[token]/route.ts`
  (0.9).
- `components/hq/*` — `HealthBoard`, `AttentionList`, `PartnerTabs`,
  `TypedConfirm`, `AgreementUpload`.

**[MODIFY]**
- `app/(platform)/super-admin/partners/page.tsx` → permanent redirect to
  `/hq/partners`.
- The partner portal's server actions gain the read-only impersonation refusal.

**Reused, not rebuilt:** `ladderProgress` and `parseMilestones` from
`packages/core` — the brief's "computed the same way as the partner portal" is
satisfied by calling the same function, and a second implementation is how the
two screens come to disagree about who is at risk.

**Verification:** milestone status for the two live partners matches what
`/partner` shows for the same partner, asserted in a test rather than by eye;
an `hq_ops` session sees no suspend/revoke controls **and** is refused when it
POSTs to them; an impersonation grant expires at 30 minutes and every write
during it is refused.

---

### H3 — Territories + Applications + convert-to-partner

**[NEW]**
- `app/(platform)/hq/territories/page.tsx` + `[id]/page.tsx` — CRUD, CSV
  import/export, tier-change fee prompt, split/merge, assign/release.
- `app/(platform)/hq/applications/page.tsx` + `[id]/page.tsx` — the waitlist,
  grouped by city with counts, status transitions, booking link.
- `server/hq/territories.ts`, `server/hq/applications.ts`, `server/hq/convert.ts`.
- `lib/hq/csv.ts` — parse and serialise, with a test.

**[MODIFY]**
- `packages/db/prisma/schema.prisma` — `WaitlistStatus` gains `converted`
  (the enum has `new | contacted | shortlisted | rejected` today; the brief's
  fifth value does not exist).
- `packages/db/prisma/territories.mjs` — unchanged unless you pick option (2) in
  0.4.

**The conversion is one transaction** (brief §3): `partners` row +
`partner_users` admin seat + `partner_invites` token + `territory_assignments`
row + `territories.status = taken` + audit + queued welcome email. Any failure
rolls back all of it — a half-converted applicant with a territory marked taken
and no partner to work it is the worst outcome available here.

**Also in H3:** reconcile `partners.territory` free text onto `territoryId` for
the two live rows, keeping the text column (same reasoning as
`Partner.authUserId`).

**Verification:** converting a seeded applicant produces exactly one partner,
one seat, one invite, one assignment and one audit row, and a forced failure
after the invite leaves **none** of them; a split parent is no longer
assignable; CSV round-trips 143 rows unchanged.

---

### H4 — Global merchant directory

**[MODIFY]**
- `server/partners/directory.ts` — extend `getMerchantDirectory` to the pharmacy
  axis (it is restaurant-only today) and add product/plan/status filters, orders
  30d, last login, CSV export.
- `app/(platform)/super-admin/merchants/page.tsx` → redirect to `/hq/merchants`.

**[NEW]**
- `app/(platform)/hq/merchants/page.tsx` + `[key]/page.tsx`, keyed
  `${productId}:${id}` exactly as the portal keys them (D29 — ids are unique
  only within a product).
- `server/hq/merchants.ts` — force plan change, flag as national account.
- Reuses `reassignMerchant()`, which already exists and already audits.

**Verification:** a merchant flagged national moves to the house partner with
`referralPartnerId` preserved; a reassignment writes one audit row naming both
partners; the directory's totals match a direct SQL count across both axes.

---

### H5 — Products & plans

**[NEW]**
- `app/(platform)/hq/products/page.tsx` — product registry editing, per-product
  plans, feature flags.
- `server/hq/products.ts`, `server/hq/plans.ts`.
- `packages/db/prisma/manual/add-product-settings.sql` — the registry's editable
  fields (`status`, `trainingUrl`, `demoAccountRef`, `defaultEnabled`) as a
  `product_settings` table.

**One design note.** `PRODUCTS` in `packages/core` is a compile-time constant
and the portal's product picker reads it. Making products fully database-driven
would mean the registry can name a product with no adapter, which is the exact
failure `live: false` was written to prevent. So: **the registry stays the
source of truth for `id` and `live`; the database overlays the editable fields.**
A product cannot be created from HQ — that is still a code change with an
adapter in it (`docs/canvexia/adding-a-vertical.md`).

**Verification:** raising a plan floor lists the partners currently priced below
it (from `partner_plan_prices`) and requires the typed amount; `hq_ops` is
refused; a flag toggled off is not visible to the portal within one request.

---

### H6 — Billing

**Starts with 0.6:** set `CRON_SECRET`, run the freeze once, record it.

**[NEW]**
- `app/(platform)/hq/billing/{page,statements,ledger,adjustments,costs}.tsx`.
- `server/hq/billing.ts` — preview (compute, do not freeze), run now, mark
  paid/sent, overdue sweep.
- `server/hq/adjustments.ts` — writes ledger rows, never edits them.
- `packages/db/src/statements.ts` — **[MODIFY]** teach `computeStatement` the
  adjustment kinds and the national-account referral line from 0.8.
- `packages/db/prisma/manual/add-passthrough-costs.sql` — SMS/email unit cost
  and margin, usage per partner per month.

**Overdue: 15 days** (see §4), stored in `program_settings` so it is config, not
a constant.

**Verification:** preview and freeze produce identical numbers for the same
month; a frozen statement recomputes to the same total after an adjustment lands
in a *later* month and to a different one in the same month (that is the correct
behaviour, and the test pins it); `hq_ops` cannot open the adjustment form or
POST to it.

---

### H7 — HQ team, audit views, announcements

**[NEW]**
- `app/(platform)/hq/team/page.tsx` — invite `hq_super_admin` / `hq_ops`,
  deactivate. Super admin only.
- `app/(platform)/hq/audit/page.tsx` — filters by actor, partner, entity,
  action, date; a separate impersonation view with durations.
- `app/(platform)/hq/announcements/page.tsx` — Markdown compose, segment
  targeting, schedule, read receipts.
- `server/hq/team.ts`, `server/hq/audit.ts`, `server/hq/announcements.ts`.

**[MODIFY]**
- The partner portal gains the announcement banner/inbox and the digest picks
  up published announcements (`composeDigest` already has the shape for it).
- `/super-admin/announcements` → redirect.

**Verification:** an `hq_ops` session cannot reach `/hq/team` by URL and its
invite action throws `FORBIDDEN`; a segment of "operator tier, Region XI"
resolves to the expected partner ids; a read receipt is per partner and one
admin reading does not clear it for another.

---

## 3. What I would change about the brief

1. **Drop the map from Phase A** (0.4). It is the one item with no data behind
   it.
2. **Make impersonation its own decision** (0.9). It is a security feature, not
   a screen, and it should not ride along in H2 unexamined.
3. **Adjustments are ledger rows, not a table** (H1). The brief says "history is
   never edited", and the ledger is already the thing that guarantees that.
4. **`/hq` is a route group, not an app** (0.1) — until you decide the
   extraction is worth its own phase.
5. **H6 should move before H4.** Billing is the only phase with a live failure
   in it (a cron that has never succeeded). The merchant directory is a
   read-only screen over data that is currently empty. If you want one thing
   from this plan to be true sooner, it is the statement run.

---

## 4. The three fill-ins, answered

- **Booking URL.** You gave `https://calendar.app.google/rYoC3ZLKZFvUYrfz5`.
  The live one on `canvexia-www` is `…/CnFH1CSDhdkuh8476` — a **different**
  link. I will use the new one for HQ's "Book a call", and I need to know
  whether canvexia.com's booking button should change too, or whether the two
  are deliberately separate calendars. I have changed nothing yet.
  (Google's booking pages do not accept a prefilled email via query string, so
  "prefilled if the provider supports it" resolves to: it does not. HQ will copy
  the applicant's email to the clipboard alongside the link instead of
  pretending.)
- **Overdue threshold.** 15 days, as you specified, overriding the 10 in the
  brief body. Stored as config.
- **House partner.** `CANVEXIA Davao` exists (`da4357c2-e5b0-45da-b38b-cbefc3be2ef6`,
  approved, operator, 70%). It is **not** flagged as the house account — nothing
  distinguishes it from any other partner — so H1 adds `isHouse` and sets it.
  One thing to confirm: it currently carries a 70% revenue share, which for a
  house account means CANVEXIA paying itself 70% of its own merchants. Should it
  be 100, or does the Davao territory genuinely operate as a partner?

---

## Halting for approval

Five answers unblock the whole plan:

1. **Route group `/hq` inside apps/servd, or a real `apps/hq` deployment?**
   (0.1 — I recommend the route group.)
2. **The territory map: drop, geocode, or leave empty?** (0.4 — I recommend
   drop now, geocode later.)
3. **Build "view as partner" in H2, or defer it?** (0.9)
4. **Does canvexia.com's booking link change to the new calendar too?** (§4)
5. **Should the house partner's revenue share stay 70%?** (§4)

Nothing will be written until you answer. If you say "yes to all" I will take
my recommendation on each of 1–3, change only HQ's booking link on 4, and leave
the share at 70% on 5.
