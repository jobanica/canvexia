-- A8.0 gate: two axes, and neither can read the other's rows.
--
-- Run as app_user with super-admin explicitly OFF. `postgres` carries
-- rolbypassrls, so a gate that forgets to switch role asserts nothing at all.
do $$
declare
  pid text; pid2 text; rid text; bad boolean;
begin
  select id into pid  from partners order by "createdAt" limit 1;
  select id into pid2 from partners where id <> pid order by "createdAt" limit 1;
  select id into rid  from restaurants limit 1;
  if pid is null then raise exception 'need a partner to test with'; end if;

  -- The CANVEXIA database has no merchants yet — it is a separate database from
  -- servdph.com and is meant to be empty. So the merchant arm is tested against
  -- a throwaway restaurant, removed at the end. Without one, case C would pass
  -- by having nothing to read, which is not the same as isolation.
  if rid is null then
    rid := 'gate-restaurant';
    insert into restaurants (id, name, slug, "updatedAt")
      values (rid, 'Gate Test', 'gate-test-a80', CURRENT_TIMESTAMP)
      on conflict (id) do nothing;
  end if;

  delete from sms_campaigns where id in ('gate-camp-p','gate-camp-r');

  insert into sms_campaigns (id, "partnerId", body) values ('gate-camp-p', pid, 'partner side');
  insert into sms_campaigns (id, "restaurantId", body) values ('gate-camp-r', rid, 'merchant side');

  -- THE IDS ARE CAPTURED HERE, as the owner, into a temp table.
  --
  -- The first version of this gate read them back with a subselect AFTER
  -- switching to app_user — through the very policy under test, which returns
  -- nothing — so every GUC ended up empty and each "cannot read" assertion was
  -- true for the wrong reason. A temp table has no RLS, so this survives the
  -- role switch.
  create temp table if not exists gate_ids (k text primary key, v text) on commit drop;
  delete from gate_ids;
  insert into gate_ids values ('partner', pid), ('other_partner', coalesce(pid2, 'no-such-partner')), ('restaurant', rid);
  -- app_user owns nothing in pg_temp; without this the role switch below cannot
  -- read the ids it was given.
  grant select on gate_ids to app_user;

  -- the CHECK must refuse both-axes and neither-axis
  bad := false;
  begin
    insert into sms_campaigns (id, "partnerId", "restaurantId", body)
      values ('gate-camp-x', pid, rid, 'both');
    bad := true;
  exception when check_violation then null; end;
  if bad then raise exception 'a campaign with BOTH axes was accepted'; end if;

  bad := false;
  begin
    insert into sms_campaigns (id, body) values ('gate-camp-x', 'neither');
    bad := true;
  exception when check_violation then null; end;
  if bad then raise exception 'a campaign with NEITHER axis was accepted'; end if;
end $$;

set local role app_user;
select set_config('app.is_super_admin', 'off', true);

-- Every "cannot read" below is only meaningful if the GUC is really set, so
-- each block asserts that first.
-- A. the partner that owns it sees exactly its own.
select set_config('app.current_partner_id', (select v from gate_ids where k='partner'), true);
select set_config('app.current_restaurant_id', '', true);
do $$
declare n int;
begin
  if coalesce(current_setting('app.current_partner_id', true), '') = '' then
    raise exception 'the partner GUC is empty; this gate would prove nothing';
  end if;
  select count(*) into n from sms_campaigns where id = 'gate-camp-p';
  if n <> 1 then raise exception 'the owning partner cannot read its own campaign (n=%)', n; end if;
  select count(*) into n from sms_campaigns where id = 'gate-camp-r';
  if n <> 0 then raise exception 'a partner can read a RESTAURANT campaign'; end if;
end $$;

-- B. a different partner sees neither.
select set_config('app.current_partner_id', (select v from gate_ids where k='other_partner'), true);
do $$
declare n int;
begin
  if coalesce(current_setting('app.current_partner_id', true), '') = '' then
    raise exception 'the other-partner GUC is empty; this gate would prove nothing';
  end if;
  select count(*) into n from sms_campaigns where id = 'gate-camp-p';
  if n <> 0 then raise exception 'ANOTHER PARTNER can read this partner''s campaign'; end if;
end $$;

-- C. the restaurant sees its own and not the partner's.
select set_config('app.current_partner_id', '', true);
select set_config('app.current_restaurant_id', (select v from gate_ids where k='restaurant'), true);
do $$
declare n int;
begin
  if coalesce(current_setting('app.current_restaurant_id', true), '') = '' then
    raise exception 'the restaurant GUC is empty; this gate would prove nothing';
  end if;
  select count(*) into n from sms_campaigns where id = 'gate-camp-r';
  if n <> 1 then raise exception 'the restaurant cannot read its own campaign'; end if;
  select count(*) into n from sms_campaigns where id = 'gate-camp-p';
  if n <> 0 then raise exception 'a restaurant can read a PARTNER campaign'; end if;
end $$;

-- D. no tenant context at all: nothing.
select set_config('app.current_restaurant_id', '', true);
do $$
declare n int;
begin
  select count(*) into n from sms_campaigns where id in ('gate-camp-p','gate-camp-r');
  if n <> 0 then raise exception 'campaigns readable with no tenant context (n=%)', n; end if;
end $$;

reset role;
delete from sms_campaigns where id in ('gate-camp-p','gate-camp-r');
delete from restaurants where id = 'gate-restaurant';
select 'a8.0 gate ok' as result;
