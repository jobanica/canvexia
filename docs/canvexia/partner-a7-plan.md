# Partner Portal A7 — Staff roles, HR monitoring, field attendance, commissions

Mode C plan. **Nothing is written yet.** Section 0 is the part to read first:
nine premises in the brief do not hold against this repository, and four of them
change *what* gets built rather than how. Section 6 has three questions I cannot
answer from the code.

The previous occupant of this filename — the HQ Admin plan, now shipped as
H1–H7 — is archived at `docs/canvexia/hq-admin-plan.md`.

Traced before writing: `system_architecture.md`, the archived HQ and partner
plans, `packages/core/src/identity/*`, `packages/db/prisma/{schema.prisma,
rls.sql, manual/*.sql}`, all 16 `/partner` routes, all 29
`apps/servd/src/server/partners/*` modules, and the existing Servd HR stack
(`Employee`, `Shift`, `TimeEntry`, `EmployeeDocument`).

---

## 0. Blocking — what the brief assumes vs. what is here

### 0.1 There is no `apps/partner`, and no `core` schema

The portal is **`/partner` inside `apps/servd`** — 16 routes in
`src/app/(platform)/partner`, served by 29 modules in `src/server/partners`.
There is no separate app and adding one now would split one auth model, one
Prisma client and one RLS file across two deployments for no gain.

Likewise there is no `core.` Postgres schema. Every table in this database is
in `public` with a quoted camelCase name (`partner_users`, `audit_logs`,
`partner_ledger_entries`). The one exception is the **`app` schema**, which
holds RLS helper *functions* only — `app.current_partner_id()`,
`app.is_super_admin()`.

So `core.partner_role_permissions` reads as `public.partner_role_permissions`
throughout, and `has_permission()` belongs in `app`, beside its siblings.
**No behaviour changes; only the names in the brief do.**

### 0.2 The roles are already `admin | sales | support`, not `partner_sales | partner_support`

`packages/core/src/identity/roles.ts` defines `PARTNER_USER_ROLES = ["admin",
"sales", "support"]`, enforced by `partner_users_role_check` in
`add-partner-portal.sql`. **The migration the brief asks for is a no-op** —
there is nothing named `partner_sales` to rename.

What IS needed: adding a **fourth** role, `ops_manager`. That is one `ALTER
TABLE ... DROP CONSTRAINT / ADD CONSTRAINT` plus the matrix, and `admin` stays
named `admin` rather than becoming `partner_admin` — renaming it would touch
every seat row, the CHECK, `parseRole`, six action files and the HQ console for
a cosmetic gain.

### 0.3 RLS scopes to the PARTNER, not to the seat — this is the biggest decision in A7

Every partner policy in `rls.sql` (22 occurrences of `current_partner_id`) is
one comparison: *does this row belong to the partner in the GUC?* The GUC is
set by `partnerDb(partnerId, …)` and carries **no seat identity at all**. A
`sales` seat and an `admin` seat of the same partner produce byte-identical SQL
scope today; the difference between them lives entirely in
`packages/core`'s capability matrix, checked in the server layer.

"Enforce in RLS via `has_permission(partner_id, permission)`" therefore is not
an addition — it is a **rewrite of the tenancy model**. It needs:

1. a second GUC, `app.current_partner_user_id`, set by every scope wrapper;
2. `app.has_permission(text)` reading `partner_role_permissions` — a table
   lookup **per row checked**, on a policy that currently costs one string
   comparison;
3. a second arm on each of the 22 partner policy occurrences.

I am **not proposing that**, and the reason is not effort. The partner boundary
is the one that matters — it is what stops Davao reading Tagum — and it is
proven by the isolation suite. Making the same policies also answer "may this
seat see this row" doubles the number of ways the *tenant* boundary can be got
wrong, in the file where a mistake leaks another operator's commercial terms.
That is a bad trade for a boundary that is internal to one partner's own staff.

**Proposed instead — RLS gains a seat arm on exactly the tables where the seat
IS the boundary**, which are the new ones: `staff_events`, `staff_targets`,
`attendance_sessions`, `staff_visits`, `commission_rules`,
`commission_statements`, plus `partner_users.emergencyContact*`. On those, "own
row vs. all rows" is a genuine data-separation rule, the table is small, and a
wrong policy leaks a colleague's GPS trail rather than a rival's revenue.

Everything else — `merchants.view_assigned`, `pipeline.view_own`,
`overview.revenue_amounts` — is enforced at **one server chokepoint** (§1.3),
with cross-role tests, exactly as the existing capability matrix is. The brief's
"hide, don't disable" rule is unchanged and is additional to both.

**This needs your decision before A7.1.** See Q1 in §6.

### 0.4 `merchants.view_assigned` needs assignment columns that do not exist

