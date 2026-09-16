-- ============================================================================
-- Servd — Row-Level Security (RLS)
--
-- This is the SECOND, authoritative layer of tenant isolation. Even if the
-- application forgets a `where restaurantId = …` filter, Postgres physically
-- refuses to return another restaurant's rows.
--
-- HOW IT WORKS
--   The app opens a transaction and runs:
--       SET LOCAL app.current_restaurant_id = '<the logged-in user restaurant>';
--   System tasks (webhooks, super-admin, seeding) instead run:
--       SET LOCAL app.is_super_admin = 'on';
--   Policies below read those settings via the helper functions.
--
--   We use FORCE ROW LEVEL SECURITY so that even the table owner (the role
--   Prisma connects as) is subject to the policies — without FORCE, the owner
--   would silently bypass RLS and the isolation guarantee would be a lie.
--
-- COLUMN NAMES: Prisma maps tables to snake_case (@@map) but leaves COLUMNS in
-- camelCase, so the foreign keys are "restaurantId", "modifierGroupId", etc.
-- They MUST be double-quoted here or Postgres folds them to lowercase and the
-- policies fail to compile.
--
-- APPLY WITH:  npm run db:rls   (after `prisma migrate`/`db push`)
-- ============================================================================

create schema if not exists app;

-- The restaurant the current request is scoped to (NULL if unset).
-- Returns TEXT: Prisma stores ids as String/TEXT (not native uuid), so the
-- comparison columns ("restaurantId", restaurants.id) are TEXT too.
create or replace function app.current_restaurant_id() returns text
  language sql stable as $$
    select nullif(current_setting('app.current_restaurant_id', true), '')
$$;

-- Whether the current request is a trusted platform/super-admin context.
create or replace function app.is_super_admin() returns boolean
  language sql stable as $$
    select coalesce(current_setting('app.is_super_admin', true) = 'on', false)
$$;

-- The CANVEXIA partner (city operator) the current request is scoped to, NULL
-- if unset. Set by partnerDb() the way current_restaurant_id is set by
-- tenantDb().
--
-- Reached through restaurants."partnerId" rather than through a partnerId
-- denormalised onto every tenant table. One column instead of fifty-odd, one
-- backfill instead of fifty-odd, and — the part that actually decides it —
-- exactly one place for a merchant's owner to be recorded. Reassigning a
-- merchant to a new partner is an HQ feature in Phase 2; with the id copied
-- across every table it owns, reassignment means rewriting all of them, and
-- any row missed is a row served to the wrong operator.
create or replace function app.current_partner_id() returns text
  language sql stable as $$
    select nullif(current_setting('app.current_partner_id', true), '')
$$;

-- The Resceta (pharmacy) merchant the current request is scoped to.
--
-- A second product means a second merchant axis, not a second copy of this
-- file: `pharmacies` carries `partnerId` exactly as `restaurants` does, so the
-- partner arm below is the same expression with different table and column
-- names. See MERCHANT_AXES in packages/core/src/tenancy/merchant.ts — the
-- array in the loop below is its other copy, and a test asserts they agree.
create or replace function app.current_pharmacy_id() returns text
  language sql stable as $$
    select nullif(current_setting('app.current_pharmacy_id', true), '')
$$;

-- The partner SEAT the current request is scoped to (A7), NULL if unset. Set by
-- partnerDb() alongside the partner id.
--
-- A SECOND AXIS, NOT A REPLACEMENT. Every policy written before A7 asks one
-- question — does this row belong to the partner in the GUC — and that is the
-- boundary that keeps one city operator out of another's book. The staff tables
-- at the end of this file ask a second question too, because there the SEAT is
-- the boundary: a salesperson has no business in a colleague's GPS trail.
--
-- The older policies are deliberately NOT widened to consult this. Making one
-- policy answer both questions doubles the number of ways the TENANT boundary
-- can be got wrong, in the file where a mistake leaks a rival operator's
-- commercial terms. Per-seat rules everywhere else are enforced at the
-- requireWritablePartner() chokepoint, with cross-role tests.
create or replace function app.current_partner_user_id() returns text
  language sql stable as $$
    select nullif(current_setting('app.current_partner_user_id', true), '')
$$;

-- Does the seat in the GUC hold this permission, for the partner in the GUC?
--
-- Answers from an explicit OVERRIDE row only. The defaults live in
-- packages/core and this function cannot see them, so it means "explicitly
-- granted", not "allowed". The policies use it only where an explicit grant is
-- the whole rule; anything subtler is the chokepoint's job.
--
-- STABLE, so Postgres evaluates it once per statement rather than once per row.
-- SECURITY DEFINER with a pinned search_path so it can read the permission
-- table under a policy that would otherwise recurse into it.
create or replace function app.has_permission(perm text) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
    select coalesce(
      (select p."allowed"
         from public.partner_role_permissions p
         join public.partner_users u on u."id" = app.current_partner_user_id()
        where p."partnerId" = app.current_partner_id()
          and p."role" = u."role"
          and p."permission" = perm),
      false)
