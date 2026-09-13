# CANVEXIA — Decision record

Settled decisions and the reasoning behind them. One entry per decision; append,
don't rewrite. `implementation_plan.md` holds the plan these feed into; the open
questions still live there.

Status key: **Settled** · **Open** · **Superseded**

---

## D1 — Revenue split: partner 70 / CANVEXIA 30

**Settled.**

Of merchant subscription revenue. Stored per partner rather than as a platform
constant, because D2 makes it vary by partner from day one.

---

## D2 — The 70/30 split applies to new partners only

**Settled.**

The partner program that exists today is contractually zero-cut. That is not an
oversight — a commission system was built and then deliberately removed, and the
code still says so at `apps/servd/src/server/partners/portal.ts`:

> "Servd never sees it and never takes a cut, so there is nothing to accrue and
> nothing to pay out."

`Partner.payoutMethod`, `payoutDetailsEnc` and `taxInfoEnc` survive as tombstones
(`schema.prisma:1172-1177`), and `ProgramSetting` was stripped to a single
training-video URL for the same reason.

Existing approved partners keep those terms. So:

- `Partner` is migrated **in place**. No parallel `Operator` entity, no
  double-write transition.
- The split is a per-partner column, grandfathered to 0 for existing rows.
- `Partner.tier` (`schema.prisma:1171`) becomes the discriminator. It already
  carries a legacy value — `"affiliate" survives only on old rows` — so a new
  `operator` tier fits the column's existing meaning rather than bending it.

This mirrors `POWERED_BY_SINCE` in `src/lib/branding/powered-by.ts`, which
grandfathers restaurants that were trading before the "Powered by Servd" badge
existed. That file also states the principle this decision rests on: quietly
changing the terms an existing paying customer signed up under is not a thing to
spring on them after the fact.

**Consequence accepted:** the grandfather attaches to the *partner*, not to a
merchant cohort. A legacy partner earns CANVEXIA nothing on merchants they sign
in future, indefinitely. Cheap to bound now (legacy terms cover merchants signed
before date X), expensive to renegotiate later. Flagged, not yet decided.

**Implementation guard:** a 0% default is correct for legacy rows and
catastrophic for new ones — a partner created without the field set earns
CANVEXIA nothing, silently, forever. An `operator`-tier partner is therefore
invalid at 0%, enforced in code and asserted by test. The column ships as
`@default(dbgenerated("0"))`, not a plain Prisma default, per the reasoning at
`schema.prisma:538-548`: a plain default is emitted into every INSERT and breaks
creates on a database that has not yet run the hand-run SQL.

---

## D3 — Billing provider: Xendit

**Settled**, with known cost.

`PlatformSetting.billingProvider` already accepts `"xendit"`, there is a real
implementation at `src/server/billing/xendit.ts`, and a super-admin credentials
form. Selecting it is a config change. Living with it is not:

1. **No off-session charging.** `xendit.ts:68-72` — `chargeSavedCard()` is a
   deliberate no-op returning `pending`. The header comment names the gap:
   off-session charging needs Xendit's recurring / payment-methods API.
2. **So every renewal is manual.** No `paymentMethodId` is ever captured, so
   `hasSavedCard` (`run-cron.ts:55`) is always false, so the cron issues a hosted
   invoice and sets the merchant `past_due` every cycle (`run-cron.ts:121-129`).
3. **And non-payment never escalates.** `failedCharges` is incremented in exactly
   one place — `run-cron.ts:156`, the charge-*failure* branch — which the
   `canCharge` guard at `run-cron.ts:119` makes unreachable under Xendit. It
   stays 0, so the `failedCharges >= MAX_FAILED_CHARGES` suspension arm in
   `lifecycle.ts` never fires. **A merchant can sit in `past_due` indefinitely
   while still using the product.**

Point 3 undercuts the platform's own answer to revenue leakage, which assumes the
plan state machine suspends non-payers. It does — on the PayMongo path only.

