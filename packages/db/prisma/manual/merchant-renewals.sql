-- The renewal loop: a merchant taps Renew, pays the partner off-system, uploads
-- the receipt, and the partner confirms it. Confirmation is what extends the
-- subscription AND writes the ledger row carrying CANVEXIA's 30%.
--
-- Nothing automated can do this. A partner-sold shop pays in cash or by
-- e-wallet, so there is no webhook to believe — the evidence is a photograph
-- and a human who recognises the payment.

alter table partners
  add column if not exists "payQrPath" text,
  add column if not exists "payInstructions" text;

create table if not exists merchant_renewals (
  id               uuid primary key default gen_random_uuid(),
  "partnerId"      text not null,
  "productId"      text not null default 'servd',
  "merchantId"     text not null,
  -- Editable at confirm time: the 30% is a share of what was really charged,
  -- not of the list price, and a partner may charge above the floor.
  "amountCentavos" integer not null,
  months           integer not null default 1,
  status           text not null default 'requested',
  "receiptPath"    text,
  note             text,
  "requestedAt"    timestamptz not null default now(),
  "receiptAt"      timestamptz,
  "decidedAt"      timestamptz,
  "decidedBy"      text,
  -- PartnerLedgerEntry.providerRef of the row this produced. Only ever set on a
  -- confirmed renewal, and what stops a double-confirm paying twice.
  "ledgerRef"      text,
  "createdAt"      timestamptz not null default now(),
  "updatedAt"      timestamptz not null default now()
);

create index if not exists merchant_renewals_partner_status
  on merchant_renewals ("partnerId", status);
create index if not exists merchant_renewals_merchant_status
  on merchant_renewals ("merchantId", status);

-- A merchant may have only ONE renewal in flight. Without this, tapping Renew
-- twice makes two requests, the partner confirms both, and the shop is extended
-- two months for one payment.
create unique index if not exists merchant_renewals_one_open
  on merchant_renewals ("productId", "merchantId")
  where status in ('requested', 'receipt_uploaded');

select count(*) as renewals from merchant_renewals;
