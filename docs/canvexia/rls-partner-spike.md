# Spike — how should the partner axis be enforced in RLS? (Q6)

**Status: designed, not yet run.** This environment has no `DATABASE_URL` and the
Supabase MCP server is unauthorized, so the numbers below are blank by design.
Run it against a staging database with production-shaped row counts and fill in
the table; the decision follows from the result, not from taste.

---

## The question

Phase 1 adds a partner scope to tenant isolation. Two ways to give the database
something to filter on:

**Option 1 — denormalise.** Add `partnerId` to every tenant table alongside the
`restaurantId` that is already there, and make the policy a column comparison.

**Option 2 — join.** Add `partnerId` to `restaurants` only, and have the policy
reach the partner through the restaurant.

The CANVEXIA brief specifies Option 1 ("every tenant-data table carries
`partner_id` and `merchant_id`"). It is worth a measurement before committing,
because the cost difference is large and lopsided:

|  | Option 1 (denormalise) | Option 2 (join) |
|---|---|---|
| New columns | ~56 (every table with `restaurantId`) | 1 |
| Backfill on a live DB | 56 `UPDATE`s across every tenant table | 1 `UPDATE` on `restaurants` |
| Write path | every insert must carry a correct `partnerId` | nothing changes |
| Denormalisation drift | a restaurant reassigned to a new partner must rewrite every row it owns | reassignment is one column |
| Read cost | column comparison | subquery / semi-join per policy check |

Option 2 is dramatically cheaper everywhere except read time. **So the only
question worth measuring is whether its read cost is acceptable.** If it is,
Option 2 wins on every other axis — including on correctness, since a
denormalised `partnerId` is a second source of truth that can disagree with
`restaurants.partnerId`, and partner reassignment (an explicit HQ feature in
Phase 2) is exactly the operation that makes them disagree.

---

## Candidate policies

Helper, same shape as the existing `app.current_restaurant_id()`:

```sql
create or replace function app.current_partner_id() returns text
  language sql stable as $$
    select nullif(current_setting('app.current_partner_id', true), '')
$$;
```

**Option 1 — column comparison**

```sql
create policy partner_isolation on orders
  using (
    app.is_super_admin()
    or "restaurantId" = app.current_restaurant_id()
    or "partnerId"    = app.current_partner_id()
  );
```

**Option 2 — semi-join through `restaurants`**

```sql
create policy partner_isolation on orders
  using (
    app.is_super_admin()
    or "restaurantId" = app.current_restaurant_id()
    or exists (
      select 1 from restaurants r
      where r.id = orders."restaurantId"
        and r."partnerId" = app.current_partner_id()
    )
  );
```

Option 2's shape is not new to this codebase — `modifiers`, `order_items`,
`payments` and `sms_messages` already isolate through a parent exactly this way
(`prisma/rls.sql`). The question is only whether it holds up one level wider.

Index required either way:

```sql
create index concurrently if not exists restaurants_partner_id_idx
  on restaurants ("partnerId");
```

---

## Method

Seed a staging database to a shape CANVEXIA plausibly reaches in two years —
overshoot rather than undershoot, since the point is to find the breaking point:

| | Count |
|---|---|
| Partners | 50 |
| Restaurants per partner | 40 (2,000 total) |
| Orders per restaurant | 5,000 (10M total) |
| Order items per order | 3 (30M total) |

Then run each query under both policies, as a partner (`app.current_partner_id`
set, `app.current_restaurant_id` unset), with `EXPLAIN (ANALYZE, BUFFERS)`.

Discard the first run of each — the comparison that matters is warm cache, since
that is what a partner portal page hits.

### Queries to measure

These are the shapes the partner portal actually issues, not synthetic ones.

1. **Partner merchant list** — `select id, name from restaurants` (the dashboard).
2. **Partner order count** — `select count(*) from orders`, no where clause. The
   worst case: the policy is the only filter.
3. **Partner revenue rollup** — `select sum(total) from orders where "createdAt" >= now() - interval '30 days'`.
   The statement job's shape (Phase 4c).
4. **Single merchant drill-down** — `select * from orders where "restaurantId" = $1 order by "createdAt" desc limit 50`.
5. **Nested child read** — `select count(*) from order_items`, which under Option 2
   is a semi-join through a semi-join.

Query 5 is the one to watch. `order_items` already isolates via `orders`; adding
the partner arm makes it two levels deep, and if anything falls over it will be
there.

### Harness

```sql
-- Run as a partner, not as super-admin: is_super_admin short-circuits the
-- policy and would measure nothing.
begin;
select set_config('app.current_partner_id', '<a seeded partner id>', true);
explain (analyze, buffers) select count(*) from orders;
explain (analyze, buffers) select count(*) from order_items;
explain (analyze, buffers)
  select sum(total) from orders where "createdAt" >= now() - interval '30 days';
rollback;
```

---

## Results

Fill in. Times in ms, warm.

| Query | Option 1 (denormalise) | Option 2 (join) | Ratio |
|---|---|---|---|
| 1 · merchant list | | | |
| 2 · order count | | | |
| 3 · revenue rollup | | | |
| 4 · merchant drill-down | | | |
| 5 · nested child read | | | |

---

## Decision rule

Agreed in advance, so the result is not argued with after the fact:

- **Option 2** if every query stays under ~200 ms warm and no plan degrades to a
  sequential scan of a child table. The operational savings are worth a constant
  factor on read.
- **Option 1**, but only for the specific tables that fail, if one or two queries
  blow up while the rest are fine. A hybrid is legitimate: denormalise `orders`
  and `order_items` and join for everything else. Each denormalised table then
  needs a trigger or an explicit reassignment step to stay consistent with
  `restaurants.partnerId`.
- **Option 1 across the board** only if Option 2 is broadly unacceptable. Then
  the backfill and write-path changes are scoped as their own phase, not folded
  into Phase 1, and partner reassignment gets a rewrite step with a test.

## Prerequisite

Both options assume `restaurants."partnerId"` exists and is backfilled. That is
Phase 1's first migration and does not depend on this spike's outcome — so it can
proceed in parallel.