$$;

-- ----------------------------------------------------------------------------
-- app_user: a NON-privileged role (no BYPASSRLS) that tenantDb() switches to,
-- so Row-Level Security is always enforced even if the pooled connection role
-- could otherwise bypass it. We grant it table access + let the app's
-- connection role assume it.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public
  grant usage, select on sequences to app_user;

-- Allow the current (app) connection role to SET ROLE app_user.
do $$
begin
  execute 'grant app_user to ' || quote_ident(current_user);
exception when others then null; -- already a member / insufficient priv: ignore
end $$;

-- ----------------------------------------------------------------------------
-- Tenant tables: enable + FORCE rls and add a tenant policy for every table
-- with a direct merchant foreign key — "restaurantId" for Servd, "pharmacyId"
-- for Resceta, one pass of the loop per axis.
--
-- This list used to be written out by hand, and it drifted. Adding a model and
-- remembering to add it here are two separate acts, and the second one was
-- missed thirteen times: audit_logs, reservations, gift_cards, gift_card_txns,
-- cash_movements, delivery_settings, delivery_bookings, cart_leads,
-- happy_hours, shift_notes, push_subscriptions, menu_item_variants and
-- menu_item_servings all held tenant data with NO policy at all. Nothing was
-- leaking them — every read goes through tenantDb()/systemDb() — but the second
-- layer of isolation, the one that is supposed to hold when the app forgets its
-- where clause, simply was not there.
--
-- Asking the catalogue instead means a new tenant table is covered the moment
-- it exists, which is the only version of this that stays true.
--
-- The exclusion list is the other half. A few tables carry a merchant column and
-- are NOT tenant-owned: platform data that happens to name a restaurant. Those
-- get a super-admin-only policy further down. The DEFAULT for a merchant-keyed
-- table is tenant isolation — anything added to this array needs a reason of
-- the same kind, in a comment beside it.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  axis record;
  -- One row per product. Each names the merchant table, the column its tenant
  -- tables carry, and the GUC that scopes a request to one merchant. Mirrors
  -- MERCHANT_AXES in packages/core; tests/isolation/merchant-axes.test.ts fails
  -- if the two drift.
  axes text[][] := array[
    array['restaurants', 'restaurantId', 'app.current_restaurant_id'],
    array['pharmacies',  'pharmacyId',   'app.current_pharmacy_id']
  ];
  platform_owned text[] := array[
    'platform_feedback', -- owners' feedback ABOUT Servd, read by the super-admin
    'crm_clients',       -- the founder's own sales pipeline
    'customer_events',   -- bizops funnel events
    'email_messages',    -- acquisition mail to leads, not a tenant's diners
    'email_sends',       -- ditto (follow-up tracks)
    'partner_ledger_entries' -- see the policy below: partner + HQ only
  ];
begin
  for axis in
    select axes[i][1] as merchant_table,
           axes[i][2] as fk_column,
           axes[i][3] as guc
      from generate_subscripts(axes, 1) as i
  loop
    for t in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables tb
          on tb.table_schema = c.table_schema
         and tb.table_name = c.table_name
       where c.table_schema = 'public'
         and c.column_name = axis.fk_column
         and tb.table_type = 'BASE TABLE'
         and c.table_name <> axis.merchant_table
         and not (c.table_name = any(platform_owned))
       order by c.table_name
    loop
      execute format('alter table %I enable row level security;', t);
      execute format('alter table %I force row level security;', t);
      execute format('drop policy if exists tenant_isolation on %I;', t);
      -- Three ways a row is visible: the trusted system context, the merchant it
      -- belongs to, or the partner that owns that merchant. The partner arm is a
      -- semi-join through the merchant table; with its partnerId index in place
      -- it is an index lookup per row group, not a scan.
      --
      -- %1$I rather than a bare column reference in the sub-select: unqualified
      -- "restaurantId" happens to resolve to the outer table today only because
      -- restaurants has no column by that name, which is a coincidence and not a
      -- guarantee worth resting fifty policies on.
      execute format($f$
        create policy tenant_isolation on %1$I
        using (
          app.is_super_admin()
          or %1$I.%2$I = nullif(current_setting(%3$L, true), '')
          or exists (
            select 1 from %4$I m
            where m.id = %1$I.%2$I
              and m."partnerId" = app.current_partner_id()
          )
        )
        with check (
          app.is_super_admin()
          or %1$I.%2$I = nullif(current_setting(%3$L, true), '')
          or exists (
            select 1 from %4$I m
            where m.id = %1$I.%2$I
              and m."partnerId" = app.current_partner_id()
          )
        );
      $f$, t, axis.fk_column, axis.guc, axis.merchant_table);
    end loop;

    -- The merchant table itself: a staff user sees only their own merchant row;
    -- a partner sees the merchants it owns and nothing else.
    --
    -- The with-check arm is what stops a partner claiming somebody else's
    -- merchant: an update that would set "partnerId" to anything other than the
    -- caller's own fails the check, and the row was already invisible to them
    -- under using.
    execute format('alter table %I enable row level security;', axis.merchant_table);
    execute format('alter table %I force row level security;', axis.merchant_table);
    execute format('drop policy if exists tenant_isolation on %I;', axis.merchant_table);
    execute format($f$
      create policy tenant_isolation on %1$I
      using (
        app.is_super_admin()
        or id = nullif(current_setting(%2$L, true), '')
        or "partnerId" = app.current_partner_id()
      )
      with check (
        app.is_super_admin()
        or id = nullif(current_setting(%2$L, true), '')
        or "partnerId" = app.current_partner_id()
      );
    $f$, axis.merchant_table, axis.guc);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- audit_logs: the one tenant table whose "restaurantId" can be NULL.
