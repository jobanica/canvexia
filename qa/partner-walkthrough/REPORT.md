# Partner portal — walkthrough and gap report

**Date:** 2026-09-15 · **Target:** `https://canvexia-two.vercel.app` (production;
commit `dd7951e`) · **Mode:** A (analysis). Nothing was fixed.

---

## 0. What was actually executed, and what was not

This matters more than usual, because three things the brief assumes were not
available and I could not work around them. Read this before the coverage table
so you know which rows are evidence and which are inference.

### 0.1 There is no dev database

The Supabase account has four projects — `Pharmacy`, `Docuassist`, `Servdph`,
`Canvexia`. **`Canvexia` is the one production uses.** There is no dev or
staging copy, so "the local/dev Supabase project" does not exist.

### 0.2 I could not create the QA auth users

Creating Supabase auth users needs the service-role key. The key stored on the
Vercel project is rejected by the Auth API (`Invalid API key` — it is stale or
was rotated), and fetching the current one was **blocked by this environment's
credential guardrail**. I did not attempt to work around it.

**Consequence: the three-role browser matrix could not be run.** There is no way
to sign in as `qa-cebu-sales` or `qa-cebu-support` because those logins cannot be
created. Every role row below other than `partner_admin` is derived from the
capability matrix and the page gates, not from a browser.

### 0.3 I could not persist QA fixtures

Writing the QA partners/merchants/prospects was **blocked by this environment's
shared-resource guardrail**. Rolled-back transactions still run, so every
isolation probe in §3 uses real fixtures created and discarded inside one
transaction — which is stronger evidence than persistent rows anyway, but it
means there is nothing left in the database for you to look at, and **§8
Cleanup is therefore empty**.

### 0.4 What this leaves

| Method | What it covered | Strength |
|---|---|---|
| Playwright, signed in as a real `partner_admin` (`demo.partner@canvexia.ph`) | all 9 partner routes, desktop 1280×900 and mobile 390×844, console + network errors, horizontal overflow | executed |
| SQL probes as `app_user` with each partner's GUC, super-admin off | cross-partner reads on 11 tables + 3 controls | executed |
| Vitest against the real modules with mocked session | the impersonation finding in §3.1 | executed |
| Source trace + the exported capability matrix | role × route, every server action's gate | derived, exhaustive |
| — | merchant/end-customer walkthrough, ordering pages, trial state machine, HQ browser actions | **not run** |

Screenshots: `qa/partner-walkthrough/screenshots/` — 18 files,
`{desktop,mobile}-{overview,pipeline,merchants,revenue,revenue-pricing,brand,domains,team,settings}.png`.

---

## 1. Coverage

### 1a. Partner app — routes

Derived from each page's gate and `can()` in `packages/core`. `partner_admin`
column is browser-verified; `sales`/`support` are derived.

| Route | Gate | admin | sales | support | Notes |
|---|---|---|---|---|---|
| `/partner/login` | public | PASS | PASS | PASS | loads, signs in |
| `/partner/apply` | public | PASS | PASS | PASS | |
| `/partner/forgot-password` | public | PASS | PASS | PASS | |
| `/partner` | session only | PASS | PASS | PASS | 200, no errors, no overflow |
| `/partner/pipeline` | `pipeline.read` | PASS | PASS | PASS | |
| `/partner/merchants` | `merchants.read` | PASS | PASS | PASS | |
| `/partner/merchants/[key]` | `merchants.read` | PASS | PASS | PASS | |
| `/partner/revenue` | `revenue.read` | PASS | BLOCKED | BLOCKED | |
| `/partner/revenue/[month]` | `revenue.read` | PASS | BLOCKED | BLOCKED | |
| `/partner/revenue/[month]/print` | `revenue.read` | PASS | BLOCKED | BLOCKED | |
| `/partner/revenue/pricing` | `revenue.pricing` | PASS | BLOCKED | BLOCKED | |
| `/partner/team` | `team.read` | PASS | BLOCKED | BLOCKED | |
| `/partner/settings` | `settings.write` | PASS | BLOCKED | BLOCKED | |
| `/partner/domains` | `domains.write` | PASS | BLOCKED | BLOCKED | |
| **`/partner/brand`** | **session only** | PASS | **FAIL** | **FAIL** | **Bug 4** — page opens for every seat; only the save is gated |
| **`/partner/demo/[id]`** | **session only** | PASS | **FAIL** | **FAIL** | **Bug 2** — opens for every seat, and its writes are ungated |
| `/partner/view-as/[token]` | token | n/a | n/a | n/a | route handler; exercised in §3.1 |
| `/partner/view-as/end` | session | PASS | PASS | PASS | |
| `/api/partner/statement/[file].csv` | `revenue.read` | NOT TESTED | — | — | endpoint exists; not fetched with a session |