**Therefore:** Phase 4b adds an invoice-age suspension arm so escalation does not
depend on `failedCharges`. Implementing Xendit's recurring API is recommended,
scheduled, and not a blocker.

---

## D4 — Each partner has their own Xendit account

**Settled in principle. Money flow superseded by D5 — read that first.**

The principle holds: a merchant pays into *their partner's* account, under the
partner's own brand, and CANVEXIA never holds the merchant's money.

What has changed since this was written is how the account exists and how
CANVEXIA is paid. D5 settled on **Option B**: the account is a sub-account
beneath CANVEXIA's Xendit platform rather than one the partner brings, and the
30% comes off **at settlement** rather than being invoiced in arrears. So the
"invoices its 30% after the fact" line below is no longer the plan, and `Partner`
stores a sub-account id rather than encrypted credentials.

The three breakages this entry identified are unaffected — they follow from there
being N gateway identities instead of one, which is true under either option, and
they remain Phase 4a's scope.

Merchants pay into the partner's own account, under the partner's own brand.
~~CANVEXIA never holds the money and invoices its 30% after the fact.~~

The pattern already exists one level down: Servd runs connected accounts for
*diner* payments via `Restaurant.paymentGateway` + `paymentCredentialsEnc`
(`schema.prisma:560-561`), AES-256-GCM through `src/lib/crypto/secrets.ts`. And
`PlatformSetting.xenditCredsEnc` already stores the exact credential shape a
partner needs — `{ secretKey, callbackToken }`. Partner-level Xendit is the same
helper and the same shape, moved onto `Partner`.

Three things break, all in Phase 4a:

1. `getBillingProvider()` is a process-wide singleton resolved from the single
   `PlatformSetting` row. It becomes `getBillingProviderForPartner(partnerId)`.
2. The billing webhook cannot tell partners apart. Xendit authenticates with
   `x-callback-token`, which is per-account, so the route cannot know whose event
   it is before verifying, and trying each token in turn is both O(N) and a
   timing oracle. It needs a per-partner URL — the pattern already exists at
   `/api/webhooks/delivery/[restaurantId]/`.
3. **Security:** `activateByProviderRef()` settles an invoice by gateway ref
   alone. Safe when every ref came from one trusted account; not safe when refs
   are minted by N different accounts with different trust boundaries. Every
   `*ByProviderRef` lookup must be partner-scoped, or one partner's webhook can
   settle another's invoice.

---

## D5 — Xendit account topology: **Option B**, CANVEXIA as the platform

**Decided, contingent.** The direction is settled; two facts it rests on are not
yet confirmed with Xendit.

Partners onboard as **sub-accounts beneath CANVEXIA's own Xendit platform
relationship**. A merchant's payment settles to their partner, and CANVEXIA's 30%
comes off at settlement rather than being invoiced in arrears.

Chosen over Option A (each partner connecting a standalone account, CANVEXIA
invoicing the 30% afterwards) for one reason that outweighs the rest: **it
removes the collection risk entirely.** Under A, CANVEXIA earns its share the
moment a merchant pays and then has to go and collect it from a partner whose own
collection tooling is weak — D3 means their merchants are paying manual invoices
with no auto-charge and no auto-suspension. Two layers of collection risk stacked
on revenue already earned. Under B there is nothing to collect.

**What it costs:** partner onboarding gets heavier. A partner cannot simply
connect an account they already have — they are KYC'd through CANVEXIA, and how
long that takes is Xendit's answer, not ours.

### Still contingent — confirm before Phase 4a's schema lands

1. **That Xendit offers this at all** for a PH company at CANVEXIA's stage, with
   a percentage platform fee that can differ per sub-account (legacy partners sit
   at 0%, operators at 70% — see D2).
2. **That recurring / card-on-file charging works inside it.** D3 is already a
   live problem: `chargeSavedCard()` is a no-op, so every merchant pays a manual
   invoice every month and non-payment never escalates. If tokenised recurring
   turns out to work only on standalone accounts, that is a genuine argument back
   towards Option A and should reopen this decision rather than be worked around.

`docs/canvexia/xendit-questions.md` carries the full list to put to them.

