-- A8.2 gate: the wallet and the ledger must agree, and neither may be readable
-- by another partner.
--
-- The balance lives on the wallet row rather than being summed from the ledger,
-- for speed. This is the file that proves the shortcut is still honest.
do $$
declare pid text; pid2 text; drift int;
begin
  select id into pid  from partners order by "createdAt" limit 1;
  select id into pid2 from partners where id <> pid order by "createdAt" limit 1;
  if pid is null then raise exception 'need a partner to test with'; end if;

  -- 1. Every existing wallet matches the sum of its own ledger.
  select count(*) into drift
    from sms_wallets w
    left join (
      select "partnerId", coalesce(sum(change), 0) as total
        from sms_credit_ledger where "partnerId" is not null group by "partnerId"
    ) l on l."partnerId" = w."partnerId"
   where w."balanceCredits" <> coalesce(l.total, 0);
  if drift > 0 then
    raise exception '% wallet(s) disagree with their ledger', drift;
  end if;

  -- 2. The CHECK refuses a negative balance, which is what stops a race from
  --    turning into free texts.
  delete from sms_wallets where "partnerId" = pid;
  insert into sms_wallets ("partnerId", "balanceCredits") values (pid, 10);
  begin
    update sms_wallets set "balanceCredits" = -1 where "partnerId" = pid;
    raise exception 'a NEGATIVE balance was accepted';
  exception when check_violation then null;
  end;

  -- 3. A provider ref settles once. The unique index is what makes a repeated
  --    webhook delivery a no-op rather than free credits.
  delete from sms_topups where id in ('gate-top-1','gate-top-2');
  insert into sms_topups (id, "partnerId", credits, "amountCentavos", "providerRef")
    values ('gate-top-1', pid, 500, 25000, 'gate-ref');
  begin
    insert into sms_topups (id, "partnerId", credits, "amountCentavos", "providerRef")
      values ('gate-top-2', pid, 500, 25000, 'gate-ref');
    raise exception 'two top-ups accepted the SAME provider reference';
  exception when unique_violation then null;
  end;

  create temp table if not exists wallet_gate (k text primary key, v text) on commit drop;
  delete from wallet_gate;
  insert into wallet_gate values ('partner', pid), ('other', coalesce(pid2, 'no-such-partner'));
  grant select on wallet_gate to app_user;
end $$;

-- 4. Another partner cannot see either. Captured as the owner above, because a
--    subselect run as app_user reads through the policy under test.
set local role app_user;
select set_config('app.is_super_admin', 'off', true);
select set_config('app.current_partner_id', (select v from wallet_gate where k='other'), true);
do $$
declare n int;
begin
  if coalesce(current_setting('app.current_partner_id', true), '') = '' then
    raise exception 'the partner GUC is empty; this gate would prove nothing';
  end if;
  select count(*) into n from sms_wallets;
  if n <> 0 then raise exception 'another partner can read % wallet(s)', n; end if;
  select count(*) into n from sms_topups where id = 'gate-top-1';
  if n <> 0 then raise exception 'another partner can read a top-up'; end if;
end $$;

-- 5. …and the owner can, so the zeroes above were RLS rather than emptiness.
select set_config('app.current_partner_id', (select v from wallet_gate where k='partner'), true);
do $$
declare n int;
begin
  select count(*) into n from sms_topups where id = 'gate-top-1';
  if n <> 1 then raise exception 'the owning partner cannot read its own top-up'; end if;
end $$;

reset role;
delete from sms_topups where id in ('gate-top-1','gate-top-2');
delete from sms_wallets where "partnerId" = (select v from wallet_gate where k='partner');
select 'a8.2 gate ok' as result;
