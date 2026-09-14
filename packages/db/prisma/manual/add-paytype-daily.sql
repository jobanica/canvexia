-- Adds the "daily" pay type for employees. Run in the Supabase SQL editor.
-- Safe to re-run (IF NOT EXISTS). Cannot run inside an explicit transaction
-- block — paste and run on its own.
ALTER TYPE "PayType" ADD VALUE IF NOT EXISTS 'daily';
