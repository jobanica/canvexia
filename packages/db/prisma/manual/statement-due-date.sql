-- A statement nobody can be late for.
--
-- `payoutStatus` already had "overdue" as a value and there was no date to be
-- overdue against — the status could only ever be set by a human deciding it
-- felt late. Seven days from the freeze, and the freeze happens after the month
-- it covers has closed: the month ends, then the partner has a week.
--
-- NULL for everything frozen before today. Those statements were issued without
-- an agreed date, and back-dating one would make a partner late for a deadline
-- nobody ever gave them.
alter table partner_statements
  add column if not exists "dueAt" timestamptz;

select count(*) as statements, count("dueAt") as with_due from partner_statements;
