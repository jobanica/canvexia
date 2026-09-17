-- Invoices a PARTNER issues to their own merchant, after confirming a payment.
--
-- Reusing restaurant_invoices rather than a parallel table: the merchant's
-- billing screen already lists these as "Payment history", so a partner-issued
-- receipt appears where an owner already looks instead of in a second place
-- they have to be told about.
--
-- `issuedByPartnerId` is what separates the two. Null means Servd billed the
-- restaurant itself, which is what every row before today meant.
alter table restaurant_invoices
  add column if not exists "invoiceNo" text,
  add column if not exists "issuedByPartnerId" text;

-- Unique so a duplicate number can never be printed on two different invoices.
-- The number is built from the row id, so a collision means a bug rather than a
-- race, and failing loudly is right.
create unique index if not exists restaurant_invoices_invoice_no
  on restaurant_invoices ("invoiceNo") where "invoiceNo" is not null;

-- One invoice per confirmed renewal. `providerRef` already carries
-- `renewal:{id}`, and without this a re-confirm would print a second invoice
-- for one payment.
create unique index if not exists restaurant_invoices_provider_ref
  on restaurant_invoices ("providerRef") where "providerRef" is not null;

select count(*) as invoices from restaurant_invoices;
