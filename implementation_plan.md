# Partner Portal A7.6 — staff compensation plans

Mode C plan. **Nothing is written yet.** §0 is the part to read first: five of
the brief's premises do not hold against this repository, and one of them
(`comp_statements` is not a new table) changes the shape of the work.

The previous occupant of this filename — the A8 plan, now shipped — is archived
at `docs/canvexia/partner-a8-plan.md`, its checklist at `partner-a8-task.md`.

Traced, silently, nothing modified: `system_architecture.md`, the A8 plan,
`packages/db/prisma/schema.prisma` (the A7 block, `PartnerLedgerEntry`,
`PartnerUser`), `packages/db/prisma/rls.sql` §A7, `packages/db/src/commissions.ts`,
`packages/core/src/identity/partner-permissions.ts`,
`apps/servd/src/server/partners/{commissions,commissions-actions,staff,staff-actions,attendance,auth}.ts`,
`apps/servd/src/app/(platform)/partner/{commissions,team,me,attendance}/**`,
`components/partner/{portal-nav,CommissionsView,StaffDetail}.tsx`,
`app/api/cron/partner-commissions/route.ts`,
`packages/db/prisma/manual/add-partner-staff.sql`, and the live database.

---

## 0. Blocking — the brief's premises vs. what is here

### 0.1 `apps/partner` does not exist

The portal is a route group inside Servd: `apps/servd/src/app/(platform)/partner`.
This is deliberate and recorded (§1, §6b of `system_architecture.md`) — a second
Next process needs its own Prisma client, Supabase cookie handling, middleware
and Vercel project. Every path in this plan is rewritten accordingly:

| Brief | Here |
|---|---|
| `/team/staff/{id}/compensation` | `/partner/team/staff/[id]/compensation` |
| `/team/compensation` | `/partner/team/compensation` |
| `/my/compensation` | `/partner/me/compensation` |

### 0.2 There is no `core` schema

Every table in this project is in `public`. A second Postgres schema means a
Prisma preview feature and annotating ~110 live models. So `core.comp_plans`
reads as `public.comp_plans`. `packages/core` is pure TypeScript and owns no
tables at all — the permission KEYS go there; the tables do not.

### 0.3 `commission_rules` exists — and it is EMPTY

The brief's migration clause fires. What it does not anticipate is that the
whole A7 commission stack has never been used:

```
commission_rules  0     commission_statements  0     commission_lines  0
partner_role_permissions rows on commissions.*  0     partner_users  3
```

So this is not a data migration. Nothing frozen has to survive it, no seat has
an override to preserve, and the old tables can be **dropped** rather than
kept alongside — which is what the brief asks for and is only cheap because it
is being asked for now rather than after a partner has been paid against a
frozen figure.

### 0.4 `comp_statements` is NOT a new table — it is `commission_statements` widened

This is the finding that changes the plan's shape. The brief describes
`comp_statements` as "frozen on the 1st Asia/Manila". That already exists and
works:

- `commission_statements` — one row per seat per `YYYY-MM`, unique on
  `(partnerUserId, month)`, `totalCentavos`, `frozenAt`, `paidAt`,
  `paidReference`, `paidBy`.
- `commission_lines` — the per-merchant explanation, each line snapshotting the
  rule that produced it.
- `/api/cron/partner-commissions` at `0 1 1 * *`, idempotent, one transaction
  per seat, writing a `cron_runs` row and queueing a `commission.ready` email.
- `draftCommission()` — the same function the screen previews with and the cron
  freezes from, so a preview cannot disagree with what lands.

Building a parallel `comp_statements` would leave **two frozen monthly
per-seat statement tables**, one of them still written by a live cron. That is
precisely the failure `system_architecture.md` §6b names about two screens
editing one partner's terms — it is how the number and its explanation come to
disagree. **The plan renames and widens these two tables instead.** All the
brief's properties are kept; none of the working machinery is rebuilt.

### 0.5 Nothing counts days worked

`daily_rate` needs days worked in a Manila month. Attendance has
`todaySession()`, `attendanceWeek()` and `lastSevenDays()` — no monthly count.
One new read, and one real decision behind it (§5 Q3).

### 0.6 What the brief is right about, and stays right about

