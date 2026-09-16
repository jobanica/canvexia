-- A8.3 gate: the campaign queue.
--
-- Two properties, both of which are about not texting somebody twice or
-- charging for a text nobody got.
do $$
declare pid text; pid2 text; n int;
begin
  select id into pid  from partners order by "createdAt" limit 1;
  select id into pid2 from partners where id <> pid order by "createdAt" limit 1;
  if pid is null then raise exception 'need a partner to test with'; end if;

  delete from sms_messages where "campaignId" = 'gate-camp';
  delete from sms_campaigns where id = 'gate-camp';

  -- 1. The status CHECK refuses a value the drainer would not understand. A
  --    campaign stuck in an unknown state is one that never sends and never
  --    says why.
  begin
    insert into sms_campaigns (id, "partnerId", body, status)
      values ('gate-camp', pid, 'x', 'half-sent');
    raise exception 'an unknown campaign status was accepted';
  exception when check_violation then null;
  end;

  insert into sms_campaigns (id, "partnerId", body, status, "scheduledAt")
    values ('gate-camp', pid, 'Hi {name}', 'scheduled', CURRENT_TIMESTAMP);
  insert into sms_messages (id, "campaignId", "toPhone", body, status)
    values ('gate-msg', 'gate-camp', '+639171234567', 'Hi there', 'queued');

  -- 2. The send window columns cannot be nonsense. A window whose end is before
  --    its start would queue every message to a slot that never arrives.
  begin
    update partners set "smsWindowStartMin" = 1300, "smsWindowEndMin" = 600 where id = pid;
    raise exception 'an inverted send window was accepted';
  exception when check_violation then null;
  end;

  create temp table if not exists camp_gate (k text primary key, v text) on commit drop;
  delete from camp_gate;
  insert into camp_gate values ('partner', pid), ('other', coalesce(pid2, 'no-such-partner'));
  grant select on camp_gate to app_user;
end $$;

-- 3. Another partner reads neither the campaign nor its messages. The message
--    has no axis column of its own — its policy is a semi-join to the campaign
--    — so this is the assertion that the semi-join actually works.
set local role app_user;
select set_config('app.is_super_admin', 'off', true);
select set_config('app.current_partner_id', (select v from camp_gate where k='other'), true);
do $$
declare n int;
begin
  if coalesce(current_setting('app.current_partner_id', true), '') = '' then
    raise exception 'the partner GUC is empty; this gate would prove nothing';
  end if;
  select count(*) into n from sms_campaigns where id = 'gate-camp';
  if n <> 0 then raise exception 'another partner can read this campaign'; end if;
  select count(*) into n from sms_messages where id = 'gate-msg';
  if n <> 0 then raise exception 'another partner can read a campaign MESSAGE'; end if;
end $$;

-- 4. …and the owner reads both, so the zeroes above were RLS.
select set_config('app.current_partner_id', (select v from camp_gate where k='partner'), true);
do $$
declare n int;
begin
  select count(*) into n from sms_campaigns where id = 'gate-camp';
  if n <> 1 then raise exception 'the owning partner cannot read its own campaign'; end if;
  select count(*) into n from sms_messages where id = 'gate-msg';
  if n <> 1 then raise exception 'the owning partner cannot read its own message'; end if;
end $$;

reset role;
delete from sms_messages where "campaignId" = 'gate-camp';
delete from sms_campaigns where id = 'gate-camp';
select 'a8.3 gate ok' as result;