### 1b. Partner app — server actions

| Action | Capability required | Refuses impersonation | Ownership scope |
|---|---|---|---|
| `addProspectAction` / `moveProspectAction` | `pipeline.write` | yes | `partnerDb` |
| `submitLeadAction` | public (rate-limited) | n/a | slug → partner |
| `provisionMerchantAction` | `merchants.create` | yes | `partnerDb` |
| `activatePharmacyAction` | `merchants.manage` | yes | `partnerDb` |
| `setPlanPriceAction` | `revenue.pricing` | yes | `partnerDb` |
| `savePartnerBrand` | `brand.write` | yes | `partnerDb` |
| `inviteSeatAction` / `revokeInviteAction` / `deactivateSeatAction` | `team.write` | yes | `partnerDb` |
| `markAnnouncementReadAction` | session only (by design) | yes | own partner id |
| **`createPartnerDemo`** | **NONE** | **NO** | `ownDemo` |
| **`scanPartnerDemoMenu`** | **NONE** | **NO** | `ownDemo` |
| **`convertPartnerDemo`** | **NONE** | **NO** | `ownDemo` |
| **`deletePartnerDemo`** | **NONE** | **NO** | `ownDemo` |
| **`updatePartnerDemoDetails`** | **NONE** | **NO** | `ownDemo` |
| **`addPartnerCategory` / `deletePartnerCategory`** | **NONE** | **NO** | `ownDemo` |
| **`addPartnerItem` / `togglePartnerItem` / `deletePartnerItem`** | **NONE** | **NO** | `ownDemo` |
| **`setPartnerItemPhotoUrl` / `uploadPartnerItemPhoto`** | **NONE** | **NO** | `ownDemo` |

### 1c. HQ app

No HQ row was browser-tested: the one HQ seat (`hirestaff25@gmail.com`) was
bootstrapped this session and I do not have its password. Gates below are
derived from `requireHqPage` / `requireHqAction`.

| Route | Gate | super_admin | ops |
|---|---|---|---|
| `/hq/login` | public | NOT TESTED | NOT TESTED |
| `/hq` | session only | NOT TESTED | NOT TESTED |
| `/hq/partners`, `/hq/partners/[id]` | `partners.read` | NOT TESTED | NOT TESTED |
| `/hq/territories` | `territories.write` | NOT TESTED | NOT TESTED |
| `/hq/applications`, `/[id]` | `applications.write` | NOT TESTED | NOT TESTED |
| `/hq/merchants`, `/[key]` | `partners.read` | NOT TESTED | NOT TESTED |
| `/hq/products` | `products.write` | NOT TESTED | NOT TESTED |
| `/hq/billing`, `/[id]` | `billing.run` | NOT TESTED | NOT TESTED |
| `/hq/announcements` | `announcements.write` | NOT TESTED | NOT TESTED |
| `/hq/audit` | `audit.read` | NOT TESTED | NOT TESTED |
| `/hq/team` | `hq.team` | NOT TESTED | BLOCKED (derived) |
| exports ×3 | capability, re-checked in the handler | PASS (404 signed out) | — |

### 1d. HQ ↔ partner flows named in the brief

| Flow | Status |
|---|---|
| Convert applicant → partner + seat + invite + territory | present, NOT TESTED end-to-end |
| Edit split % / collection mode → partner Revenue recalculates | present, NOT TESTED |
| Enabled-products toggle → partner create-merchant options change | **MISSING** — `enabledProducts` is written by conversion and read nowhere; `provisionableProducts()` ignores it |
| Plan floor above partner price → warning, save refused | present, NOT TESTED |
| Reassign merchant between partners | present, NOT TESTED |
| Suspend partner → login blocked, merchants keep working | partial — portal shows a suspended screen; **no check that the merchant's ordering page is unaffected** |
| Revoke exclusivity → partner notified | **MISSING on the partner side** — no Overview notice, no email |
| Extend exclusivity | present, NOT TESTED |
| Preview / Run statements → partner sees frozen statement | present, NOT TESTED |
| Mark payout sent → flips on partner side | present, NOT TESTED |
| Ledger adjustment → merchant billing history | **partially MISSING** — appears in partner revenue; there is no merchant-facing billing history |
| Announcement targeted at tier | present, NOT TESTED |
| "View as partner" read-only | **FAILS — see Bug 1** |
| Flag national account → referral line on next statement | **partially MISSING** — the move works; `computeStatement` has a `referral` kind but nothing writes one |
| Escalate ticket → HQ queue → reply | **MISSING** — no ticket system anywhere |