Not payroll. No SSS, PhilHealth, Pag-IBIG, no tax, no deductions, no bank
transfer, **no bank or GCash details stored anywhere**. The existing
`markCommissionPaidAction` already stores only a free-text reference and the
email of whoever marked it — that property is preserved verbatim, and §8 pins
it with a test that fails if a payout-detail column is ever added to these
tables.

---

## 1. Schema

All four tables in `public`, `text` ids (`String @default(uuid())`), centavos
integers, `YYYY-MM` month keys. Written as one idempotent file
`packages/db/prisma/manual/partner-comp-plans.sql`, mirrored into
`schema.prisma`, then `pnpm --filter @servd/db db:rls`.

### 1.1 `comp_plans` [NEW] — replaces `commission_rules`

One row is a whole arrangement, not one term of it. That is the brief's
central change from A7, where `per_signup` and `pct_recurring` were two rows
that happened to belong to the same person.

```
id, partnerId, partnerUserId
basisKind          'daily_rate' | 'monthly_base' | 'none'
dailyRateCentavos      int   -- set iff basisKind = 'daily_rate'
monthlyBaseCentavos    int   -- set iff basisKind = 'monthly_base'
allowances             jsonb -- [{ key, label, perDayCentavos|perMonthCentavos }]
activationCommissionCentavos  int
recurringKind      'flat' | 'pct' | 'none'      -- ONE, never both
recurringCentavos      int   -- flat: per merchant per month
recurringPctBp         int   -- pct: BASIS POINTS of what settled
recurringMonths        int   -- 0 = forever; flat only
bonusTiers             jsonb -- [{ atLeast, amountCentavos }]
bonusCumulative        bool  default false
startsAt, endsAt, createdAt, createdBy
```

- **`daily_rate` wins over `monthly_base`** — the brief says so. Enforced by a
  CHECK, not by precedence in the maths: a row that sets both is refused at
  write time, so there is never a stored plan whose meaning depends on which
  branch the reader takes first.
- **`recurring_commission` XOR `recurring_pct`** — a CHECK, same reasoning.
- Percentages are **basis points**, exactly as `CommissionRule.value` was, for
  the reason the A7 comment gives: 2.5% in a float is how a statement ends up a
  centavo short of the sum of its own lines.
- **Plans are added and ended, never edited** — the A7 rule, kept. `endsAt` is
  EXCLUSIVE, which is what makes consecutive plans produce exactly one payer.
- `allowances` and `bonusTiers` are jsonb because their shape is a list whose
  length is the operator's business. They are validated in code on the way in
  and on the way out; a malformed blob renders as "plan needs attention"
  rather than a crash or a silent zero.

### 1.2 `comp_templates` [NEW]

Partner-scoped, plus HQ-seeded rows with `partnerId IS NULL` that every partner
can read and none can edit. Same columns as the plan body, no seat, no dates.

The brief's "Field rep (recommended)" is seeded **only if §5 Q1 is answered.**
Its figures are marked `[confirm these figures]` in the brief itself and the
standing rule in this project is that a number on a screen comes from the user
or a placeholder, never from me. Until it is confirmed the migration creates
the table and seeds nothing, and the screen says there are no templates yet.

### 1.3 `comp_statements` — `commission_statements` RENAMED and widened

```
ALTER TABLE commission_statements RENAME TO comp_statements;   -- 0 rows
```
plus new component columns, each nullable-free and defaulting to 0:

```
baseCentavos, allowanceCentavos, activationCentavos,
recurringCentavos, bonusCentavos, adjustmentCentavos
daysWorked          int
planId              text   -- the plan this froze from, for the audit trail
```

`totalCentavos` stays, and stays the sum of the components. A statement must
explain itself — a single figure is the thing nobody can check.

### 1.4 `comp_lines` — `commission_lines` RENAMED and widened

Keeps `ledgerEntryId` and its unique-per-statement index (a replayed job cannot
pay twice). Gains `component` (`'base' | 'allowance' | 'activation' |
'recurring' | 'bonus' | 'adjustment'`) so the base pay and the transport
allowance have somewhere to be itemised, and `label`. `productId`/`merchantId`
become nullable, because a base-pay line is about nobody's merchant.

### 1.5 `comp_adjustments` [NEW]