--
-- An HQ or partner action — approving an operator, reassigning a merchant,
-- changing a revenue share — has an actor and a subject but no restaurant, so
-- the generic policy above cannot reach it: the semi-join is against a NULL and
-- matches nothing. Replaced here with one that also reads audit_logs."partnerId"
-- directly, so a partner can read its own trail and still not another's.
--
-- Runs after the loop deliberately: the loop creates the generic policy on this
-- table like any other, and this drops and replaces it.
-- ----------------------------------------------------------------------------
drop policy if exists tenant_isolation on audit_logs;
create policy tenant_isolation on audit_logs
  using (
    app.is_super_admin()
    or "restaurantId" = app.current_restaurant_id()
    or "partnerId" = app.current_partner_id()
    or exists (
      select 1 from restaurants r
      where r.id = audit_logs."restaurantId"
        and r."partnerId" = app.current_partner_id()
    )
  )
  with check (
    app.is_super_admin()
    or "restaurantId" = app.current_restaurant_id()
    or "partnerId" = app.current_partner_id()
    or exists (
      select 1 from restaurants r
      where r.id = audit_logs."restaurantId"
        and r."partnerId" = app.current_partner_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Child tables WITHOUT a direct "restaurantId" — isolate via their parent.
--
-- These carry NO partner arm on purpose. A partner reading them today gets
-- nothing rather than getting somebody else's rows: the failure mode is a blank
-- screen, not a leak. The partner portal has no feature that reads an order's
-- items or payments yet — that arrives with the statements work in Phase 4 —
-- and a policy granting access nobody uses is a policy nobody has tested.
-- Add the arm here when a caller needs it, not before.
-- ----------------------------------------------------------------------------

-- modifiers -> modifier_groups
alter table modifiers enable row level security;
alter table modifiers force row level security;
drop policy if exists tenant_isolation on modifiers;
create policy tenant_isolation on modifiers
  using (app.is_super_admin() or exists (
    select 1 from modifier_groups g
    where g.id = modifiers."modifierGroupId"
      and g."restaurantId" = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from modifier_groups g
    where g.id = modifiers."modifierGroupId"
      and g."restaurantId" = app.current_restaurant_id()));

-- menu_item_modifier_groups -> menu_items
alter table menu_item_modifier_groups enable row level security;
alter table menu_item_modifier_groups force row level security;
drop policy if exists tenant_isolation on menu_item_modifier_groups;
create policy tenant_isolation on menu_item_modifier_groups
  using (app.is_super_admin() or exists (
    select 1 from menu_items m
    where m.id = menu_item_modifier_groups."menuItemId"
      and m."restaurantId" = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from menu_items m
    where m.id = menu_item_modifier_groups."menuItemId"
      and m."restaurantId" = app.current_restaurant_id()));

-- order_items -> orders
alter table order_items enable row level security;
alter table order_items force row level security;
drop policy if exists tenant_isolation on order_items;
create policy tenant_isolation on order_items
  using (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = order_items."orderId"
      and o."restaurantId" = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = order_items."orderId"
      and o."restaurantId" = app.current_restaurant_id()));

-- order_item_modifiers -> order_items -> orders
alter table order_item_modifiers enable row level security;
alter table order_item_modifiers force row level security;
drop policy if exists tenant_isolation on order_item_modifiers;
create policy tenant_isolation on order_item_modifiers
  using (app.is_super_admin() or exists (
    select 1 from order_items oi
    join orders o on o.id = oi."orderId"
    where oi.id = order_item_modifiers."orderItemId"
      and o."restaurantId" = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from order_items oi
    join orders o on o.id = oi."orderId"
    where oi.id = order_item_modifiers."orderItemId"
      and o."restaurantId" = app.current_restaurant_id()));

-- payments -> orders
alter table payments enable row level security;
alter table payments force row level security;
drop policy if exists tenant_isolation on payments;
create policy tenant_isolation on payments
  using (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = payments."orderId"
      and o."restaurantId" = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from orders o
    where o.id = payments."orderId"
      and o."restaurantId" = app.current_restaurant_id()));

