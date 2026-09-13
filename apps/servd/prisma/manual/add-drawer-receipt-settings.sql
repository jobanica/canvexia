-- Two till behaviours that used to be fixed, made into settings.
--
-- autoPrintReceipt — a receipt printed on every settled payment with no way to
-- turn it off. A till whose customers don't take one was burning a roll a day.
-- Defaults true, which is exactly what every existing restaurant has now, so
-- running this changes nothing until somebody unticks the box.
--
-- openDrawerOn — the cash drawer never opened at all; cashiers were pulling it
-- by hand on every sale. The drawer plugs into the receipt printer and opens
-- when the printer is sent a pulse, so this is a printing setting.
--   never | cash | any
-- Defaults to 'cash': a card or e-wallet sale puts nothing in the drawer, and
-- popping it open on every transaction is a habit worth not starting. A till
-- that hands back change for GCash can choose 'any'.
--
-- Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "autoPrintReceipt" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "openDrawerOn" TEXT NOT NULL DEFAULT 'cash';