`Prospect.assignedToId` already exists (relation `ProspectAssignee` →
`PartnerUser`). **Merchants have nothing.** `Restaurant.partnerId` and
`Pharmacy.partnerId` name the owning partner and no seat.

And there are **two merchant tables**, not one (decision D29: each product has
its own, ids unique only within a product). So `assigned_sales_user_id` is two
columns on two tables, two backfills, and every assignment query is a union —
the same shape `listPartnerMerchants` already deals with.

### 0.5 `support.tickets` gates a screen that does not exist

There is **no ticket model, table, or route** anywhere in this repository. The
partner-portal QA report records this as §4 missing feature. The permission can
be seeded (it costs a row), but A7 must not ship a `/tickets` nav entry that
leads nowhere. Proposed: seed the key, ship no screen, and note it.

Same for **`merchants.login_as`**: `merchants.impersonate` exists in the core
matrix and there is *no partner→merchant impersonation flow* — only HQ→partner
(`server/hq/impersonate.ts`). Seed the key; the flow is its own phase.

### 0.6 The audit log has no actor *role*

`AuditLog` carries `actorType`, `actorStaffId`, `actorEmail` — not the role held
at the time. "Every write → audit_log with actor **and role at time of
action**" is a new column, `actorRole`, plus a change at the one helper
(`createAuditRow`) every partner module already funnels through.

### 0.7 Both "ask before planning" questions are answered by the repo

- **Map: Leaflet `^1.9.4` is already a dependency of `apps/servd`**, with
  `@types/leaflet`, used in three components (`ProspectingSearch`,
  `LocationPicker`, `cashier/MiniMap`). No new dependency, no proposal needed —
  the manager map reuses `LocationPicker`'s tile setup.
- **Private Storage buckets exist and so does a clock-in selfie uploader.**
  `server/storage/clock-photos.ts` already uploads a selfie data-URL to a
  private bucket; `employee-docs.ts` shows the signed-URL read pattern.
  A7 adds one bucket, `partner-attendance`, created by hand like the others
  (there is no bucket-creation code path in this repo).

### 0.8 The PWA pattern exists — do not import DMMA

`apps/servd/public/` already has `sw.js`, `manifest.webmanifest` **and**
`merchant.webmanifest`; `app/(platform)/merchant/layout.tsx` shows the
per-route manifest pattern; `components/offline/{ServiceWorkerRegister,
ConnectivityPill}.tsx` and `lib/offline/{idb.ts,useOnline.ts}` are the offline
queue already in use by the kitchen board.

A7.4's PWA and its IndexedDB queue are therefore **reuse, not new
infrastructure** — a third manifest (`partner-field.webmanifest`), a route
layout, and a queue built on `lib/offline/idb.ts`. Nothing from another repo is
needed and nothing is installed.

### 0.9 Servd already has an HR stack — for the wrong people

`Employee`, `Shift`, `TimeEntry` (with `clockInPhotoUrl`/`clockOutPhotoUrl`),
`EmployeeDocument`, `LeaveRequest` exist and belong to **a merchant's
restaurant staff**, scoped by `restaurantId`. Partner field staff are
`partner_users`, scoped by `partnerId`. These are different axes and must not
share tables — but `TimeEntry` is the shape to copy for
`attendance_sessions`, and its selfie handling is the one to reuse.

---

## 1. A7.1 — Core: roles, permissions, staff data, RLS, tests

### Files

| | |
|---|---|
| `[MODIFY]` | `packages/core/src/identity/roles.ts` |
| `[NEW]` | `packages/core/src/identity/partner-permissions.ts` |
| `[MODIFY]` | `packages/core/src/index.ts` |
| `[NEW]` | `packages/db/prisma/manual/add-partner-staff.sql` |
| `[MODIFY]` | `packages/db/prisma/schema.prisma` |
| `[MODIFY]` | `packages/db/prisma/rls.sql` |
| `[MODIFY]` | `apps/servd/src/server/tenancy/scoped-db.ts` |
| `[MODIFY]` | `apps/servd/src/server/audit/log.ts` |
| `[MODIFY]` | `apps/servd/src/server/partners/auth.ts` |
| `[NEW]` | `apps/servd/src/server/partners/permissions.ts` |
| `[NEW]` | `apps/servd/tests/partners/permission-matrix.test.ts` |
| `[NEW]` | `apps/servd/tests/isolation/partner-staff.test.ts` |

### 1.1 Roles

`PARTNER_USER_ROLES` gains `ops_manager` (4 total). `parseRole` maps unknown →
`sales` as today. The CHECK constraint is dropped and re-added with the fourth
value. **No data migration**: no existing row uses a name that changes.

### 1.2 The permission table