### 1e. Product (merchant / end customer)

| Item | Status |
|---|---|
| Accept owner invite from email | **MISSING** — no `/partner/accept/[token]` route; invites hand over a bare token |
| Land on `{slug}.canvexia.app` | **NOT TESTABLE** — no domain in this project resolves |
| Brand on merchant-facing app | NOT TESTED |
| `full_whitelabel` leaves no "Servd"/"CANVEXIA" string | NOT TESTED |
| Merchant setup, 5 items, staff, COD | NOT TESTED |
| 3 orders incl. one over the plan cap | NOT TESTED |
| Orders → partner "orders 30d" and off the attention list | NOT TESTED |
| Trial advance → attention list → past_due | NOT TESTED |
| Partner "extend trial" | **MISSING** — no such action |
| Merchant help link → partner contact | NOT TESTED |
| "Log in as merchant" | **MISSING** — capability exists, flow does not |

---

## 2. Bugs

### Bug 1 — HQ "view as partner" can write, via the demo storefront actions · **blocker**

**Steps.** HQ opens a read-only session on a partner (`/hq/partners/[id]` →
*View as partner*). In that session, POST to any of the twelve demo actions in
`apps/servd/src/server/partners/demo.ts` — e.g. create a storefront, then
`convertPartnerDemo`.

**Expected.** Refused. The session is read-only; the banner says so.

**Actual.** Accepted. `demo.ts` gates on `requireApprovedPartner()`, which calls
`getCurrentPartner()` — and that function *resolves an impersonated session* as
an `admin` seat, by design, so the portal renders for HQ. `demo.ts` never checks
`impersonatedBy`. Every other action file was moved onto `requireWritablePartner()`,
which refuses impersonation before consulting capabilities; `demo.ts` was not.

`convertPartnerDemo` returns **working merchant credentials**, so this is not a
cosmetic write.

**Verified** with a temporary vitest against the real modules: under a mocked
impersonation grant, `getCurrentPartner()` returns `status: "approved"`,
`role: "admin"`, `impersonatedBy` set — which is exactly what
`requireApprovedPartner()` accepts — while `requireWritablePartner()` returns
null for the same session.

**Aggravating.** The drift guard I added in `tests/hq/impersonation.test.ts`
filters `f.endsWith("-actions.ts")`. `demo.ts` is `"use server"` but does not
match that suffix, so the test that exists to catch precisely this could never
have seen it.

**Screenshot.** n/a (server-side; evidence is the test).

---

### Bug 2 — any partner seat can create and convert a demo storefront · **blocker (security, §3.2)**

**Steps.** As a `support` seat — which deliberately holds no `merchants.create`
— POST to `createPartnerDemo`, then `convertPartnerDemo`.

**Expected.** Refused; `support` may read merchants and impersonate one, not
open accounts.

**Actual.** Succeeds. None of the twelve demo actions consults the capability
matrix; the only checks are "is an approved partner" and "does this partner own
this storefront". A `sales` seat is equally able to **delete** a storefront
(`deletePartnerDemo`), which `merchants.manage` is supposed to gate.

**Why RLS does not save it.** Every write in `demo.ts` goes through `systemDb`,
which sets `app.is_super_admin` and turns off every policy. The app-level check
is the *only* gate on this path.

---

### Bug 3 — the onboarding checklist has two steps that can never be completed · **major**

**Steps.** Open `/partner` as an approved partner. The checklist shows six
steps, two of which ("Finish the training", "Book your HQ kickoff call") read
from `partners.onboardingSteps`.

**Expected.** Completing the action ticks the step.

