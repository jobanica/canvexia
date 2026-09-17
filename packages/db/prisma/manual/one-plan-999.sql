-- ONE PLAN: Standard, ₱999/mo, everything except the content scheduler.
--
-- Servd had drifted to having no monthly plan at all: `Free`, `Growth` and
-- `Business` survived as rows, all three with an EMPTY features array, and the
-- real pricing was a shelf of one-time unlocks. This replaces that with a single
-- subscription.
--
-- THREE THINGS THIS DELIBERATELY DOES NOT DO:
--
--   1. It does not touch a single existing subscription or restaurant. Shops on
--      Free stay on Free, keep whatever they bought outright, and are never
--      billed for this. A one-time unlock was sold precisely so nobody would be
--      charged monthly, and migrating those accounts would break that bargain.
--   2. It does not delete Growth or Business. Deactivating them keeps them off
--      every picker while leaving historical invoices and any row that still
--      points at them readable.
--   3. It does not deactivate Free. `getFreePlan()` is the downgrade target
--      when a trial lapses and the home of every grandfathered account; taking
--      it away would strand both.
--
-- `features` is written out IN FULL rather than left empty. An empty array
-- means "fall back to the tier defaults", and `getPlanAccess` resolves an
-- unknown plan name to ALL_FEATURES — which would have handed out the content
-- scheduler. (`getEntitledFeatures` strips monthly-billed features anyway, so
-- that is belt and braces, which is the right amount for the one feature this
-- plan is defined by excluding.)
--
-- priceFloor = priceMonthly: partners resell this and set their own price, and
-- CANVEXIA's share is a cut of what was actually charged. The floor stops one
-- operator undercutting another into HQ's revenue.

insert into plans (id, name, "priceMonthly", "priceFloor", limits, features, "trialDays", "isActive")
values (
  '00000000-0000-0000-0000-0000000000a4',
  'Standard',
  99900,
  99900,
  '{}'::jsonb,
  array[
    'onlineOrdering','onlinePayments','loyalty','promotions','customers','sms',
    'aiMenuImport','floorPlan','giftCards','reservations','dataExport','auditLog',
    'offline','accounting','inventory','hr','customDomain','whiteLabel',
    -- Included. It is "everything", and the ₱500 one-time unlock it replaces is
    -- retired along with the rest of that shelf.
    'unlimitedTables'
    -- 'contentScheduler' is ABSENT on purpose: its own ₱499/mo subscription.
  ]::text[],
  30,
  true
)
on conflict (id) do update set
  name = excluded.name,
  "priceMonthly" = excluded."priceMonthly",
  "priceFloor" = excluded."priceFloor",
  features = excluded.features,
  "trialDays" = excluded."trialDays",
  "isActive" = true;

-- Off every picker, still readable from history.
update plans set "isActive" = false
where id in ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3');

select id, name, "priceMonthly", "priceFloor", "isActive", cardinality(features) as n_features
from plans order by "priceMonthly";
