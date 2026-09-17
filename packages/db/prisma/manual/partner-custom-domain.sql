-- A partner's own domain, as a request.
--
-- The page said "not wired up yet, tell HQ which one" and then gave no way to
-- tell HQ and no DNS records to add — so a partner who wanted their own address
-- had nothing to do next. This records the name they want and how far it has
-- got; the DNS instructions are rendered from it.
--
-- Not self-serve, and honestly so: attaching a domain is a write to the hosting
-- project with a credential this deployment does not carry. Pretending
-- otherwise would leave domains stuck in "verifying" with nothing driving them.
alter table partners
  add column if not exists "customDomain" text,
  add column if not exists "customDomainState" text;

select count(*) filter (where "customDomain" is not null) as requested from partners;
