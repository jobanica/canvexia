-- A8.5 gate: the tombstone, which is the irreversible part of A8.
--
-- Two properties: a number can only be tombstoned once per partner, and the
-- tombstone holds a HASH rather than the number — a table of the numbers of
-- people who asked to be forgotten is the opposite of forgetting them.
do $$
declare pid text; n int;
begin
  select id into pid from partners limit 1;
  if pid is null then raise exception 'need a partner to test with'; end if;

  delete from sms_tombstones where "partnerId" = pid and "mobileHash" like 'gate%';

  insert into sms_tombstones (id, "partnerId", "mobileHash", reason)
    values ('gate-tomb', pid, 'gate-hash-aaaa', 'gate');

  -- One row per (partner, number). A second deletion request for the same
  -- person must not create a second tombstone, or a count of "people who asked
  -- to be forgotten" would be wrong.
  begin
    insert into sms_tombstones (id, "partnerId", "mobileHash")
      values ('gate-tomb-2', pid, 'gate-hash-aaaa');
    raise exception 'a DUPLICATE tombstone was accepted';
  exception when unique_violation then null;
  end;

  -- Nothing in the table looks like a phone number. A hex hash contains no
  -- '+63' and no run of ten digits.
  select count(*) into n from sms_tombstones
   where "mobileHash" ~ '\+?63[0-9]{10}' or "mobileHash" ~ '[0-9]{10}';
  if n > 0 then
    raise exception '% tombstone(s) contain something shaped like a phone number', n;
  end if;

  delete from sms_tombstones where id = 'gate-tomb';
end $$;

select 'a8.5 gate ok' as result;
