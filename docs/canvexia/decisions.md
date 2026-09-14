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

---

## D16 — Settlement carries an explicit scope

**Settled.** Phase 4a. `src/server/billing/settlement-scope.ts`.

Six handlers settled a payment by gateway reference **alone** —
`activateByProviderRef`, `markAddonPaidByProviderRef`,
`activateFeatureSubByProviderRef`, `activatePreviewByProviderRef`,
`abandonPreviewByProviderRef`, `activateBranchByProviderRef`. Sound with one
trusted gateway: possessing a reference proved it came from us. Not sound with N
sub-accounts, where a reference unique inside one account need not be unique
across them.

Every one now takes a `SettlementScope` — a tagged union, not an optional
`partnerId`, because an optional parameter is one a caller forgets and the
compiler forgives. `PLATFORM_SCOPE` has to be written out, so a reviewer can ask
why it is there.

**What it actually buys, stated honestly.** Under D5 Option B a partner never
holds a callback token — CANVEXIA holds the only credential — so this is not
mainly defence against a malicious partner. It defends against the likelier
thing: a reference collision between sub-accounts, or a webhook URL configured
against the wrong partner. Both settle the wrong merchant's invoice and neither
announces itself. Under Option A the same code would also be the defence against
malice, which is why it is built identically either way.

**The platform webhook stays live.** An earlier plan had `/api/webhooks/billing`
return 410 once the per-partner route existed. That was wrong: the URL is
configured in the gateway dashboard and is how subscriptions settle today.
Retiring it before every partner is on a sub-account and the dashboards are
reconfigured would stop live payments settling, the only symptom being customers
who paid and did not get access.

---

## D17 — Suspension no longer depends on `failedCharges`

**Settled.** Phase 4b. Closes the hole D3 identified.

`failedCharges` only rises when a saved-card charge is attempted and fails. A
gateway with no off-session charging never attempts one, so it stays 0 and the
count-based suspension arm is unreachable — a merchant could sit `past_due`
indefinitely while still using the product.

`MAX_PAST_DUE_DAYS = 14` adds a second, provider-independent arm keyed on the age
of the oldest unpaid invoice. Fourteen days is two missed weekly reminders, and
long enough that a card expiring over a holiday is not an outage.

**A second bug surfaced on the same path.** The cron created a new invoice on
*every* run for a past-due subscriber, and it runs daily — so thirty days late
meant thirty open invoices for one month of service, each with its own checkout,
and any "what do I owe" total summing all of them. It now raises one only when
nothing is outstanding.

---

## D18 — The ledger records settlements, and merchants cannot read it

**Settled.** Phase 4c. Implements D15.

`PartnerLedgerEntry`: one row per settled payment, written in the same
transaction that grants the access it paid for. A payment that granted access
without being recorded is revenue nobody can see; a row recorded for access that
rolled back is revenue nobody received.

- **`providerRef` is unique** — gateways replay webhooks as a matter of course,
  and without it a replay would credit a partner twice.
- **`sharePct` is snapshotted**, not looked up at statement time. Renegotiating a
  partner's percentage must not silently rewrite every statement already issued.
  Same reasoning as the `*AtTime` columns on orders.
- **Append-only.** A refund will be another row, never an edit, so a past month
  recomputes to the same number instead of drifting as adjustments land.
- **Excluded from the tenant RLS loop**, with a partner-and-HQ-only policy. Each
  row holds the partner/HQ split — a commercial term between CANVEXIA and the
  operator. Under the generic tenant policy a restaurant could read its own rows
  and learn exactly what its partner keeps, and it would be discovered by a
  merchant rather than by us.

**Written outside a try/catch, deliberately.** Postgres aborts a transaction on a
failed statement, so swallowing an error inside one would roll back the
activation too — turning "the ledger table is one migration behind" into "nobody's
payment settles". The table's existence is checked once per process instead.

---

## D19 — Outbound checkout resolves through the owning partner

**Settled.** Phase 4a. `src/server/billing/merchant-provider.ts`.

