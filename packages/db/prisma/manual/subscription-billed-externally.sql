-- `billedExternally`: Servd does not collect this money, the partner does.
--
-- Needed before any partner-sold account can carry a real `currentPeriodEnd`.
-- Without the flag, the daily cron reads a paid plan reaching its period end
-- with no saved card as non-payment: it raises a Servd invoice, marks the
-- subscription past_due, and after MAX_PAST_DUE_DAYS suspends the restaurant.
-- The partner has been collecting in cash the whole time. Servd cannot know
-- whether they were paid, so it must not act as though they were not.
alter table subscriptions
  add column if not exists "billedExternally" boolean not null default false;

-- Every paid subscription that exists today was sold by a partner. Free (P0)
-- rows are left alone: they never bill, so the flag would mean nothing on them.
update subscriptions s
   set "billedExternally" = true
  from plans p
 where p.id = s."planId"
   and p."priceMonthly" > 0;

select s.id, r.name, p.name as plan, s.status, s."billedExternally", s."currentPeriodEnd"
from subscriptions s
join plans p on p.id = s."planId"
join restaurants r on r.id = s."restaurantId";