### Build consequence

`Partner` stores a **sub-account id**, not encrypted credentials — the platform
key in `PlatformSetting.xenditCredsEnc` stays the only secret, and API calls name
the sub-account they act for. How that naming works is the one mechanism nobody
here has verified, so it is isolated behind a single seam in the provider rather
than spread through the billing code: if Xendit's answer differs, one file
changes.

Everything else in Phase 4a holds under **either** option and is not blocked:
`getBillingProviderForPartner()`, per-partner webhook routing, partner-scoping
every `*ByProviderRef` lookup (the security fix from D4), and the invoice-age
suspension arm from D3.

---

## D6 — Monorepo layout

**Settled.** pnpm + Turborepo. `apps/servd`, `packages/{core,ui,db}`. Done.

The other verticals (`jobanica/laundry`, `jobanica/Pharmacy`,
`jobanica/print-new`) are separate repositories sharing no code with Servd.
Whether they move in here is Q7, still open.

---

## D7 — RLS tenant table list is derived from the catalogue

**Settled.** Implemented in Phase 0.

`prisma/rls.sql` used a hand-written array of 43 table names. It had drifted:
**13 tables holding real tenant data had no policy at all** — `audit_logs`,
`reservations`, `gift_cards`, `gift_card_txns`, `cash_movements`,
`delivery_settings`, `delivery_bookings`, `cart_leads`, `happy_hours`,
`shift_notes`, `push_subscriptions`, `menu_item_variants`, `menu_item_servings`.

Nothing was leaking them. Every read already goes through `tenantDb()` or
`systemDb()` — only `src/server/tenancy/scoped-db.ts` imports the unscoped Prisma
client. But the second layer of isolation, the one meant to hold when the
application forgets a where clause, was simply absent on those tables.

The list now comes from `information_schema`, with an explicit exclusion array
for the five tables that carry `restaurantId` without being tenant-owned
(`platform_feedback`, `crm_clients`, `customer_events`, `email_messages`,
`email_sends`). The first three previously had no policy and are now super-admin
only; all three are `systemDb`-only in application code, so this locks out no
caller that exists.

`scripts/schema-drift.mjs` now also reports coverage gaps, so drift is visible
rather than discovered.

---

## D8 — The partner axis reaches through `restaurants`, not a denormalised column

**Settled** for Phase 1; revisited in Phase 4a. Answers Q6.

The brief specified a `partner_id` on every tenant table. Measured instead —
50 partners / 2,000 restaurants / 200,000 orders, full method and numbers in
`docs/canvexia/rls-partner-spike.md`:

| Query | Join through `restaurants` | Denormalised column | Ratio |
|---|---|---|---|
| merchant list | 0.75 ms | same | — |
| merchant drill-down | 0.12 ms | same | — |
| order count (no predicate) | 486 ms | 97 ms | 5.0× |
| revenue rollup, 30 days | 763 ms | 101 ms | 7.6× |

Selective queries are free under the join — the planner narrows by index first
and evaluates the policy against a handful of rows. Unfiltered aggregates pay the
semi-join per row, and those two are the partner dashboard's headline number and
the statement job.

**Phase 1 ships the join regardless**, because nothing runs those queries yet,
because partner reassignment (Phase 2) is the operation that makes a denormalised
copy disagree with its source, and because isolation is identical either way —
this is read speed on callers that do not exist.

`orders."partnerId"` is scheduled for Phase 4a alongside the statement job, and
carries a hard requirement: reassignment must rewrite it, with a test asserting
no order is left pointing at the previous partner. A stale denormalised owner is
a cross-partner leak, which is strictly worse than a slow dashboard.

**Cost of the chosen design so far:** one column, one index, one backfill script.

---

## D9 — `packages/core` is consumed as TypeScript source

**Settled.**

`@servd/core` publishes `src/index.ts` directly; the app lists it as
`workspace:*` and Next is told `transpilePackages: ["@servd/core"]`. No build
step sits between editing the package and running the app.