A merchant's subscription checkout is now created on their partner's gateway when
that partner has a sub-account, and on CANVEXIA's own when they do not. The
second is not a fallback that loses money — there is no other account for it to
go to, and it is where it goes today.

The reverse is the dangerous case and is the one branch that never falls through:
a partner *with* a sub-account being quietly charged on the platform account would
route their revenue to CANVEXIA while every statement said otherwise. That
returns an error rather than a charge.

**Only the subscription path is wired.** The five other checkout sites (add-ons,
feature subscriptions, branch activation, DIY activation) still resolve to the
platform account. That is correct today — every merchant belongs to the house
partner, whose money is CANVEXIA's — and those are one-off platform charges
rather than the partner-shared subscription revenue this phase is about. They
follow when the first external operator onboards, which is also when
`SUB_ACCOUNT_MECHANISM_CONFIRMED` has to become true.

---

## D20 — Brand precedence: diner sees the merchant, merchant sees the partner

**Settled.** Phase 5. Answers Q4.

- **Diner-facing** surfaces render the **merchant's** brand. A diner scanning a
  QR at Mango Grill should see Mango Grill — that is what the restaurant pays for
  and what their customers recognise. Already how it works
  (`Restaurant.displayName` / `logoUrl` / `brandPrimaryColor`); Phase 5 does not
  touch it.
- **Merchant-facing** surfaces render the **partner's** brand: the owner's
  dashboard, the emails they receive, and above all who they contact for help. To
  the restaurant, the partner *is* the software company.

Getting it backwards in either direction is a real failure, not a cosmetic one: a
partner's logo on a diner's receipt confuses the restaurant's customers, and
Servd's support address on a partner's merchant dashboard sends their customers
to us.

`src/server/branding/partner-brand.ts` resolves the merchant-facing side against
`PLATFORM_BRAND`, so an unbranded partner produces exactly today's look rather
than a half-styled page.

---

## D21 — Either side removes the badge; neither puts it back

**Settled.** Phase 5. Answers Q5.

Two systems answered one question — does "Powered by Servd" appear. A merchant
can buy the white-label unlock; their partner can be contracted to full
white-label. The rule: **either suppresses it, neither reinstates it.**

The direction is not arbitrary. A merchant who *paid* for the badge to be gone
bought exactly that, so a partner term cannot bring it back. A partner on full
white-label contracted for no CANVEXIA mention anywhere their customers can see,
so a merchant who never bought the unlock cannot expose it on their behalf. Both
point the same way, and "either suppresses" is the only rule keeping both
promises. An unrecognised brand mode falls back to showing the badge — failing
towards the status quo rather than silently white-labelling.

`POWERED_BY_SINCE` grandfathering is untouched.

### The gate, actually run

The promise was that servdph.com renders identically. Verified end to end rather
than asserted: seeded a database, built and served the app at the **pre-Phase-5**
source, captured the diner ordering page, the restaurant page and the platform
home, then rebuilt at the Phase-5 source and captured again.

The three pages differed by exactly the Next.js **build ID**, which is random per
build. With it normalised out, all three are byte-identical. Plus 41 unit tests
including an exhaustive identity property: absent, `null` and `"powered_by"` brand
modes all produce exactly the pre-CANVEXIA answer for every combination of
grandfathering and unlock.

**One thing the fixture work turned up**, unrelated to this change and not fixed
here: `hasFeature(restaurantId, "whiteLabel")` returns **true** for seeded demo
restaurants *and* for a restaurant with no plan and no subscription at all. So
the badge is suppressed for them regardless of any partner term. It is why the
end-to-end fixture could not be made to exercise the partner arm, and it may be
deliberate (a preview with everything on). Worth a look before the first external
operator goes live, since a merchant who has not paid for white-label should be
showing the badge.

---

## D22 — Partner hosts are a second root domain, inert until configured

**Settled.** Phase 5.

`parseHost` takes an optional `partnerRootDomain` and gains a `partner` kind, so
`cebu.canvexia.app` resolves to an operator's portal while `mango-grill.servd.app`
stays a storefront. Two roots because they answer different questions.

