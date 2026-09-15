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

## A2 — Overview + Merchants + create-from-prospect  ⬜ NEXT
## A3 — Pipeline + lead form  ⬜
## A4 — Revenue + pricing + statements  ⬜
## A5 — Brand + domains + sender identity  ⬜
## A6 — Team + settings + digest + onboarding checklist  ⬜