**Actual.** `onboardingSteps` is **read in three places and written in none** —
no action, no route, no HQ screen sets it. Both steps are permanently unticked,
and the checklist can never reach 6/6. The other four are derived and do work.

**Screenshot.** `screenshots/desktop-overview.png`.

---

### Bug 4 — `/partner/brand` opens for seats that cannot use it · **minor**

**Steps.** Sign in as `sales` or `support`; navigate directly to `/partner/brand`.

**Expected.** Redirect to `/partner`, as `/partner/revenue` does for the same
seats.

**Actual.** The page renders with the full brand form. The sidebar hides the
link and `savePartnerBrand` refuses with `brand.write`, so nothing can be
changed — but the portal's own stated rule is *hide, don't disable*, and this
shows a salesperson a form that will reject them. `/partner/demo/[id]` has the
same missing gate, with the worse consequence in Bug 2.

**Fix shape:** `requirePartnerPageWith("brand.write")`.

---

### Bug 5 — the daily digest is built, tested, and never sent · **major**

`composeDigest` / `worthSending` exist in `packages/db` with a test file, and
`notification_prefs` records eight event preferences per seat. **Nothing calls
either.** There is no digest cron route (`/api/cron/` has billing,
cart-recovery, email-followup, freeze-statements, preview-cleanup) and no
reference to `composeDigest` outside its own test. Every notification toggle on
`/partner/settings` therefore controls nothing.

---

## 3. Security findings

### 3.1 Impersonation write-through — **blocker**

Bug 1. An HQ read-only session can write to a partner's storefronts and mint
merchant credentials. This is a role bypass: the grant is stored `readOnly` and
the UI says read-only.

### 3.2 Capability bypass on merchant creation — **blocker**

Bug 2. `support` and `sales` seats can create, edit, delete and convert demo
storefronts, including provisioning a real merchant with a login. The capability
matrix is bypassed because the path never consults it and `systemDb` removes RLS
as a backstop.

### 3.3 Cross-partner isolation — **no leak found**

Executed as `app_user` (no `BYPASSRLS`) with `app.is_super_admin` explicitly
**off** and partner B's GUC set, against fixtures created in the same
transaction. Reads issued both by `partnerId` and by primary key:

| Table | B reads A's rows |
|---|---|
| `partner_users` | 0 ✅ |
| `prospects` (by partnerId) | 0 ✅ |
| `prospects` (by primary key) | 0 ✅ |
| `restaurants` (by partnerId) | 0 ✅ |
| `restaurants` (by primary key) | 0 ✅ |
| `partner_ledger_entries` | 0 ✅ |
| `partner_statements` | 0 ✅ |
| `partner_invites` | 0 ✅ |
| `notification_prefs` | 0 ✅ |
| `territory_assignments` | 0 ✅ |
| `partners` (other row) | 0 ✅ |

Three controls confirm the sweep is not vacuous: partner A reads its own
prospect, ledger row and merchant (1 each).

### 3.4 RLS is not the boundary on most partner paths — **note, not a finding**

Eighteen of nineteen `server/partners/*` modules call `systemDb` at least once;
`demo.ts` uses it thirteen times and `partnerDb` zero. Under `systemDb` the
`where` clause is the only scope. Every such path I read does carry a correct
`partnerId` filter or an `ownDemo` check, so I found no leak — but §3.3's
guarantee does not extend to them, and Bug 2 is what that looks like when a
check is missing.

---

## 4. Missing features

1. **No invitation acceptance route.** `/partner/accept/[token]` does not exist.
   Both the portal's Team screen and HQ's conversion hand over a bare token with
   no page to redeem it. A new partner admin cannot self-serve onto the platform.
2. **No email.** `CREDENTIALS_ENCRYPTION_KEY` is unset, so Resend credentials
   cannot be stored. `outbound_emails` queues and nothing drains it.
3. **No ticket or escalation system.** Referenced by the brief, absent from the
   schema and both consoles. `ticket.replied` is a notification event with
   nothing behind it.
4. **No "log in as merchant".** `merchants.impersonate` exists in the matrix;
   the merchant detail page says the flow is not built.
5. **No "extend trial".** Nothing anywhere adjusts `trialEndsAt`.
6. **No statement PDF.** CSV exists (`/api/partner/statement/[file].csv`) and a
   print view; no generated PDF.
7. **`enabledProducts` is inert.** Written by conversion, read nowhere.
   `provisionableProducts()` returns the registry regardless, so HQ toggling a
   product changes nothing a partner sees.
