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

## A3 — Pipeline + lead form  ⬜ NEXT
## A3 — Pipeline + lead form  ⬜
## A4 — Revenue + pricing + statements  ⬜
## A5 — Brand + domains + sender identity  ⬜
## A6 — Team + settings + digest + onboarding checklist  ⬜
