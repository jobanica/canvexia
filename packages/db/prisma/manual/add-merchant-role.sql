-- Merchant "Incoming Orders" screen. Adds a focused staff role (online-orders
-- only, no full cashier UI) plus two optional Order columns: a prep-time
-- estimate set on accept, and a reject reason. Run in the Supabase SQL editor.
-- Idempotent.
--
-- NOTE: "ALTER TYPE ... ADD VALUE" cannot run inside a transaction block and the
-- new value can't be used in the same transaction. Run this whole file once; the
-- merchant role is then usable in later sessions.

ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'merchant';

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "prepMinutes" INTEGER;     -- ETA set when accepted
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;       -- reason a merchant rejected