Wired into a real caller in Phase 1 rather than left as a stub —
`src/server/tenancy/scoped-db.ts` imports the GUC names from it. A shared package
nothing imports is a package whose wiring is untested, and Phase 6 is the worst
possible moment to discover the resolution does not work. Verified through
typecheck, the full vitest suite, and a production `next build`.

---

## D10 — Price floors default to zero, and HQ raises them deliberately

**Settled.** Phase 2.

`Plan.priceFloor` ships at 0, meaning "no floor". A floor applied retroactively
would make prices that are already being charged invalid under the platform's own
rule, and the first anyone would know is a plan edit refusing to save over a
number they had not touched.

Both directions are checked, because people get both wrong:
`validatePriceAgainstFloor` (a partner pricing under HQ's floor, used from
Phase 3) and `validateFloorAgainstPrice` (HQ raising a floor above the plan's own
price, used now). A free plan is allowed under any floor — giving something away
is not undercutting.

The rule lives in `src/lib/billing/price-floor.ts` and is pure, so the partner
portal picks up the same one rather than growing a second implementation with a
different rounding habit.

---

## D11 — Reassignment: approved targets only, never unassignment

**Settled.** Phase 2. The rule is in `src/lib/partners/reassign.ts`.

- **Target must be `approved`.** Moving a merchant onto a suspended partner hands
  it to someone who cannot sign in to support it, and the merchant would be the
  one to find out.
- **Blank target is rejected, not treated as unassignment.** Clearing `partnerId`
  makes a merchant invisible to every partner scope and absent from every
  statement. If that is ever wanted it needs its own deliberate action.
- **Repeating a move is a no-op, not an error.** Double-submits and re-run bulk
  moves both land there.
- **The audit row names the incoming partner only.** The outgoing partner has
  just lost access to that merchant entirely; a row naming a merchant they can no
  longer read is a worse answer than asking HQ, who sees the whole trail.

The update and the audit row are one transaction. A merchant half-reassigned is
worse than one not reassigned, because the next person to look cannot tell which
happened.

**D8 lands here.** `src/server/partners/reassign.ts` carries the marked extension
point where a future `orders."partnerId"` must be rewritten. A copy left pointing
at the previous partner is not a stale dashboard — the policy on that table reads
the copy, so the previous partner keeps reading those rows, with an audit trail
saying the move succeeded.

---

## D12 — The product registry is code, not a table

**Settled.** Phase 2.

`/super-admin/products` renders `packages/core/src/products/registry.ts` and has
no editor. A product exists once something can provision a merchant into it, and
that is an adapter someone writes, not a row someone inserts. An editable
registry would let HQ list a product the platform cannot create an account in,
and the partner who tried would be the one to find out.

**Deferred with it (Phase 2):** platform analytics (the plan listed it for Phase 2).
`/super-admin` already has analytics, bizops and funnel screens, and there is no
partner-shaped number worth adding until statements exist in Phase 4. And
per-partner plan pricing, which needs the portal (Phase 3) to write it — the
floor lands now and is enforced against `Plan.priceMonthly`.

---

## D13 — `demoPartnerId` is provenance; `partnerId` is ownership

**Settled.** Phase 3. This distinction is a security rule, not a naming
preference, and two live bugs came from not having it written down.

- **`demoPartnerId`** — who *built* a storefront. Set once at creation, never
  changes, useful for attribution. **Never an authorisation check.**
- **`partnerId`** — who *owns* it. Moves when HQ reassigns (Phase 2). The only
  thing any permission check, portal query or statement may read.

### Bug 1 — the Phase 1 backfill gave partner merchants to HQ

`provisionDemo` set `demoPartnerId` and never `partnerId`, so every restaurant
any partner had ever created had `partnerId IS NULL`. The Phase 1 backfill swept
every NULL to the house partner, which would have handed every partner's book of
business to CANVEXIA Davao — invisible to the partner under the Phase 1 policies,
and paid to HQ under Phase 4 statements.