-- sms_messages -> sms_campaigns
alter table sms_messages enable row level security;
alter table sms_messages force row level security;
drop policy if exists tenant_isolation on sms_messages;
create policy tenant_isolation on sms_messages
  using (app.is_super_admin() or exists (
    select 1 from sms_campaigns c
    where c.id = sms_messages."campaignId"
      and c."restaurantId" = app.current_restaurant_id()))
  with check (app.is_super_admin() or exists (
    select 1 from sms_campaigns c
    where c.id = sms_messages."campaignId"
      and c."restaurantId" = app.current_restaurant_id()));

-- ----------------------------------------------------------------------------
-- Platform-level tables.
--   plans: global reference data — readable by everyone, writable by super-admin.
--   platform_admins: super-admin only.
-- ----------------------------------------------------------------------------
alter table plans enable row level security;
alter table plans force row level security;
drop policy if exists plans_read on plans;
drop policy if exists plans_write on plans;
create policy plans_read on plans for select using (true);
create policy plans_write on plans for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- plan_modules: reference data — readable by everyone (entitlements check),
-- writable by super-admin only.
alter table plan_modules enable row level security;
alter table plan_modules force row level security;
drop policy if exists plan_modules_read on plan_modules;
drop policy if exists plan_modules_write on plan_modules;
create policy plan_modules_read on plan_modules for select using (true);
create policy plan_modules_write on plan_modules for all
  using (app.is_super_admin()) with check (app.is_super_admin());

alter table platform_admins enable row level security;
alter table platform_admins force row level security;
drop policy if exists super_only on platform_admins;
create policy super_only on platform_admins for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- rate_limits: platform-level counters for unauthenticated endpoints (the
-- public DIY builder). No tenant owns them; only the service role writes them.
alter table rate_limits enable row level security;
alter table rate_limits force row level security;
drop policy if exists super_only on rate_limits;
create policy super_only on rate_limits for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- partners: an operator may read and edit its OWN row and no other.
--
-- The table has no "restaurantId", so the tenant loop never reached it and until
-- now it carried no policy at all. That was survivable while every caller went
-- through systemDb (HQ screens, login, the public application form — all of
-- which bypass and still do). It stopped being survivable when the partner
-- portal started writing here under partnerDb: brand settings are the first
-- thing a partner edits about themselves, and without this the only thing
-- stopping one partner rebranding another is a `where` clause being right.
--
-- Insert is deliberately not granted to a partner scope: a new partner row is
-- created by the public application form, which runs as the system.
-- ----------------------------------------------------------------------------
alter table partners enable row level security;
alter table partners force row level security;
drop policy if exists partner_self on partners;
create policy partner_self on partners
  using (app.is_super_admin() or id = app.current_partner_id())
  with check (app.is_super_admin() or id = app.current_partner_id());

-- ----------------------------------------------------------------------------
-- partner_ledger_entries: the partner who earned it, and HQ. NOT the merchant.
--
-- Excluded from the tenant loop — it carries "merchantId", not any axis's own
-- column, and could not be reached by the loop even if it were wanted there. The
-- reason is not tidiness. Each row holds the partner/HQ split of that payment —
-- a commercial term between CANVEXIA and the operator. Under the generic tenant
-- policy a restaurant could read its own rows and learn exactly what its partner
-- keeps and what CANVEXIA takes, which is nobody's business but theirs and would
-- be discovered by a merchant, not by us.
--
-- Read-only to partners as well. Entries are written by the settlement path
-- running as the system; a partner being able to insert one would be a partner
-- writing their own statement.
-- ----------------------------------------------------------------------------
alter table partner_ledger_entries enable row level security;
alter table partner_ledger_entries force row level security;
drop policy if exists ledger_read on partner_ledger_entries;
drop policy if exists ledger_write on partner_ledger_entries;
create policy ledger_read on partner_ledger_entries for select
  using (app.is_super_admin() or "partnerId" = app.current_partner_id());
