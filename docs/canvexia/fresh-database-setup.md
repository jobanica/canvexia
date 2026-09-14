# Standing up a fresh CANVEXIA database

For an **empty** database, which is the only kind this project has. CANVEXIA is
separate from servdph.com and will not be connected to it (D31), so there is no
populated database to migrate and no runbook for doing so.

This is what was actually run against Supabase project `Canvexia`
(`vqiwfemnmxrzsmyncwrf`, ap-southeast-1), not a procedure written from memory.

---

## Do not replay `packages/db/prisma/manual/`

`manual/` is a *history* — how the schema got from nothing to its current shape,
false starts included (`fix-orderitem-menuitem-setnull`,
`restore-storefront-settings`, `drop-referral-program`). Replaying a hundred
files to reach a state you can state directly buys nothing and inherits every
ordering hazard in it. It is a record, not a queue (D31).

Generate the whole schema in one pass instead:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel packages/db/prisma/schema.prisma \
  --script > /tmp/full-schema.sql
```

That output is derived from `schema.prisma`, so by construction it cannot drift
from it. The four migrations the runbook lists are already inside it —
`plans."priceFloor"`, `restaurants."partnerId"`,
`partners."gatewaySubAccountId"`, `partner_ledger_entries` are all in the schema,
so they are all in the script. See D26.

## Step 1 — apply the schema

```bash
DIRECT_URL=... psql "$DIRECT_URL" -f /tmp/full-schema.sql
```

Expect, and check:

| | |
|---|---|
| Tables | 89 |
| Enums | 22 |
| Foreign keys | 85 |
| Indexes | 154 + 89 primary keys = 243 |
| Columns | 873 |

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE') as tables,
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typtype='e') as enums,
  (select count(*) from pg_indexes where schemaname='public') as indexes,
  (select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname='public' and c.contype='f') as foreign_keys;
```

## Step 2 — the policies

```bash
DIRECT_URL=... pnpm --filter @servd/db db:rls
```

Then confirm **zero** tables are left open:

```sql
select
  (select count(*) from pg_tables
    where schemaname='public' and not rowsecurity) as without_rls,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and not c.relforcerowsecurity) as not_forced;
```

Both must be `0`. On Supabase also run the security advisor — it should return
an empty list. It is the thing that catches a table left readable by `anon`,
which is how the hole in D27 was found.

`enable` without `force` is not enough: without FORCE the table owner — the role
Prisma connects as — bypasses every policy, and the isolation guarantee is a lie.

## Step 3 — reference data, and only reference data

`packages/db/prisma/seed.mjs` seeds the three plans **and** two demo restaurants (Mango
Grill, Guava Cafe). Those are isolation-test fixtures. On a real database seed
the plans by hand and leave the demos out:

- `plans` ×3 with their `plan_modules`
- `platform_settings` (`id='platform'`) and `program_settings` (`id='program'`)
- the house partner: `canvexia-davao`, tier `operator`, `hq_collects`, 70% —
  same shape as `HOUSE` in `packages/db/scripts/backfill-house-partner.mjs`

**No backfill.** `packages/db/scripts/backfill-house-partner.mjs` exists to give owners to merchants
that predate the partner column. On an empty database there are none, and it
prints `Nothing to do.`

## Step 4 — prove the isolation, do not assume it

Insert two partners with a merchant each, then read back **as `app_user`** with
no where clause anywhere:

```sql
set local role app_user;
select set_config('app.current_partner_id', '<alpha id>', true);
select slug from restaurants;   -- alpha's merchant, and nothing else
select * from orders;           -- alpha's orders, and nothing else
```

Four things to see:

1. a partner sees its own merchants and **no others**
2. a merchant scope (`app.current_restaurant_id`) sees its own rows only
3. a merchant reading `partner_ledger_entries` gets **nothing** — the
   partner/HQ split is not the merchant's business (D27's sibling reasoning)
4. a partner updating another partner's merchant to claim it affects **0 rows**

Then delete the fixture.

**Run these as a non-superuser.** A superuser bypasses RLS regardless of FORCE,
so every check passes for the wrong reason. `set local role app_user` is enough.

Two things that will catch you out, both of which did:

- **Looking up an id inside the query you are scoping.** `select set_config(...,
  (select id from partners where slug='x'), true)` returns nothing: the
  sub-select runs before the scope is set and `partner_self` correctly refuses
  it. Look the id up as the superuser first, or hardcode it in the fixture.
- **Calling `app.current_partner_id()` directly as `app_user`** fails with
  *permission denied for schema app*. That is not a broken policy. `app_user`
  has no `USAGE` on the `app` schema, and does not need it: a stored policy
  expression references the function by OID, so it resolves at runtime without
  a by-name lookup. Only your ad-hoc `select` needs the grant. If the policies
  return the right rows, they are working.

## Step 5 — what SQL cannot do

- **`DATABASE_URL` / `DIRECT_URL`** — Supabase dashboard → Connect.
- **The super-admin login.** A `platform_admins` row needs a real Supabase Auth
  user to point `authUserId` at; create the auth user first.
- **`CREDENTIALS_ENCRYPTION_KEY`** must be set before any partner or merchant
  gateway credential is written, or you will write rows you cannot decrypt.
