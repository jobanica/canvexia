# Deploy runbook — taking CANVEXIA to the live database

Four hand-run migrations, then the policies, then the backfill. **Rehearsed end
to end** on a throwaway PostgreSQL 16 database seeded to production's shape, from
the pre-CANVEXIA schema — not a list written from memory.

Nothing here has been run against your live database. I have no credentials to it
and would not use them unattended if I did.

> **This is for servdph.com — an already-populated database.** For an *empty*
> one, none of it applies: see `fresh-database-setup.md`, which is what was run
> against the CANVEXIA project. A database built from `schema.prisma` is already
> past all four migrations below (D26).
>
> Step 2 also now closes a hole that is live on servdph.com today: twelve tables
> had no RLS policy at all, and Supabase grants the browser-side `anon` key full
> read/write on anything unprotected. `prospect_leads` is one of them. See D27.

---

## The one rule that matters most

**Run the migrations BEFORE deploying the new code.**

This is not caution, it is a measured failure. With the new code against the old
database, the rehearsal produced:

```
PrismaClientKnownRequestError:
Invalid `prisma.plan.upsert()` invocation:
The column `plans.priceFloor` does not exist in the current database.
```

Prisma returns every scalar column when a query has no `select`, so one
un-migrated column breaks writes that never mention it. The codebase already
carries this scar — see the comment on `Restaurant.autoPrintReceipt`, where a
plain Prisma default broke restaurant creation the same way.

Order: **migrate → `db:rls` → backfill → deploy.**

---

## Step 0 — find out where production actually is

Do this first. These migrations are hand-run, so the live schema may already be
behind in ways unrelated to CANVEXIA.

```bash
cd apps/servd
node scripts/schema-drift.mjs          # prints SQL; paste into the Supabase editor
```

Zero rows means the database matches the code. Anything under `missing column` or
`MISSING TABLE` is an older migration in `prisma/manual/` that never ran — **sort
that out before starting**, or you will not be able to tell CANVEXIA's failures
from the backlog's.

The same query also reports `NO RLS POLICY` rows. Those are expected until step 2.

## Step 1 — the four migrations, in this order

Run in the Supabase SQL editor. Each is idempotent and ends with its own
verification select; each should return `true`.

| # | File | What it adds |
|---|---|---|
| 1 | `prisma/manual/add-partner-tenancy.sql` | `restaurants."partnerId"`, the `Partner` operator fields, nullable `audit_logs."restaurantId"` + `partnerId` + `actorType` |
| 2 | `prisma/manual/add-plan-price-floor.sql` | `plans."priceFloor"`, defaulting to 0 = no floor |
| 3 | `prisma/manual/add-partner-subaccount.sql` | `partners."gatewaySubAccountId"` |
| 4 | `prisma/manual/add-partner-ledger.sql` | `partner_ledger_entries` + its unique index on `providerRef` |

Order is only load-bearing for #1 — everything else reads `partnerId`. Running
them in this order is simply how it was rehearsed.

## Step 2 — install the policies

```bash
DIRECT_URL=... node scripts/apply-rls.mjs        # or: npm run db:rls
```

Expect `✅ RLS policies applied.`

Then re-run the step 0 drift query. **Expect zero rows** — no column drift and no
RLS gaps. In the rehearsal this is exactly what it returned.

This step also closes a gap that predates CANVEXIA: thirteen tables holding tenant
data had no policy at all (D7).

## Step 3 — the backfill, dry run

```bash
node scripts/backfill-house-partner.mjs
```

Writes nothing. It prints a plan:

```
  Unassigned restaurants      : 3
    → to the partner who built them: 1
    → to the house partner         : 2
  Restaurants already assigned: 0 → left alone
```

**Read those numbers before going further.** The split between the two lines is
the thing to check: merchants a partner built stay with that partner, and only
genuinely direct customers go to CANVEXIA Davao. Getting that backwards was a real
bug in the first version of this script (D13).

Override the house partner's details with `HOUSE_PARTNER_NAME` /
`HOUSE_PARTNER_EMAIL` if `CANVEXIA Davao` / `davao@canvexia.ph` are not what you
want on the record — it is created on first `--apply` and not easily renamed
afterwards.

## Step 4 — the backfill, for real

```bash
node scripts/backfill-house-partner.mjs --apply
```

**Take a database snapshot first.** This is the one step with no clean undo: once
run, nothing distinguishes a restaurant backfilled by mistake from one a partner
signed five minutes later.

It is idempotent — re-running prints `Nothing to do.` — but that protects against
running it twice, not against running it with the wrong numbers.

## Step 5 — confirm, then deploy

```sql
-- every merchant should now have an owner; expect 0
select count(*) from restaurants where "partnerId" is null;

-- and they should be where you expect
select p.name, count(*) from restaurants r
  join partners p on p.id = r."partnerId"
 group by p.name order by 2 desc;
```

Then deploy the application.

---

## Gotchas found during the rehearsal

**`partners` is now RLS-protected.** A query like

```sql
select set_config('app.current_partner_id', (select id from partners where slug='x'), true);
```

returns nothing, because the sub-select runs before the scope is set and the
`partner_self` policy correctly refuses it. Look the id up as the superuser
first. This caught me out; it is the policy working, not a fault.

**Isolation tests must not run as a superuser.** Superusers bypass RLS regardless
of `FORCE ROW LEVEL SECURITY`, so every isolation test fails in a way that looks
like a regression. Run them as a non-superuser role that is a member of
`app_user`.

---

## What the rehearsal proved

Seeded to production's shape — two direct customers and one partner-built
storefront — from the pre-CANVEXIA schema:

| Check | Result |
|---|---|
| Four migrations, in order | ✅ all clean, all self-checks true |
| Column drift afterwards | ✅ none |
| `db:rls` | ✅ applied |
| Drift + RLS coverage after | ✅ 0 rows |
| Backfill dry run | ✅ wrote nothing (partners=1, assigned=0) |
| Backfill `--apply` | ✅ 1 kept with its builder, 2 to the house partner |
| Ownership | ✅ `cebu-diner → Cebu Partner`, `direct-one/two → CANVEXIA Davao` |
| House partner sees | ✅ `direct-one, direct-two` — and nothing else |
| Cebu Partner sees | ✅ `cebu-diner` — and nothing else |
| **DB-backed suite** | ✅ **38/38 across 6 files** |

## After this is done

Two things are queued behind it:

1. **Move the schema to `packages/db`** (D25). Deliberately sequenced after this,
   because ~20 user-facing error strings tell an operator to *"run
   prisma/manual/add-X.sql"* and this runbook points at the same paths.
2. **Build the first new vertical** (D24).
