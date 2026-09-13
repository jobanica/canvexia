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
-- with a direct restaurant foreign key ("restaurantId" column).
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
-- The exclusion list is the other half. A few tables carry "restaurantId" and
-- are NOT tenant-owned: platform data that happens to name a restaurant. Those
-- get a super-admin-only policy further down. The DEFAULT for a restaurantId
-- table is tenant isolation — anything added to this array needs a reason of
-- the same kind, in a comment beside it.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  platform_owned text[] := array[
    'platform_feedback', -- owners' feedback ABOUT Servd, read by the super-admin
    'crm_clients',       -- the founder's own sales pipeline
    'customer_events',   -- bizops funnel events
    'email_messages',    -- acquisition mail to leads, not a tenant's diners
    'email_sends'        -- ditto (follow-up tracks)
  ];
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema
       and tb.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'restaurantId'
       and tb.table_type = 'BASE TABLE'
       and not (c.table_name = any(platform_owned))
     order by c.table_name
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists tenant_isolation on %I;', t);
    execute format($f$
      create policy tenant_isolation on %I
      using (app.is_super_admin() or "restaurantId" = app.current_restaurant_id())
      with check (app.is_super_admin() or "restaurantId" = app.current_restaurant_id());
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- restaurants: a staff user sees only their own restaurant row.
-- ----------------------------------------------------------------------------
alter table restaurants enable row level security;
alter table restaurants force row level security;
drop policy if exists tenant_isolation on restaurants;
create policy tenant_isolation on restaurants
  using (app.is_super_admin() or id = app.current_restaurant_id())
  with check (app.is_super_admin() or id = app.current_restaurant_id());

-- ----------------------------------------------------------------------------
-- Child tables WITHOUT a direct "restaurantId" — isolate via their parent.
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
