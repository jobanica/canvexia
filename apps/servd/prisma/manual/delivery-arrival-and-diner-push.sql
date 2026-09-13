-- The rider is at the door, and the diner's phone should say so.
--
-- Two additions, both nullable, both safe to run on a live database while it is
-- serving: nothing reads these columns until the code that writes them ships.
--
--   psql "$DATABASE_URL" -f prisma/manual/delivery-arrival-and-diner-push.sql

alter table delivery_bookings
  add column if not exists "arrivedAt"       timestamp(3),
  add column if not exists "lastMessageAt"   timestamp(3),
  add column if not exists "lastMessageBody" text;

-- A push subscription that belongs to one diner's order rather than to a
-- restaurant's till. Merchant sends match on restaurantId and never look at
-- this column, so the two audiences cannot reach each other.
alter table push_subscriptions
  add column if not exists "orderId" text;

create index if not exists push_subscriptions_order_idx on push_subscriptions ("orderId");
