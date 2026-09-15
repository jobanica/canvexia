# Partner portal — execution checklist

The antigravity Mode C checklist for `implementation_plan.md`. Not `task.md` —
that is this project's live status doc.

## A1 — schema, roles, RLS, identity  ✅ DONE

- [x] `Partner` + `licenseStartedAt`, `exclusivityExpiresAt`, `milestones`,
      `onboardingSteps`
- [x] `PartnerUser`, `PartnerInvite`, `Prospect`, `NotificationPref`
- [x] `packages/db/prisma/manual/add-partner-portal.sql` — tables, CHECK
      constraints, FKs, policies, `REVOKE ALL FROM anon, authenticated`
- [x] Same policies in `rls.sql`, guarded by `to_regclass` so `db:rls` still
      runs on a clone that has not applied the migration
- [x] `PARTNER_USER_ROLES` + `permissions.ts` (capability matrix)
- [x] `partners/milestones.ts` — the `{month, target}` ladder, default 10/25/50
- [x] `partners/notifications.ts` — the closed event list
- [x] `auth.ts` resolves a seat first, `partners.authUserId` second
- [x] **Migration run**: 4 tables, 4 policies, 0 public grants, 2 seats
      backfilled — both existing logins still work
- [x] 22 pure tests (permissions 12, milestones 10), all passing
- [x] **Isolation gate: 10/10 against the live database**

### The gate, and why it first reported a false pass

`DATABASE_URL` connects as `postgres`, which carries `rolbypassrls = true`.
`FORCE ROW LEVEL SECURITY` subjects the table OWNER to its policies; BYPASSRLS
outranks it. So the first run of the gate saw no policy at all and partner B read
partner A's prospects. The wrappers in `scoped-db.ts` have always switched to
`app_user` for exactly this reason; the gate had to as well.

The vitest file now opens with a guard that fails if the connected role bypasses
RLS, so this can never be invisible again.

### Not done in A1

- [ ] **Run `tests/isolation/partner-seats.test.ts` itself.** Postgres ports are
      unreachable from the agent sandbox (HTTPS only, confirmed by TCP probe on
      6543 and 5432). The ten assertions are proved as SQL against the same
      database; the suite is what keeps them proved in CI.
- [ ] **Six older Servd isolation suites do not switch role** and therefore
      cannot observe RLS — see `system_architecture.md` §6. Left alone rather
      than blind-edited: the change is three lines each and needs a database to
      verify.

## A2 — Overview + Merchants  ✅ DONE (actions deferred)

- [x] `lib/partners/attention.ts` + 10 tests — four rules, pure, fixed-date
- [x] `server/partners/merchants.ts` — cross-product fan-out, MRR, `isPaying`
- [x] `server/partners/overview.ts` — stats, milestone ladder, attention, series
- [x] `components/partner/Overview.tsx` — stat cards, milestones, attention,
      onboarding checklist (five of six steps DERIVED, not self-ticked)
- [x] `components/partner/GrowthChart.tsx` — recharts, already a dependency
- [x] `components/partner/PortalNav.tsx` — links hidden, not disabled
- [x] `/partner` rebuilt · `/partner/merchants` · `/partner/merchants/[key]`

### Deferred out of A2, on purpose

- [ ] **Merchant actions**: change plan, extend trial, suspend/reactivate,
      resend invite, mark invoice paid. Each writes to another tenant's data and
      needs its own audit row and confirmation.
- [ ] **"Log in as merchant."** Flagged at plan time and still true: it is the
      one feature that puts one tenant inside another tenant's data by design.
      It lands after the isolation suite is dense enough to catch a mistake in
      it, not before. The detail page says so rather than showing a dead button.
- [ ] **CSV export** and the per-merchant notes/audit panel.

### Honest gaps surfaced by the data, not invented

- Only restaurants have subscriptions — `Subscription` keys on `restaurantId`.
  A pharmacy reports `plan: null`, rendered "Not billed yet" rather than ₱0.
- The chart is a GROWTH curve: merchants by creation date at today's prices.
  Real revenue history needs the ledger (A4). The caption says so.
- "Open tickets awaiting partner reply" has no ticket system to read. The rule
  is absent rather than always-empty.

## A3 — Pipeline + lead form  ✅ DONE

- [x] `lib/partners/prospect-input.ts` + 15 tests — two shapes, and the
      difference between them is the security story
- [x] `server/partners/prospects.ts` — list, create, move, convert-link, all
      partner-scoped, each write audited in the SAME transaction
- [x] `server/partners/lead-form.ts` — the one unauthenticated write
- [x] `server/partners/prospect-actions.ts`
- [x] `PipelineBoard.tsx` (board/list toggle), `ProspectForm.tsx`, `LeadForm.tsx`
- [x] `/partner/pipeline` · `/l/[slug]` (public, branded, noindex)
- [x] Middleware: `/l/...` passes through the partner-host rewrite
- [x] `normalizeMobile` moved to `packages/core/src/ph/mobile.ts` — two apps
      need it now
- [x] **Isolation gate: 7/7 against the live database**

### Decisions worth keeping

- **No drag-and-drop library, and no drag-only interaction.** Every card carries
  a stage `<select>` that posts a form: that is the mobile path, the keyboard
  path and the screen-reader path. HTML5 drag is layered on top on desktop and
  uses the same action. The select is the feature; the drag is the affordance.
- **The public form's SHAPE is the boundary.** `LeadInput` has no `partnerId`,
  no `stage`, no `assignedToId`, no `nextFollowUpAt`, and its message caps at
  500 rather than the partner form's 2000. The slug is a lookup key, not an
  identity. A test asserts the parsed keys exactly.
- **Mobile required on the public form, optional for a partner.** The partner
  has the shop in front of them; a stranger is asking to be called back.
- **`actorType: "system"` on a lead-form audit row.** Nobody was signed in.
  Recording a partner as the actor would make the audit trail wrong in the one
  place it is read.

### Not done

- [ ] **Lead notifications.** `CREDENTIALS_ENCRYPTION_KEY` is unset, so a send
      would silently no-op while the partner believed they had been told.
      `notification_prefs` already stores the choice; A6 turns it on.
- [ ] **Prospect → merchant round trip.** The card links to the create form with
      the prospect id, and `linkProspectToMerchant` exists, but provisioning
      does not yet thread the id back. Small, and it belongs with the merchant
      actions in A2's deferred set.

## A4 — Revenue + pricing + statements  ⬜ NEXT
## A3 — Pipeline + lead form  ⬜
## A4 — Revenue + pricing + statements  ⬜
## A5 — Brand + domains + sender identity  ⬜
## A6 — Team + settings + digest + onboarding checklist  ⬜