create policy ledger_write on partner_ledger_entries for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- The partner portal's own tables: seats, invites, pipeline, notification prefs.
--
-- All four carry "partnerId" and none carries a merchant axis column, so the
-- tenant loop above cannot reach them and the backstop sweep at the bottom would
-- lock them to super-admin — which is the SAFE failure, and also a portal that
-- shows a partner nothing. Hence an explicit policy here.
--
-- These are also the tables in this schema most worth getting right after
-- partner_waitlist: `prospects` holds the name, mobile number and address of
-- every business a partner has walked into, none of whom agreed to anything.
-- packages/db/prisma/manual/add-partner-portal.sql revokes anon AND
-- authenticated on all four; this file is where the policy lives so that a
-- re-run of db:rls does not quietly drop it.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['partner_users', 'partner_invites', 'prospects',
                           'notification_prefs', 'partner_plan_prices']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;  -- table not migrated yet; db:rls must not fail on a fresh clone
    end if;
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists partner_scope on %I;', t);
    execute format($f$
      create policy partner_scope on %1$I for all
        using (app.is_super_admin() or "partnerId" = app.current_partner_id())
        with check (app.is_super_admin() or "partnerId" = app.current_partner_id());
    $f$, t);
    execute format('revoke all on %I from anon;', t);
    execute format('revoke all on %I from authenticated;', t);
  end loop;
end $$;

-- partner_statements: the partner who earned it may READ it and nothing more.
-- A partner able to write here is a partner writing their own statement — the
-- same reason partner_ledger_entries is read-only to them. HQ freezes the row
-- and moves the payout status.
do $$
begin
  if to_regclass('public.partner_statements') is not null then
    alter table partner_statements enable row level security;
    alter table partner_statements force row level security;
    drop policy if exists statement_read on partner_statements;
    drop policy if exists statement_write on partner_statements;
    create policy statement_read on partner_statements for select
      using (app.is_super_admin() or "partnerId" = app.current_partner_id());
    create policy statement_write on partner_statements for all
      using (app.is_super_admin()) with check (app.is_super_admin());
    revoke all on partner_statements from anon, authenticated;
  end if;
end $$;

-- platform_feedback / crm_clients / customer_events: the three tables excluded
-- from the tenant loop above. They carry a "restaurantId" but the row belongs to
-- the platform, not to the restaurant it names — owners' feedback about Servd
-- itself, the founder's sales pipeline, and the bizops funnel. All three are
-- written and read exclusively through systemDb(), so super-admin-only locks out
-- no caller that exists; before this they had no policy at all.
alter table platform_feedback enable row level security;
alter table platform_feedback force row level security;
drop policy if exists super_only on platform_feedback;
create policy super_only on platform_feedback for all
  using (app.is_super_admin()) with check (app.is_super_admin());

alter table crm_clients enable row level security;
alter table crm_clients force row level security;
drop policy if exists super_only on crm_clients;
create policy super_only on crm_clients for all
  using (app.is_super_admin()) with check (app.is_super_admin());

alter table customer_events enable row level security;
alter table customer_events force row level security;
drop policy if exists super_only on customer_events;
create policy super_only on customer_events for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- email_campaigns / email_messages: platform-level marketing to the founder's
-- own leads (restaurant owners), not to any tenant's diners. Super-admin only.
alter table email_campaigns enable row level security;
alter table email_campaigns force row level security;
drop policy if exists super_only on email_campaigns;
create policy super_only on email_campaigns for all
  using (app.is_super_admin()) with check (app.is_super_admin());

alter table email_messages enable row level security;
alter table email_messages force row level security;
drop policy if exists super_only on email_messages;
create policy super_only on email_messages for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- email_templates / email_sends: the acquisition follow-up tracks for the
-- founder's own leads. Platform-level, super-admin only.
alter table email_templates enable row level security;
alter table email_templates force row level security;
drop policy if exists super_only on email_templates;
create policy super_only on email_templates for all
  using (app.is_super_admin()) with check (app.is_super_admin());