```
partner_role_permissions(
  partnerId, role, permission, allowed, updatedAt,
  PRIMARY KEY (partnerId, role, permission)
)
```

Seeded per partner from the defaults in `packages/core` — 27 keys × 4 roles =
108 rows per partner. Seeding happens in three places: the migration (for the 2
live partners), `hq/convert.ts` (new partner), and lazily on first read, so a
partner created by a path nobody has thought of yet is not permissionless.

**The defaults live in code, the overrides in the table.** A missing row means
"use the default", not "denied" — otherwise adding a 28th permission key in a
later release silently denies it to every existing partner until somebody runs
a backfill.

### 1.3 The chokepoint

`requireWritablePartner(capability?)` in `server/partners/auth.ts` is already
the single gate every partner action passes through, enforced by the drift
guard in `tests/hq/impersonation.test.ts`. A7 widens its argument from
`Capability` (the 14 hard-coded ones) to `PartnerPermission` (the 27 keyed
ones) and resolves through the table.

`CurrentPartner` gains `permissions: Set<PartnerPermission>`, resolved once per
request in `getCurrentPartner()`. **Not cached in the JWT** — the brief is
right and the codebase already agrees: nothing about a seat is in the token, so
"role changes take effect on next request" is already true and stays true.

### 1.4 Schema additions

| Table | Notes |
|---|---|
| `partner_role_permissions` | §1.2 |
| `partner_users` +columns | `mobile`, `zone`, `startDate`, `photoUrl`, `emergencyName`, `emergencyMobile` |
| `staff_events` | `partnerId, partnerUserId, kind, entityType, entityId, occurredAt, payload` — the activity feed's own table, distinct from `audit_logs` (an audit row is *what changed*; a staff event is *what a person did*, including things that change nothing, like a call) |
| `staff_targets` | `partnerId, partnerUserId, month, targetMerchants, targetVisits, targetDemos` |
| `attendance_sessions` | shaped after `TimeEntry`: `checkInAt/checkOutAt`, lat/lng/accuracy per end, `photoPath`, `device`, `autoClosed` |
| `staff_visits` | `partnerId, partnerUserId, subjectType(prospect\|merchant), productId, subjectId, lat/lng/accuracy, distanceMeters, outcome, notes, photoPath, occurredAt, clientRef` |
| `commission_rules` | `partnerId, partnerUserId, type, value, appliesTo, productId, startsAt, endsAt` |
| `commission_statements` + `commission_lines` | mirrors `partner_statements`; append-only, `month` key |
| `restaurants`/`pharmacies` +2 columns | `assignedSalesUserId`, `assignedSupportUserId` |
| `audit_logs` +1 column | `actorRole` (§0.6) |

`clientRef` on `staff_visits` is what makes the offline queue idempotent: the
device mints a UUID, the column is unique, a replayed sync is a no-op. Same
mechanism as `PartnerLedgerEntry.providerRef`.

### 1.5 RLS

Per §0.3: the seven new tables get a partner arm **and** a seat arm; nothing
existing is rewritten. New GUC `app.current_partner_user_id` and
`app.has_permission(text)` in the `app` schema. Every new table is added to
`rls.sql` itself — the D27 backstop sweep would otherwise lock them to
super-admin and the portal would 500.

### 1.6 Tests (must pass before A7.2)

- cross-partner: partner B cannot read A's staff events, targets, attendance,
  visits, commission rows — run as `app_user`, which does not bypass RLS
- cross-role: `sales` sees own rows only on all six seat-scoped tables
- permission-toggle: flipping `allowed` changes the answer on the next request
  with no restart and no re-login
- defaults: every key resolves for every role with an empty table
- the existing drift guard still passes with the widened signature

---

## 2. A7.2 — Permission grid + role-scoped overviews

`[NEW]` `partner/team/permissions/page.tsx`, `components/partner/PermissionGrid.tsx`,
`server/partners/permissions-actions.ts`
`[MODIFY]` `partner/page.tsx`, `server/partners/overview.ts`,
`components/partner/{Overview,PortalShell}.tsx`

- Grid: 27 rows × 4 columns of toggles, `team.permissions` only. Two refusals
  worth naming: **an admin cannot remove `team.permissions` from `admin`**, and
  cannot remove their own — both leave the screen that grants access
  unreachable from inside it, which is the same rule `/hq/team` already
  enforces on the last super admin.
- Overview splits four ways. `overview.revenue_amounts` masks **₱ figures
  only** — the MRR trend *shape* still renders, per the brief. Masking happens
  in the server module, not the component: a number that reaches the client
  masked is a number in the payload.
- `PortalShell` nav derives from permissions instead of the capability matrix.

## 3. A7.3 — Staff directory, assignment, offboarding, activity