`NEXT_PUBLIC_PARTNER_ROOT_DOMAIN` is unset in production, and with it absent not
one input resolves differently than before — asserted directly in the host tests.
The middleware branch that routes a partner host ships **now** rather than with
the domain: without it, the first partner host configured would fall through to
the tenant rewrite and be looked up as a restaurant, which it is not.

---

## D23 — Products register adapters; the portal knows none of them

**Settled.** Phase 6. `packages/core/src/products/adapter.ts`.

The brief's requirement in one line: *adding a vertical must not require touching
the partner portal.* Before this, the portal called `provisionDemo` — Servd's own
restaurant-creation function — so adding laundry meant editing the portal, and
the portal then knew about laundry. Two verticals in, every new product is a
change to shared code the others have to be re-tested against.

Now the portal collects what is true of any merchant (name, contact, logo), hands
it to `provisionMerchant(productId, partnerId, payload)`, and knows nothing else.
Each vertical registers a `ProductAdapter`.

**A registry, not an import.** The dependency has to point one way: core cannot
import Servd without core depending on a Next app and a Prisma schema. The
vertical knows about core; core knows only that something claimed a product id.

**The shared payload is deliberately small.** Every field on it is a field the
portal must render for every vertical, so each addition taxes all of them — and a
field meaningless for laundry does not belong on a laundry operator's form.
Product-specific fields go in `extra`, which only that adapter reads, and the
friction of having to provide your own step for it is the point.

**The adapter sets ownership itself.** The dispatch cannot: only the adapter knows
where its product records an owner, and a merchant created without one is
invisible to its partner under the RLS policies and absent from every statement,
with nothing erroring to say so.

**Refusals return a reason, not an exception.** Two of the four are ordinary
states rather than faults — a product listed but not live, and one whose adapter
is not registered in this deployment. `product_not_live` is reported before
`no_adapter` because the first is a fact about the product and the second is a
fact about the deployment, and only the first means anything to the partner
reading it.

**`live: false` is load-bearing.** `printosph`, `laundry` and `pharmacy` are in
the registry so partners can see what is coming, and the dispatch refuses to
provision into them. Visible and unusable is the honest state; creatable before
the adapter works would be an account the merchant discovers is broken.

### Q7 splits this phase, and only half was built

Built, because it does not depend on the answer: the interface, the dispatch,
Servd's adapter, and the portal calling through it. The same interface holds
whether the other verticals move into this monorepo or consume `@servd/core` as a
published package from their own repositories.

Not built: migrating `jobanica/laundry`, `jobanica/Pharmacy` and
`jobanica/print-new`. Three codebases sharing no code with Servd, none attached
to this session. For those, "write an adapter" is preceded by "give that codebase
partner-aware multi-tenancy", which is Phase 1 repeated per repo.

`docs/canvexia/adding-a-vertical.md` is the scaffold — written from having done
it for Servd rather than imagined, because a code scaffold for repositories
nobody here has read would be fiction.

---

## D24 — New verticals are built from scratch here, not migrated

**Settled.** Answers Q7, and with a third option neither of the two offered.

Q7 was framed as "adapter interface only, or migrate `jobanica/laundry`,
`jobanica/Pharmacy` and `jobanica/print-new` into this monorepo". The answer is
neither: **new verticals are written from scratch as `apps/*` in this repository,
on `packages/core` from day one.** Those three repositories become
specification — a description of what to build — rather than code to move.

### Why this is the better shape

Migration would have meant, per repo, giving an existing codebase partner-aware
multi-tenancy after the fact: adding an owner column, backfilling it, writing RLS
policies around a schema that was not designed for them, and reconciling its
identity model with the platform's. That is Phase 1 repeated three times, and
Phase 1 was the phase that turned up two ownership bugs — in a codebase this
session had traced in detail.

Built from scratch, a vertical has the partner axis before it has a first row.
There is no backfill, no grandfathering, no "which of these tables predate
tenancy". The whole class of problem D13 and the Phase 1/3 bugs came from simply
does not arise.