alter table email_sends enable row level security;
alter table email_sends force row level security;
drop policy if exists super_only on email_sends;
create policy super_only on email_sends for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- landing_stats: /create view + CTA-click counters for the ad funnel.
-- Platform-level (the founder's ad numbers), super-admin only.
alter table landing_stats enable row level security;
alter table landing_stats force row level security;
drop policy if exists super_only on landing_stats;
create policy super_only on landing_stats for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- Harden the helper functions: pin search_path.
--
-- A SECURITY INVOKER function with a mutable search_path can be made to resolve
-- a different `current_setting` if a caller puts a shadowing schema ahead of
-- pg_catalog. These three decide every policy in this file, so they are the
-- worst possible place for that. They reference only built-ins, so the empty
-- path costs nothing.
-- ----------------------------------------------------------------------------
alter function app.current_restaurant_id() set search_path = '';
alter function app.is_super_admin() set search_path = '';
alter function app.current_partner_id() set search_path = '';

-- ----------------------------------------------------------------------------
-- The HQ console's own tables (Phase H1).
--
-- packages/db/prisma/manual/add-hq-admin.sql creates these and carries the same
-- policies; they are repeated here so that a re-run of THIS script does not
-- quietly replace them with the backstop's super-admin-only lock. Three groups,
-- because the tables are not the same shape:
--
--   partner-scoped  — territory_assignments, hq_announcement_reads
--   partner-READ    — feature_flags, hq_announcements (HQ writes, partner reads)
--   HQ-only         — impersonation_grants, cron_runs
--
-- Each block skips a table that is not migrated yet, so db:rls does not fail on
-- a fresh clone.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['territory_assignments', 'hq_announcement_reads']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists partner_scope on %I;', t);
    execute format($f$
      create policy partner_scope on %1$I for all
        using (app.is_super_admin() or "partnerId" = app.current_partner_id())
        with check (app.is_super_admin() or "partnerId" = app.current_partner_id());
    $f$, t);
    execute format('revoke all on %I from anon;', t);
    execute format('revoke all on %I from authenticated;', t);
  end loop;
end $$;

-- feature_flags: a partner's own app has to know whether a feature is on, so
-- the GLOBAL rows (partnerId is null) are readable in any app context. A
-- per-partner override is readable only by that partner — "Cebu has the beta
-- and you do not" is not information Cebu's competitor should be able to pull.
do $$
begin
  if to_regclass('public.feature_flags') is null then return; end if;
  alter table feature_flags enable row level security;
  alter table feature_flags force row level security;
  drop policy if exists flags_read on feature_flags;
  drop policy if exists flags_write on feature_flags;
  create policy flags_read on feature_flags for select
    using (app.is_super_admin()
           or "partnerId" is null
           or "partnerId" = app.current_partner_id());
  create policy flags_write on feature_flags for all
    using (app.is_super_admin()) with check (app.is_super_admin());
  revoke all on feature_flags from anon;
  revoke all on feature_flags from authenticated;
end $$;

-- hq_announcements: the SEGMENT is evaluated in the app, not here. A policy that
-- parses JSON to decide visibility is a policy nobody can verify. What this does
-- guarantee is that an UNPUBLISHED announcement is invisible to every partner,
-- which is the part that would actually leak — a draft naming a city that is
-- about to lose its licence, read by that city.
do $$
begin
  if to_regclass('public.hq_announcements') is null then return; end if;
  alter table hq_announcements enable row level security;
  alter table hq_announcements force row level security;
  drop policy if exists announcement_read on hq_announcements;
  drop policy if exists announcement_write on hq_announcements;
  create policy announcement_read on hq_announcements for select
    using (app.is_super_admin()
           or ("publishedAt" is not null and app.current_partner_id() is not null));
  create policy announcement_write on hq_announcements for all
    using (app.is_super_admin()) with check (app.is_super_admin());
  revoke all on hq_announcements from anon;
  revoke all on hq_announcements from authenticated;
end $$;

-- territories: reference data — 143 Philippine cities and what they cost. It
-- carried no policy before H1, which meant the backstop below locked it to
-- super-admin and nothing else could read the city list at all. Readable in any
-- app context now; writable only by HQ, because a row here says who owns a city.
do $$
begin
  if to_regclass('public.territories') is null then return; end if;
  alter table territories enable row level security;
  alter table territories force row level security;
  drop policy if exists territory_read on territories;
  drop policy if exists territory_write on territories;
  -- And the backstop's own lock, which this table carried until H1.
  drop policy if exists super_only on territories;
  create policy territory_read on territories for select using (true);
  create policy territory_write on territories for all
    using (app.is_super_admin()) with check (app.is_super_admin());
  -- "Any app context" means a session this codebase opened, NOT the browser.
  revoke all on territories from anon;
  revoke all on territories from authenticated;
end $$;

-- product_settings: readable in any app context, because the partner portal's
-- product picker needs the status and the training URL. Writable only by HQ.
--
-- `demoAccountRef` is readable with the rest, and that is acceptable BECAUSE it
-- is a reference rather than a credential — "ask ops for the Resceta demo
-- login" tells a partner nothing they could not have asked for. If a secret is
-- ever put in that column this policy becomes wrong.
do $$
begin
  if to_regclass('public.product_settings') is null then return; end if;
  alter table product_settings enable row level security;
  alter table product_settings force row level security;
  drop policy if exists product_read on product_settings;
  drop policy if exists product_write on product_settings;
  create policy product_read on product_settings for select using (true);
  create policy product_write on product_settings for all
    using (app.is_super_admin()) with check (app.is_super_admin());
  revoke all on product_settings from anon;
  revoke all on product_settings from authenticated;
end $$;

-- passthrough_costs is CANVEXIA's margin: HQ only. Usage is partner-scoped — an
-- operator may see what their own merchants sent and not another city's volume,
-- and may not write it, because a partner writing their own usage is a partner
-- writing their own bill.
do $$
begin
  if to_regclass('public.passthrough_costs') is not null then
    alter table passthrough_costs enable row level security;
    alter table passthrough_costs force row level security;
    drop policy if exists super_only on passthrough_costs;
    create policy super_only on passthrough_costs for all
      using (app.is_super_admin()) with check (app.is_super_admin());
    revoke all on passthrough_costs from anon;
    revoke all on passthrough_costs from authenticated;
  end if;
  if to_regclass('public.passthrough_usage') is not null then
    alter table passthrough_usage enable row level security;
    alter table passthrough_usage force row level security;
    drop policy if exists partner_read on passthrough_usage;
    drop policy if exists hq_write on passthrough_usage;
    create policy partner_read on passthrough_usage for select
      using (app.is_super_admin() or "partnerId" = app.current_partner_id());
    create policy hq_write on passthrough_usage for all
      using (app.is_super_admin()) with check (app.is_super_admin());
    revoke all on passthrough_usage from anon;
    revoke all on passthrough_usage from authenticated;
  end if;
end $$;

-- outbound_emails holds the address and name of every person the platform has
-- written to — the shape of data D27 found exposed on prospect_leads. HQ only.
do $$
begin
  if to_regclass('public.outbound_emails') is null then return; end if;
  alter table outbound_emails enable row level security;
  alter table outbound_emails force row level security;
  drop policy if exists super_only on outbound_emails;
  create policy super_only on outbound_emails for all
    using (app.is_super_admin()) with check (app.is_super_admin());
  revoke all on outbound_emails from anon;
  revoke all on outbound_emails from authenticated;
end $$;

-- HQ-only. A partner must not be able to enumerate the grants that let HQ into
-- its console, nor see when a job last ran. These would be caught by the
-- backstop anyway; they are spelled out so that adding a column to either does
-- not depend on the sweep still being there.
do $$
declare t text;
begin
  foreach t in array array['impersonation_grants', 'cron_runs']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists super_only on %I;', t);
    execute format($f$
      create policy super_only on %1$I for all
        using (app.is_super_admin()) with check (app.is_super_admin());
    $f$, t);
    execute format('revoke all on %I from anon;', t);
    execute format('revoke all on %I from authenticated;', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- A7 — the staff tables. TWO ARMS: the partner, and the seat.
--
-- These are the only tables in this schema where the seat is also a policy arm,
-- because here it is a real data-separation rule rather than a feature flag.
-- "Own rows vs. everyone's" is what separates a salesperson from a colleague's
-- location history; getting it wrong leaks a GPS trail, not a rival operator's
-- revenue.
--
-- The seat arm is: the row is mine, OR my seat holds the explicit see-everyone
-- permission. `app.has_permission` answers from an explicit override row only —
-- the defaults live in packages/core — so this policy is a FLOOR, not the
-- feature. The screens read through systemDb with a where clause derived from
-- the resolved permissions, exactly as /hq does; this is what stops a seat
-- reaching the table any other way.
--
-- Listed explicitly rather than swept, because the backstop below would
-- otherwise lock all eight to super-admin and the portal would 500 on screens
-- that have no business being HQ-only.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  seat_perm text;
begin
  for t, seat_perm in
    select v.tbl, v.perm from (values
      ('staff_events',          'hr.view_all'),
      ('staff_targets',         'hr.view_all'),
      ('attendance_sessions',   'attendance.view_all'),
      ('staff_visits',          'attendance.view_all'),
      ('commission_rules',      'commissions.manage'),
      ('commission_statements', 'commissions.manage')
    ) as v(tbl, perm)
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists super_only on %I;', t);
    execute format('drop policy if exists partner_seat_read on %I;', t);
    execute format('drop policy if exists partner_seat_write on %I;', t);

    execute format($f$
      create policy partner_seat_read on %1$I for select
        using (
          app.is_super_admin()
          or (
            "partnerId" = app.current_partner_id()
            and (
              "partnerUserId" = app.current_partner_user_id()
              or app.has_permission(%2$L)
            )
          )
        );
    $f$, t, seat_perm);

    -- Writes are narrower than reads on purpose: a manager may READ the team's
    -- attendance and may not WRITE somebody else's check-in. Rows for another
    -- seat are created by the server under systemDb, which is audited, rather
    -- than by a policy that would let any manager forge one.
    execute format($f$
      create policy partner_seat_write on %1$I for all
        using (
          app.is_super_admin()
          or ("partnerId" = app.current_partner_id()
              and "partnerUserId" = app.current_partner_user_id())
        )
        with check (
          app.is_super_admin()
          or ("partnerId" = app.current_partner_id()
              and "partnerUserId" = app.current_partner_user_id())
        );
    $f$, t);

    execute format('revoke all on %I from anon;', t);
    execute format('revoke all on %I from authenticated;', t);
  end loop;
end $$;

-- commission_lines has no partnerId of its own — it hangs off a statement the
-- way order_items hang off an order. The policy is a semi-join, which is what
-- keeps a line and its statement from ever disagreeing about who may read them.
alter table "commission_lines" enable row level security;
alter table "commission_lines" force row level security;
drop policy if exists super_only on "commission_lines";
drop policy if exists commission_lines_scope on "commission_lines";
create policy commission_lines_scope on "commission_lines" for all
  using (
    app.is_super_admin()
    or exists (
      select 1 from public.commission_statements s
       where s."id" = "commission_lines"."statementId"
         and s."partnerId" = app.current_partner_id()
         and (s."partnerUserId" = app.current_partner_user_id()
              or app.has_permission('commissions.manage'))
    )
  )
  with check (app.is_super_admin());
revoke all on "commission_lines" from anon;
revoke all on "commission_lines" from authenticated;

-- partner_role_permissions is PARTNER-scoped only, deliberately not seat-scoped:
-- every seat may read the grid that decides what it can do, because hiding the
-- rules from the person they apply to buys nothing. Only team.permissions may
-- CHANGE it, which is the chokepoint's job, so writes go through systemDb.
alter table "partner_role_permissions" enable row level security;
alter table "partner_role_permissions" force row level security;
drop policy if exists super_only on "partner_role_permissions";
drop policy if exists partner_permissions_read on "partner_role_permissions";
create policy partner_permissions_read on "partner_role_permissions" for select
  using (app.is_super_admin() or "partnerId" = app.current_partner_id());
drop policy if exists partner_permissions_write on "partner_role_permissions";
create policy partner_permissions_write on "partner_role_permissions" for all
  using (app.is_super_admin()) with check (app.is_super_admin());
revoke all on "partner_role_permissions" from anon;
revoke all on "partner_role_permissions" from authenticated;

-- attendance_kiosks holds a SIGNING SECRET, so it is SUPER-ONLY at the policy
-- level and read through systemDb with an explicit partnerId, exactly as
-- outbound_emails is. A partner_scope policy here would be the obvious thing to
-- write and would be wrong: it would make every seat in the partner able to
-- select `secret`, and anybody holding a kiosk secret can mint a valid clock-in
-- code for that kiosk from their sofa. The kiosk screen gets codes from the
-- server; nothing else ever needs the column.
do $$
begin
  if to_regclass('public.attendance_kiosks') is null then return; end if;
  alter table "attendance_kiosks" enable row level security;
  alter table "attendance_kiosks" force row level security;
  drop policy if exists super_only on "attendance_kiosks";
  drop policy if exists partner_scope on "attendance_kiosks";
  create policy super_only on "attendance_kiosks" for all
    using (app.is_super_admin()) with check (app.is_super_admin());
  revoke all on "attendance_kiosks" from anon;
  revoke all on "attendance_kiosks" from authenticated;
end $$;

-- ----------------------------------------------------------------------------
-- Backstop: lock down every remaining table.
--
-- Supabase grants `anon` full DML on the whole public schema by default, and the
-- anon key ships in the browser. For a table with RLS that is harmless — the
-- policies decide. For a table WITHOUT RLS it means the table is readable and
-- writable by anyone who views source. On this schema that was twelve tables,
-- among them prospect_leads: names, emails, phone numbers and addresses of
-- sales leads.
--
-- Every one of them is reached exclusively through systemDb() — verified by
-- grepping each Prisma model for its callers — so super-admin-only locks out no
-- caller that exists.
--
-- Written as a sweep rather than a list for the same reason the tenant loop
-- above is: a list has to be remembered, and this one had been missed twelve
-- times. A new table now arrives locked and someone has to open it deliberately.
-- That is the right direction to fail in: a blank screen, not a leak.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tb.table_name
      from information_schema.tables tb
     where tb.table_schema = 'public'
       and tb.table_type = 'BASE TABLE'
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = tb.table_name
       )
     order by tb.table_name
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists super_only on %I;', t);
    execute format($f$
      create policy super_only on %1$I for all
        using (app.is_super_admin()) with check (app.is_super_admin());
    $f$, t);
  end loop;
end $$;