`[NEW]` `partner/team/staff/[id]/page.tsx`, `server/partners/staff.ts`,
`staff-actions.ts`, `components/partner/{StaffProfile,StaffActivity,BulkReassign}.tsx`
`[MODIFY]` `partner/team/page.tsx`, `server/partners/{team.ts,reassign.ts}`

- Emergency contact is selected **only** when the reader holds `hr.view_all` —
  not fetched and hidden. Same rule as `getPartnerDetail` and payout secrets.
- **Offboarding is one transaction**: deactivate → reassign merchants
  (both tables) and prospects → revoke sessions → audit. If any step fails
  nothing happens, because a half-offboarded seat still holds a live session.
- Session revocation uses the service-role admin API. `SUPABASE_SERVICE_ROLE_KEY`
  is set on the project; see Q3.
- Activity = `staff_events` ∪ `audit_logs` filtered by actor, date range, CSV
  via the existing `lib/hq/csv.ts` (written, not installed).

## 4. A7.4 — Attendance PWA, visit log, manager view, offline queue

`[NEW]` `partner/attendance/{layout,page}.tsx`, `partner/attendance/manager/page.tsx`,
`public/partner-field.webmanifest`, `server/partners/attendance.ts`,
`attendance-actions.ts`, `server/storage/field-photos.ts`,
`lib/partners/{geo.ts,visit-queue.ts}`, `components/partner/{CheckInCard,VisitForm,StaffMap,AttendanceTable}.tsx`

- `lib/partners/geo.ts` is pure haversine + the 300 m rule + the
  address-missing case, tested at fixed coordinates. No dependency.
- `StaffMap` uses the Leaflet already present, `dynamic(..., {ssr:false})` as
  `LocationPicker` does.
- Auto-close at 23:59 **Manila** — computed from `startOfManilaDay`, not from
  UTC midnight, for the reason `manilaYesterday()` exists. Runs in the daily
  digest cron rather than as a seventh schedule.
- Offline queue on `lib/offline/idb.ts`; `clientRef` (§1.4) makes replay safe;
  `ConnectivityPill` already renders the state.
- Privacy: geolocation requested **only** inside the check-in and visit
  handlers, never on mount, and never watched. Stated on screen.

## 5. A7.5 – A7.7

- **A7.5 scorecard** — `server/partners/scorecard.ts` (pure aggregation over
  `staff_events` + merchants), `/partner/team/scorecard`, "copy last month",
  leaderboard; a `sales` seat's query is filtered server-side to its own row,
  not hidden in the table.
- **A7.6 commissions** — `packages/db/src/commissions.ts` (pure, tested like
  `computeStatement`), `/api/cron/partner-commissions` on `0 1 1 * *` beside
  `freeze-statements`, recorded in `cron_runs`; `/partner/commissions` for own
  and all; mark-paid is append-only. **Statements are frozen** — a rule edited
  in March must not rewrite January, the same reasoning as
  `PartnerLedgerEntry.sharePct`.
- **A7.7 notifications** — 4 new keys in `NOTIFICATION_EVENTS`, a manager
  section in `composeDigest` (pure, tested), queued to `outbound_emails`.
  **Nothing sends**: `CREDENTIALS_ENCRYPTION_KEY` is still unset, so this
  queues exactly as the partner digest shipped yesterday does. Flagged now
  rather than discovered at A7.7.

---

## 6. Questions I cannot answer from the code

**Q1 — RLS scope (§0.3).** Seat-level enforcement in RLS on the seven new
tables + the server chokepoint for the rest (my proposal), or a full
`has_permission()` rewrite of all 22 existing partner policy arms?

**Q2 — Size.** A7 as written is 8 new tables, 2 altered merchant tables, ~7 new
screens, a PWA, a monthly job and an RLS change. That is larger than A1–A6 and
larger than H1–H7. Run all seven sub-phases continuously as before, or stop
after A7.1+A7.2 (the permission model, which everything else depends on) and
re-scope?

**Q3 — Session revocation on offboarding.** Signing a staff member out
everywhere needs the service-role admin API. This codebase has a standing rule
against service-role user *creation* (`/hq/team` and the bootstrap SQL both
refuse to mint passwords). Revocation is not creation, but it is the same key.
Allow it for offboarding, or deactivate the seat and let the session expire
naturally — which leaves a fired salesperson signed in until their token
lapses?

---

## 7. What I will NOT build unless you say otherwise

- A manager approval step for merchant creation — the brief says no.
- A global commission default — the brief says none.
- Payroll, tax, deductions, staff bank details — the brief says no.
- A `/tickets` screen (§0.5) and partner→merchant login-as (§0.5): permission
  keys seeded, no screen, no nav entry.
- Background location tracking of any kind.
- Any new npm dependency. Leaflet, the PWA shell, the IndexedDB helper and the
  CSV writer are all already here.
