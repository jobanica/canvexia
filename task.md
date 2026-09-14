# Next: apply the migrations to the live database

**I cannot do this step.** No `DATABASE_URL`, no `.env`, and the Supabase MCP
server needs authorization that a non-interactive session cannot do. Applying
migrations to a live database is also not something to run unattended.

What is ready instead: **`docs/canvexia/deploy-runbook.md`**, rehearsed end to end
on a throwaway PostgreSQL 16 database seeded to production's shape, from the
pre-CANVEXIA schema. Not a list written from memory.

## Correction

It is **four** migrations, not seven. I had been repeating that number without
checking it; verified against `main`:

1. `add-partner-tenancy.sql`
2. `add-plan-price-floor.sql`
3. `add-partner-subaccount.sql`
4. `add-partner-ledger.sql`

Then `db:rls`, then the backfill. Six steps, four of them SQL files.

## The rule the rehearsal proved

**Migrate before deploying the new code.** With the new code against the old
database the rehearsal produced, verbatim:

    The column `plans.priceFloor` does not exist in the current database.

Prisma returns every scalar column when a query has no `select`, so one
un-migrated column breaks writes that never mention it — the same failure the
codebase already documents on `Restaurant.autoPrintReceipt`.

## What the rehearsal covered

Seeded as production is shaped — two direct customers, one partner-built
storefront — then run in order: four migrations ✅ · no column drift ✅ ·
`db:rls` ✅ · drift + RLS coverage 0 rows ✅ · backfill dry run wrote nothing ✅ ·
`--apply` kept 1 with its builder and moved 2 to the house partner ✅ ·
house partner sees only its two, Cebu Partner only its one ✅ ·
**DB-backed suite 38/38 across 6 files** ✅.

## Queued behind it

1. **Move the schema to `packages/db`** (D25) — sequenced after, because ~20
   user-facing error strings and this runbook all point at
   `prisma/manual/add-X.sql`.
2. **Build the first vertical** (D24).