### What it costs, and it is not nothing

Those repositories contain real work. The brief describes PrintOSph as *"fully
specced (22-phase build, 33-table schema)"*, and `jobanica/laundry` was pushed
2026-09-12 — the day before this session. Choosing to rebuild means that code is
reference material, not a head start, and whoever writes the new version has to
actually read it or the specification is lost with it.

**Worth confirming before the first line of a new vertical:** that this is a
deliberate trade and not an underestimate of what is already in those repos.

### What it changes here

- Phase 6 is finished as built. The `ProductAdapter` interface is the same either
  way; from-scratch verticals simply implement it natively instead of having it
  retrofitted.
- `docs/canvexia/adding-a-vertical.md` is now the primary path rather than a
  secondary one, and its advice to "wrap the product's existing creation path"
  becomes "write creation once, correctly".
- `packages/db` and `packages/ui` stop being speculative. A second app written
  here will want shared tenancy/billing models and shared components on day one,
  which is precisely what those empty packages were reserved for.
- The registry entries stay `live: false` until each vertical exists.

### The question this forces, not yet answered

**One database and one Prisma schema for all products, or one per product?**

Everything built so far assumes one: the RLS policies, `restaurants."partnerId"`,
`partner_ledger_entries`, `partners` — all in a single Postgres database and a
single schema. A second app in this monorepo either shares that schema (adding
its own domain tables beside Servd's) or gets its own database, in which case the
partner, ledger and billing tables need a home that both can reach.

Sharing is the lighter answer and the one the current design already implies.
It is worth deciding deliberately rather than discovering, because it is the kind
of choice that is cheap now and structural later — which is exactly what D8 said
about the partner axis.

---

## D25 — One Prisma schema and one database for every product

**Settled.** Follows from D24.

All CANVEXIA products share a single Postgres database and a single Prisma
schema. A new vertical adds its own domain tables beside Servd's; it does not get
its own database.

### Why this is the right default

Everything already built assumes it, and unpicking that is the expensive
direction:

- **The partner axis is one join.** D8 chose to reach the partner through
  `restaurants."partnerId"` rather than denormalise it. That works because the
  policy's sub-select can see `restaurants`. Across databases it cannot, and the
  partner axis becomes a denormalised copy per product — the exact design D8
  rejected, now with no single source of truth to reconcile against.
- **`partner_ledger_entries` is one table.** A partner's statement is
  "everything this partner earned", across products. One database makes that a
  query; separate ones make it a distributed join that has to be right every
  month for money.
- **RLS is per-database.** `app.current_partner_id()`, `app_user`, the catalogue
  loop — all of it would be duplicated and would drift, and drift in RLS is a
  leak rather than a bug.

The cost is the usual one: a noisy-neighbour product can affect the others, and
the schema gets large (88 models today). Both are real and both are cheaper than
splitting the partner and ledger tables across boundaries.

### Where the schema should live — and when to move it

It is at `apps/servd/prisma/schema.prisma` today, which is fine while Servd is
the only app and wrong the moment there is a second: one product would own the
tables every product depends on.

The destination is `packages/db` — which is empty and was reserved for exactly
this. **The move should happen before the first new vertical, and after the
pending migrations are applied.**

That ordering is not fussiness. There are **four un-applied hand-run migrations**
in `apps/servd/prisma/manual/` — `add-partner-tenancy`, `add-plan-price-floor`,
`add-partner-subaccount`, `add-partner-ledger` — and roughly twenty user-facing error strings that
tell an operator to *"run prisma/manual/add-X.sql"* when a column is missing.
Moving the directory mid-flight makes both the runbook and those messages point
somewhere that no longer exists — and they are read precisely when something is
already broken.

So: **apply the migrations, then move the schema, then build the first new
vertical.** The move itself is mechanical (schema, `rls.sql`, `manual/`, `seed.mjs`,
the `db:*` scripts, three script files, CI, and those error strings) but it is a
discrete piece of work with its own verification, not something to fold into
another change.

---

## D26 — A new database is built from the schema, not by replaying `manual/`

The CANVEXIA database (Supabase project `Canvexia`, ap-southeast-1) was empty —
no application tables at all, only Supabase's own `auth`, `storage` and `vault`
schemas, zero auth users, zero storage objects. So the "remove all content"
half of the request had nothing to remove, and the interesting question was how
to put the system in.

Two routes existed. Replay all ~100 files in `prisma/manual/` in the order they
were originally written, or generate the whole schema in one pass from
`schema.prisma`:

```
prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

**The second, and it is not a close call.** `manual/` is a *history* — it records
how Servd's live database got from nothing to today, including the false starts
(`fix-orderitem-menuitem-setnull`, `restore-storefront-settings`,
`drop-referral-program`). Replaying a history to reach a state you can state
directly buys nothing and inherits every ordering hazard in it. The diff is
derived from the schema, so by construction it cannot drift from it.

This is why the four pending migrations in the runbook do **not** apply here.
They exist to move an *already-populated* Servd database forward. A database
built from `schema.prisma` is already past them: `plans."priceFloor"`,
`restaurants."partnerId"`, `partners."gatewaySubAccountId"` and
`partner_ledger_entries` are all in the schema, so they are all in the output.
The runbook is still the right document for servdph.com. It is the wrong one for
a new database, which is what this decision records.

Verified after applying: 89 tables, 22 enums, 85 foreign keys, 154 indexes plus
89 primary keys, 873 columns — each count matching the generated script exactly.

## D27 — RLS defaults to locked, enforced by a sweep

Provisioning the new database surfaced a hole that predates CANVEXIA and is live
on servdph.com right now.

Supabase grants the `anon` role full `select, insert, update, delete` on every
table in `public` by default, and the anon key is published in the browser —
that is what it is for. For a table with RLS this is harmless: the policies
decide and `anon` satisfies none of them. For a table **without** RLS it means
the table is readable and writable by anyone who views source.

`rls.sql` covered 77 of the 89 tables. The twelve it did not:

    ad_spend, announcement_reads, announcements, content_brand_profiles,
    content_generation_logs, content_pillars, content_scripts, crm_touches,
    outreach_videos, platform_settings, program_settings, prospect_leads

`prospect_leads` holds the names, phone numbers, email addresses and street
addresses of scraped sales leads. `platform_settings` holds
`xenditCredsEnc`, `emailCredsEnc`, `uploadPostKeyEnc` — encrypted, but there is
no reason for the ciphertext to be world-readable either, and the row is
world-*writable*, which is worse.

Confirmed rather than assumed: a canary row inserted into `prospect_leads` was
read back under `set role anon`. Before the fix it returned. After, zero.

**The fix is a sweep, not a list.** The final block of `rls.sql` now enables and
forces RLS with a super-admin-only policy on every `public` base table that has
no policy by the time it runs. The tenant loop above it is written the same way
and for the same reason: this exact list had been missed twelve times, and a
list that has to be remembered is a list that drifts. A table added tomorrow
arrives locked, and someone has to open it on purpose.

Safe because all twelve are reached exclusively through `systemDb()` — checked
per model against its callers, not assumed: zero `tenantDb`, zero `partnerDb`.
Super-admin-only locks out no caller that exists.

And the direction of failure is the one to want. If some future table *should*
be tenant-readable and this sweep catches it first, the symptom is a blank
screen in a feature nobody shipped yet. The other default's symptom is a leak
nobody notices.

The same block pins `search_path` on the three `app.*` helper functions. They
decide every policy in the file, which makes them the worst possible place for a
resolution the caller can influence; they reference only built-ins, so the empty
path costs nothing.

Result on the new database: 89 of 89 tables with RLS enabled *and* forced, 92
policies, and the Supabase security advisor returning an empty list.

**This is also a fix Servd needs.** It ships in `rls.sql`, so servdph.com picks
it up the next time `npm run db:rls` runs — which the deploy runbook already
calls for as step 2.