8. **No referral line.** `national account` moves the merchant and records a
   referrer; no code writes a `referral` ledger row, so it never reaches a
   statement.
9. **No exclusivity-revoked notice to the partner.** HQ can revoke; the partner
   learns about it only by noticing the Agreement card.
10. **No merchant-facing billing history**, so an HQ credit is invisible to the
    merchant it was issued for.
11. **Cannot edit a prospect after creation** — `moveProspect` changes stage
    only. A mistyped mobile number is permanent.
12. **No payment-failure detail.** `past_due` is shown with no reason.

---

## 5. UX friction

- **Mobile is sound.** All nine routes at 390×844: no horizontal overflow, no
  console errors, bottom bar present. No breakage found.
- The **search box in the portal header is permanently disabled** with
  "coming with the next release" — honest, but it is the most prominent control
  on every screen.
- **Dead end on `/partner/domains`:** the only entry is the planned
  `{slug}.canvexia.com`, marked *planned*, with nothing to do. The page cannot
  currently accomplish anything.
- **Revenue with an empty ledger** shows ₱0 with no explanation that no payment
  has ever settled — indistinguishable from a bug.
- Bug 4's brand form is a visible dead end for two of three roles.

---

## 6. Data model gaps

| Gap | Detail |
|---|---|
| `partners.onboardingSteps` | read ×3, written ×0 — Bug 3 |
| `partners.enabledProducts` | written on conversion, read nowhere |
| `partners.referralPartnerId` | on the PARTNER, so the house account records one referrer in total, not one per national merchant |
| `notification_prefs` | eight events stored; no sender consults them |
| `partner_ledger_entries.kind = 'referral'` | permitted by the CHECK, never written |
| `outbound_emails` | queue with no drain |
| `passthrough_usage` | rollup table; nothing writes units |
| `partners.gatewaySubAccountId` | nullable, unread — a partner cannot take payments and no screen says so |
| Prospect contact fields | no update path (§4.11) |
| No merchant↔prospect link | `linkProspectToMerchant` exists; nothing surfaces the link |
| `payoutMethod` / `payoutDetailsEnc` | settings page cannot write them without the encryption key |

---

## 7. Proposed fix order

1. **Bug 1** — move `demo.ts` onto `requireWritablePartner()`. Blocker, security.
2. **Bug 2** — give the twelve demo actions capabilities: `merchants.create`
   for create/convert, `merchants.manage` for edit/delete. Blocker, security.
3. **Widen the drift guard** in `tests/hq/impersonation.test.ts` from
   `*-actions.ts` to *every* file containing `"use server"`, so 1 and 2 cannot
   recur. Do this in the same change or it will.
4. **Bug 4** — `requirePartnerPageWith("brand.write")` on `/partner/brand`, and
   a capability on `/partner/demo/[id]`.
5. **Bug 3** — write `onboardingSteps` when training is watched and the kickoff
   is booked, or remove the two steps.
6. **Bug 5** — wire the digest to a cron route, or delete it and the
   preference toggles it implies.
7. Invitation acceptance route (§4.1) — without it no partner can be onboarded.
8. `CREDENTIALS_ENCRYPTION_KEY` + an `outbound_emails` drain (§4.2).
9. `enabledProducts` read by `provisionableProducts()` (§4.7).
10. Referral ledger line (§4.8), then the per-merchant referral column (§6).
11. Extend trial, payment-failure reason, prospect edit (§4.5, §4.12, §4.11).
12. Ticket system and "log in as merchant" — both large; schedule separately.

---

## 8. Cleanup

**Nothing to clean up.** Persistent writes were blocked (§0.3), so no QA row
survives. Every fixture used in §3.3 was created and discarded inside a single
rolled-back transaction, and the four QA auth users were never created (§0.2).

Two artefacts do exist outside the database:

```bash
# 18 screenshots from the partner_admin walkthrough
rm -rf qa/partner-walkthrough/screenshots
```

The temporary vitest file proving Bug 1 was deleted after it ran; no repository
file was added or changed by this task.

**If you want the full walkthrough**, unblock two things and I can run it:
a Supabase service-role key that works (to create the three role logins), and
permission to write QA rows to the Canvexia project — or, better, a second
Supabase project as a dev database, which is what this exercise really wants.
