-- In-person e-wallet payments at the cashier (customer scans the store's QR).
-- Distinct from online_gcash, which is a payment made on the ordering website.
-- Run in the Supabase SQL editor. Idempotent.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'gcash';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'maya';
