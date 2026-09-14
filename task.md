# Next: point the app at the CANVEXIA database, then move the schema

The CANVEXIA database is **provisioned and verified**. Supabase project
`Canvexia` (`vqiwfemnmxrzsmyncwrf`, ap-southeast-1).

There was nothing to wipe — the project was empty when I opened it. No
application tables, no auth users, no storage objects, only Supabase's own
`auth` / `storage` / `vault` schemas.

## What is in it

Schema generated in one pass from `schema.prisma`, not by replaying
`packages/db/prisma/manual/` (D26 — the four pending migrations are for *servdph.com*, which
is already-populated; a database built from the schema is past them).

| | |
|---|---|
| Tables / enums / FKs | 89 · 22 · 85 |
| Indexes | 154 + 89 primary keys |
| Columns | 873 |
| RLS enabled **and forced** | 89 of 89 |
| Policies | 92 |
| Supabase security advisor | **0 findings** |

Reference data only — three plans, their `plan_modules`, the two singleton
settings rows, and the house partner **CANVEXIA Davao** (`canvexia-davao`,
`hq_collects`, 70%). **No demo restaurants.** `packages/db/prisma/seed.mjs` would have
created Mango Grill and Guava Cafe; those are test fixtures, not a live system.
Say the word if you want them for smoke-testing.

## Isolation was proved, not assumed

Two partners and two merchants, then read back under `set role app_user` with
**no where clause anywhere**:

- partner Alpha → its own merchant, its own orders, its own partner row · nothing else
- merchant Beta → its own row and orders; `partner_ledger_entries` returns **nothing** (the split is not the merchant's business)
- Alpha updating Beta's merchant to claim it → **0 rows**

Fixture deleted afterwards; the tables are back to empty.

## One thing I found and fixed — it affects Servd too

Supabase grants `anon` full read/write on every table in `public`, and the anon
key ships in the browser. `rls.sql` covered 77 of 89 tables. The twelve it
missed included **`prospect_leads`** — names, phones, emails and addresses of
sales leads — and `platform_settings`, which is world-*writable*.

Confirmed rather than assumed: a canary row read back under `set role anon`
before the fix, and returned nothing after.

`rls.sql` now ends with a **sweep** — any `public` table with no policy by that
point gets RLS forced and a super-admin-only policy — plus `search_path` pinned
on the three `app.*` helpers. Written as a sweep because this exact list drifted
twelve times; a new table now arrives locked. Safe because all twelve are
reached only through `systemDb()`, checked per model against its callers.

**servdph.com has this hole right now.** It closes the next time `npm run db:rls`
runs, which is step 2 of the deploy runbook. See D27.

## What is left for you

1. **Set `DATABASE_URL` / `DIRECT_URL`** to this project (Supabase dashboard →
   Connect). I do not have the database password and did not want it.
2. **Create the super-admin auth user** and its `platform_admins` row — that
   needs Supabase Auth, not SQL.
3. **`CREDENTIALS_ENCRYPTION_KEY`** must be set before any partner or merchant
   gateway credentials are written.

## Then, in order

1. **Apply the four migrations to servdph.com** — `docs/canvexia/deploy-runbook.md`,
   unchanged and still correct. This database being ready does not advance that
   one; they are separate databases with separate histories.
2. ~~Move the schema to `packages/db`~~ — **done.** D25's objection was that ~20
   user-facing error strings name `prisma/manual/add-X.sql` and are read exactly
   when something is already broken. That is an argument for moving them
   *atomically with the directory*, which is what happened, not for waiting.
3. **Build the first vertical** (D24) — in progress.
