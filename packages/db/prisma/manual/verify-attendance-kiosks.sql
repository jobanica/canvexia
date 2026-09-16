-- Part 2 gate, take three: the same empty-GUC flaw the A8.0 gate exposed.
--
-- Take two set `app.current_partner_id` with a SUBSELECT ON attendance_kiosks
-- run AFTER switching to app_user — i.e. through the policy under test, which
-- returns nothing. The GUC ended up empty, so "app_user reads zero rows" was
-- true because there was no partner context at all, not because RLS refused.
-- The ids are captured as the owner now, and each block asserts the GUC is set
-- before it claims anything.
do $$
declare pid text;
begin
  select id into pid from partners limit 1;
  if pid is null then raise exception 'no partner to test with'; end if;

  insert into attendance_kiosks (id, "partnerId", label, secret)
    values ('gate-kiosk', pid, 'gate', 'deadbeef')
    on conflict (id) do update set secret = 'deadbeef';

  create temp table if not exists kiosk_gate (k text primary key, v text) on commit drop;
  delete from kiosk_gate;
  insert into kiosk_gate values ('partner', pid);
  grant select on kiosk_gate to app_user;
end $$;

set local role app_user;
select set_config('app.is_super_admin', 'off', true);
select set_config('app.current_partner_id', (select v from kiosk_gate where k='partner'), true);

do $$
declare n int;
begin
  if coalesce(current_setting('app.current_partner_id', true), '') = '' then
    raise exception 'the partner GUC is empty; this gate would prove nothing';
  end if;
  -- The most favourable case for a leak: the seat's OWN partner, super-admin
  -- off, asking for its own kiosk. The secret column must still be out of reach.
  select count(*) into n from attendance_kiosks where id = 'gate-kiosk';
  if n <> 0 then raise exception 'app_user can read the kiosk row — the secret is exposed'; end if;
end $$;

reset role;

do $$
declare n int;
begin
  select count(*) into n from attendance_kiosks where id = 'gate-kiosk';
  if n <> 1 then raise exception 'the row vanished; the test above proved nothing'; end if;
  delete from attendance_kiosks where id = 'gate-kiosk';
end $$;

select 'kiosk gate ok (partner GUC set, still unreadable)' as result;