```
id, partnerId, partnerUserId, month, amountCentavos (signed), reason,
createdAt, createdBy, statementId (null until the month freezes)
```

Signed, append-only, never edited — a correction is another row, the same
convention as `PartnerLedgerEntry`. An adjustment for a month that has already
frozen is refused with the reason on screen rather than silently ignored;
adjusting a frozen month means a row in the next one.

### 1.6 Dropped [DELETE]

`commission_rules` — dropped after `comp_plans` exists. 0 rows; the brief says
do not keep both.

---

## 2. The maths — `packages/db/src/compensation.ts` [NEW]

Pure, no database, its own test, following `commissions.ts` exactly (which
lives in `packages/db` rather than `packages/core` because `apps/servd` is its
only consumer, and one consumer is not a library — §1 of the architecture).

`composeCompensation(month, plan, facts) -> CompStatementDraft` where `facts`
carries days worked, the month's activations, the settlements attributed to the
seat, and the month's adjustments. It returns the six components, the lines
that explain each, and the total.

Decisions it owns, all arguable and none needing a database:

1. **Base.** `daily_rate` → `dailyRate × daysWorked`. `monthly_base` → the flat
   figure, **not prorated by attendance** (a monthly salary that shrinks on a
   day somebody forgot to tap is a payroll dispute, and this is explicitly not
   payroll). Proration against `partner_users.startDate` for a mid-month joiner
   is §5 Q4.
2. **Allowances.** `perDayCentavos × daysWorked`, or `perMonthCentavos` flat.
   One line each, labelled, so ₱120/day transport reads as "Transport — 22 days
   × ₱120".
3. **Activation.** `activationCommissionCentavos` per activation. What counts
   as an activation is §5 Q2 — the existing engine pays off the merchant's
   FIRST SETTLEMENT, which is what keeps the lines from summing past what was
   collected, and I propose keeping that.
4. **Recurring.** `pct` → basis points of what settled, floored, per settlement
   — identical to today's `pct_recurring`. `flat` → `recurringCentavos` per
   assigned merchant per month, **for `recurringMonths` months counted from
   that merchant's first settlement**, which the A7 engine has no concept of
   and is new work: it needs each merchant's first-ever settlement date, which
   `firstPaymentIds()` already computes for a different purpose.
5. **Bonus.** Highest tier REACHED pays, unless `bonusCumulative`, in which case
   every tier reached pays. Tiers are counted against activations in the month.
6. **Adjustments.** Summed, signed, one line each carrying its reason.
7. **Floors.** Every percentage rounds DOWN, as today. A total may not be
   negative: adjustments that would take it below zero are still itemised and
   the total floors at ₱0, because a negative statement is a debt this system
   has no way to collect and should not pretend to record.

---

## 3. Permissions — `packages/core/src/identity/partner-permissions.ts` [MODIFY]

The brief's four keys replace A7's two:

| Old | New |
|---|---|
| `commissions.view_own` | `comp.view_own` |
| `commissions.manage` | `comp.manage` (set plans) |
| — | `comp.view` (see the team's amounts, without setting plans) |
| — | `comp.mark_paid` (split out of manage) |

**The rename has a trap and it is the reason this section is not a find-and-
replace.** A missing row in `partner_role_permissions` means DEFAULT, not
denied — so renaming a key does not deny anything, it silently reverts every
partner's override on it to the default. Here there are **0 such rows**, so the
rename is free today and would not have been in three months. The migration
still carries the `UPDATE ... SET permission = ...` for the two old keys, so
the file is correct if it is ever run against a database that has them.

Defaults proposed:

- `admin` — all four.
- `ops_manager` — `comp.view_own` only, **not `comp.view`.** §5 Q5; I lean no,
  and the reasoning is A7's own: what somebody is paid is a commercial term in
  the same class as the revenue share, and an ops manager who can see the
  team's pay is most of the way to negotiating against it. The key exists so a
  partner who disagrees can grant it without a release.
- `sales`, `support` — `comp.view_own`.

`comp.manage` stays admin-only, as `commissions.manage` was.

Also [MODIFY]: `PERMISSION_LABELS`, `PERMISSION_GROUPS` (the "People and field
work" group — every key must be in exactly one group or it renders nowhere and
can only ever hold its default; A7's own test asserts this).

---

## 4. Screens

### 4.1 `/partner/team/staff/[id]/compensation` [NEW]

The plan editor for one seat. Current plan, its history (ended plans, never
deleted), "start from a template", and the month-to-date preview computed by
the same function the cron freezes with. Behind `comp.manage`; a seat reading
its own lands on 4.3 instead.

### 4.2 `/partner/team/compensation` [NEW]

Everyone, one month: base, allowances, activations, recurring, bonus,
adjustments, total, paid/unpaid. Behind `comp.view`. Mark-paid behind
`comp.mark_paid`, keeping today's append-only refusal (a statement already
marked paid is not re-marked, so a double submit cannot overwrite the date and
reference of the payment that actually happened).

### 4.3 `/partner/me/compensation` [NEW]

Own statements and own current plan, read-only. Behind `comp.view_own`.

### 4.4 `/partner/commissions` [MODIFY → redirect]

A permanent redirect to 4.2 or 4.3 depending on the seat's keys, on the
`/super-admin/partners` precedent. `CommissionsView.tsx` is deleted, not left
orphaned. Nav [MODIFY]: `portal-nav.tsx` "Commissions" becomes "Compensation"
pointing at the right one of the three.

`StaffDetail.tsx` [MODIFY] gains one line linking to 4.1 — behind `comp.manage`,
and it links rather than embeds, so a screen about somebody's record does not
become a screen that pays them.

---

## 5. Questions I cannot answer from the code

**Q1 — the seeded template figures.** The brief marks them
`[confirm these figures]`: daily ₱615, transport ₱120/day, activation ₱500,
recurring ₱100 × 12 months, tiers ≥15 → ₱3,000 and ≥25 → ₱6,000. Standing rule
in this project: a number on a screen comes from you or a placeholder. Confirm
them and the template seeds; say no and the table ships empty with the editor
working.

**Q2 — what is an "activation"?** Two candidates already exist: the
`merchant.converted` staff event (a merchant was signed) and an `activation` /
first settlement on `PartnerLedgerEntry` (money arrived). A7 pays on the
second. Paying on the first pays for a signature that may never settle.
I propose money.

**Q3 — days worked, for someone who does not check in.** `daily_rate` ×
`daysWorked` gives **₱0** for an office seat that never taps a kiosk, and
`partner_users.kioskRequired` tells us some seats are office staff. Options:
(a) `daily_rate` is only offered to seats that check in, and the editor says
so; (b) a per-plan `assumedDaysPerMonth` fallback. I lean (a) — (b) is a number
the system invents about somebody's attendance.

**Q4 — a mid-month joiner on `monthly_base`.** Prorate against
`partner_users.startDate`, or pay the full month? I lean full month and an
adjustment row if the operator disagrees, because proration is the first step
towards payroll.

**Q5 — should `ops_manager` hold `comp.view` by default?** I lean no (§3).

**Q6 — the verification target does not decompose.** The brief checks
₱13,530 + ₱2,640 + ₱6,000 + ₱3,000 = **₱25,170**. The first two are clean: 22
days × ₱615 = ₱13,530 and 22 × ₱120 = ₱2,640. The last two are **both bonus
tiers**, which only sums under `cumulative` — under "highest reached pays" the
same month is ₱22,170. So either the check case is a cumulative plan, or one of
the two is activations (and 6 × ₱500 = ₱3,000 would fit, but 6 activations does
not reach a ≥15 tier). Tell me which and it becomes the fixture in §8.

---

## 6. Files

**[NEW]**
```
packages/db/prisma/manual/partner-comp-plans.sql
packages/db/src/compensation.ts
apps/servd/src/server/partners/compensation.ts          reads + freeze
apps/servd/src/server/partners/comp-actions.ts          plans, adjustments, mark paid
apps/servd/src/lib/partners/comp-plan.ts                validate/describe a plan (pure)
apps/servd/src/app/(platform)/partner/team/staff/[id]/compensation/page.tsx
apps/servd/src/app/(platform)/partner/team/compensation/page.tsx
apps/servd/src/app/(platform)/partner/me/compensation/page.tsx
apps/servd/src/components/partner/CompPlanEditor.tsx
apps/servd/src/components/partner/CompStatements.tsx
apps/servd/tests/partners/compensation.test.ts
apps/servd/tests/partners/comp-plan.test.ts
apps/servd/tests/partners/comp-permissions.test.ts
```

**[MODIFY]**
```
packages/db/prisma/schema.prisma          4 models: 2 new, 2 renamed+widened
packages/db/prisma/rls.sql                comp_plans/comp_templates/comp_statements/
                                          comp_adjustments onto the A7 seat-arm loop;
                                          comp_lines keeps the semi-join
packages/db/src/index.ts                  export compensation.ts
packages/core/src/identity/partner-permissions.ts   the four keys
apps/servd/src/components/partner/portal-nav.tsx
apps/servd/src/components/partner/StaffDetail.tsx
apps/servd/src/app/(platform)/partner/commissions/page.tsx   → redirect
apps/servd/src/app/api/cron/partner-commissions/route.ts     → freezes compensation
apps/servd/src/server/partners/notify.ts                     commission.ready copy
apps/servd/tests/partners/permission-matrix.test.ts
apps/servd/tests/partners/permissions.test.ts
```

**[DELETE]**
```
packages/db/src/commissions.ts                     subsumed by compensation.ts
apps/servd/src/server/partners/commissions.ts
apps/servd/src/server/partners/commissions-actions.ts
apps/servd/src/components/partner/CommissionsView.tsx
apps/servd/tests/partners/commissions.test.ts      cases carried into compensation.test.ts
public.commission_rules                            the table, 0 rows
```

---

## 7. RLS

The four tables go onto the **A7 seat-arm loop** in `rls.sql`, not the
partner-only block — `comp_statements` is a colleague's pay and the seat is a
real boundary there, exactly as a GPS trail is:

```
('comp_plans',        'comp.manage'),
('comp_statements',   'comp.view'),
('comp_adjustments',  'comp.manage'),
```

`comp_lines` keeps the semi-join through its statement. `comp_templates` is
partner-scoped only (no seat column) plus the HQ rows, which are readable by
everyone and writable by super-admin alone.

Every one of them `REVOKE ALL FROM anon, authenticated` — these hold what
people are paid, and the anon key ships in every browser.

Two things that must be true afterwards and will be checked, not assumed: the
backstop sweep has not left any of them `super_only`, and no table is missing
FORCE. Postgres is unreachable from this sandbox, so the verification runs as
SQL over the Supabase Management API (`sqlc.sh`) — which is how §1.3's row
counts above were established, and is a substitute for running the suite rather
than the same thing.

---

## 8. Tests

- `comp-plan.test.ts` — the two XOR rules refuse at the boundary; a plan
  setting both a daily rate and a monthly base is rejected, not resolved.
- `compensation.test.ts` — the six components; `endsAt` exclusive produces
  exactly one payer across a plan change; the ≥15/≥25 tiers under both
  `cumulative` settings; `recurringMonths` expiring in month 13; floors; the
  §5 Q6 fixture once it is settled; **and the zero case** — a seat with no plan
  freezes a ₱0 statement, because a missing row reads as "the job did not run".
- `comp-permissions.test.ts` — every new key is in exactly one group; `admin`
  cannot be left unable to reach the screen; the old keys are gone from the
  labels, the grid and the nav.
- A source-level test that no column on the four tables matches
  `/bank|account_?number|gcash|routing/i`. The brief forbids storing them; a
  test is what makes that survive the next release.
- Freeze idempotence, carried over from `commissions.test.ts` unchanged.

Run: `pnpm --filter servd test`, then root `pnpm build`.

---

## 9. Sequencing

1. §1 schema + §7 RLS, verified over the Management API.
2. §2 maths, with §8's tests, before any screen.
3. §3 permissions.
4. §4 screens, `/partner/commissions` redirect last so nothing is unreachable
   in between.
5. Cron cut over; one manual firing against the real database to prove a
   statement freezes and stays frozen.
6. `system_architecture.md` gains an A7.6 section — the save state, per the
   protocol.

---

## 10. HALT

Awaiting approval, and answers to §5 Q1–Q6. Q1 and Q6 block a seeded template
and the verification fixture respectively; Q2–Q5 have a stated lean and can be
taken as proposed if you would rather not decide each one.
