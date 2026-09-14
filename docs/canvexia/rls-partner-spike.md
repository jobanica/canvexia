# Spike — how should the partner axis be enforced in RLS? (Q6)

**Status: RUN. Answered — hybrid, and `orders` is the table that needs it.**

Measured on a throwaway PostgreSQL 16 cluster during Phase 1, seeded to 50
partners / 2,000 restaurants / 200,000 orders. Read [Results](#results) for the
numbers and [Decision](#decision) for what was done about them.

Caveat carried through everything below: this is a container, not production
hardware, and 200k orders, not 10M. **The ratio is the finding; the absolute
milliseconds are not.** The ratio is also the conservative half — Option 2's cost
grows with the number of rows scanned, so at 10M orders the gap widens rather
than closes.

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
(`packages/db/prisma/rls.sql`). The question is only whether it holds up one level wider.

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

Warm, `EXPLAIN (ANALYZE)` execution time, second run of each. 50 partners ×
40 restaurants × 100 orders = 200,000 orders; the measured partner owns 4,000 of
them.

| Query | Option 2 (join) | Option 1 (denormalise) | Ratio |
|---|---|---|---|
| 1 · merchant list — `select id, name from restaurants` | **0.75 ms** | same (table unchanged) | — |
| 2 · order count — `select count(*) from orders` | **486 ms** | **97 ms** | **5.0×** |
| 3 · revenue rollup — `sum(total)` over 30 days | **763 ms** | **101 ms** | **7.6×** |
| 4 · merchant drill-down — by `restaurantId`, limit 50 | **0.12 ms** | same | — |

The split is sharp and it is not about the join being slow in general.

**Anything with a selective predicate is free.** The drill-down runs at 0.12 ms
because `orders_restaurantId_createdAt_idx` narrows to one merchant first and the
policy is then evaluated against 50 rows. The merchant list is 0.75 ms because
`restaurants_partnerId_idx` answers it directly — the plan confirms a
`Bitmap Index Scan on restaurants_partnerId_idx` with
`Index Cond: ("partnerId" = NULLIF(current_setting('app.current_partner_id'...)))`.

**Anything unfiltered pays the semi-join per row.** Queries 2 and 3 have no
predicate other than the policy itself, so all 200,000 rows are scanned and each
one is checked against `restaurants`. That is where 5–7.6× comes from, and it is
the shape that gets worse with scale, not better.

The uncomfortable part: queries 2 and 3 are not synthetic. They are the partner
dashboard's headline number and the monthly statement job — the two things the
revenue share is actually computed from.

---

## Decision

**Hybrid, as the rule anticipated — but not yet, and the reason matters.**

Against the rule agreed above: Option 2 fails the ~200 ms bar on exactly two
queries and passes it by three orders of magnitude on the rest. That is the
textbook hybrid case: denormalise `orders`, join for everything else.

**Phase 1 ships the join everywhere anyway.** Three reasons, in order of weight:

1. **Nothing runs those queries yet.** The partner portal has no dashboard
   aggregate and no statement job; both arrive in Phase 3–4. Today the hybrid
   would be an untested fast path for a caller that does not exist.
2. **Partner reassignment lands first, in Phase 2.** A denormalised `partnerId`
   is a second source of truth, and reassignment is precisely the operation that
   makes it disagree with `restaurants."partnerId"`. Building the reassignment
   path first means the sync requirement is written against real code instead of
   imagined code.
3. **Correctness is identical either way.** This is purely a read-speed
   difference on queries nobody makes yet. Isolation holds the same under both —
   the cross-partner tests pass against the join today.

**Scheduled for Phase 4a**, to land with the statement job that needs it:

- `orders."partnerId"`, backfilled from `restaurants."partnerId"`, indexed.
- The policy on `orders` switches to the column comparison.
- **A reassignment step that rewrites it**, with a test asserting that moving a
  merchant between partners leaves no order pointing at the old one. Without that
  test the denormalisation is a latent cross-partner leak, which is a strictly
  worse failure than a slow dashboard.
- Re-measure `order_items` before denormalising it too; it was not measured here
  and it is a semi-join through a semi-join, so it may need the same or may not
  be reached at all.

## Prerequisite

Both options assume `restaurants."partnerId"` exists and is backfilled — done in
Phase 1 (`packages/db/prisma/manual/add-partner-tenancy.sql`,
`scripts/backfill-house-partner.mjs`).

## Reproducing

Seed and harness are in this document's history; the short version is
`initdb` → `prisma db push` → `node scripts/apply-rls.mjs` → insert partners,
restaurants and orders with `generate_series` → run each query twice inside
`begin; select set_config('app.current_partner_id', …, true); … rollback;` as a
**non-superuser** role that is a member of `app_user`. A superuser bypasses RLS
entirely and will measure a policy that never ran.