Reproduced side by side on a scratch database before fixing: the Phase 1 script
put a partner-built storefront under CANVEXIA Davao; the fixed one leaves it with
its partner. The backfill now claims by creator first and sweeps to the house
second, and `provisionDemo` sets both columns at creation.

### Bug 2 — reassignment left the previous partner in control

`deletePartnerDemo`, `ownDemo` and the demo queries all gated on
`demoPartnerId`. Phase 2 added reassignment, which moves `partnerId` and leaves
`demoPartnerId` naming the original builder — so after a merchant moved from A to
B, **A could still edit and delete it**. Every ownership check now reads
`partnerId`. HQ's per-partner account counts moved too, since counting by builder
would credit a partner for merchants they no longer own or get paid for.

---

## D14 — The partner portal reads through `partnerDb`, and `partners` has a policy

**Settled.** Phase 3.

`getPartnerDashboard` read through `systemDb()`, which sets
`app.is_super_admin` and switches every tenant policy off. Its isolation was one
`where` clause; losing that clause in any future refactor meant a partner reading
every merchant on the platform. It now reads through `partnerDb()`.

**The `where` clause stays anyway.** If `prisma/rls.sql` has not been run on a
database, `partnerDb` sets a session variable no policy reads, and the query
would return everything. Migration lag is a real state in this repo. RLS is the
guarantee; the clause is what holds while a database catches up.

**`partners` gained `partner_self`.** The table has no `restaurantId`, so the
catalogue loop never reached it and it carried no policy at all. Survivable while
every caller went through `systemDb` — HQ screens, login, the public application
form, all of which still do. Not survivable once the portal started *writing*
there under `partnerDb` for brand settings. A partner may now read and update
only its own row; inserts stay with the system, because a new partner row comes
from the public application form.

**Deferred from Phase 3, with reasons:** partner staff management (`Partner` has
a single `authUserId`; real staff needs a `PartnerStaff` table with its own
invite and role model — a schema and auth change, not a screen), the statements
view (the ledger it reads does not exist until Phase 4, so it would render zero
rows by construction), and partner custom domains (`src/server/domains/*` already
provisions them, but host → *partner* resolution is Phase 5 — wiring the button
first would ship a setting that silently does nothing).

---

## D15 — Every successful recurring payment is recorded against the partner in CANVEXIA

**Settled.** Shapes Phase 4c.

A merchant's successful recurring payment is recorded on the CANVEXIA platform,
against the partner that owns that merchant. The platform's ledger — not a
partner's own bookkeeping, and not a number a partner types in — is the record of
what was collected.

**"Recorded in CANVEXIA" is not "paid into CANVEXIA."** Under D5 (Option B) the
money settles into the partner's sub-account and CANVEXIA's 30% is taken at
settlement. CANVEXIA never holds the merchant's payment. What it holds is the
*record* of it. Worth stating plainly because the two readings of that sentence
lead to completely different builds, and only one of them is what was decided.

**"Successful" means settled, not issued.** An invoice going out is not revenue;
a webhook saying it was paid is. The ledger records settlement events, and
statements compute from those — which is what makes a statement the same number
whether you ask the platform or the gateway. Recording issuance instead would
produce statements that look right and bill for money nobody received, and D3
makes that failure likely rather than theoretical: on Xendit every merchant is
issued an invoice every month whether or not they pay it.

**Consequences for Phase 4:**

- The ledger learns about payments from the **webhook**, so webhook identity is
  load-bearing, not a detail. Which sub-account an event belongs to has to be
  unambiguous — see `xendit-questions.md` §3.3, where it is also the security
  question behind partner-scoping `activateByProviderRef()`.
- Ledger rows are **immutable events**, and a refund is another event rather than
  an edit to the first. Statements are then reproducible for any past month
  instead of drifting as corrections land (xendit-questions.md §4.2 asks whether
  a refund reverses the platform fee automatically; if it does not, the reversal
  is ours to model).
- A partner cannot write to it. This is the answer to revenue leakage in the
  original brief: the statement is computed from what the gateway told us, so
  under-reporting is not a thing a partner can do.
