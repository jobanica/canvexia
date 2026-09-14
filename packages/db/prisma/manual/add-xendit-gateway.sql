-- Adds the Xendit option to the payment Gateway enum so restaurants can accept
-- online payments via Xendit (GCash, cards, etc.). Run in the Supabase SQL
-- editor. Safe to re-run. (ADD VALUE IF NOT EXISTS must run on its own.)
ALTER TYPE "Gateway" ADD VALUE IF NOT EXISTS 'xendit';
