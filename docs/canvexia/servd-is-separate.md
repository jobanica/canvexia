# CANVEXIA does not touch servdph.com

**Settled, and it replaces a document that said otherwise.** See D31.

`servdph.com` is a different business on a different database. CANVEXIA has its
own Supabase project, its own schema and its own merchants. The two are not
connected and will not be: **Servd inside CANVEXIA runs on a different domain**,
against the CANVEXIA database, starting from zero merchants.

## What this replaced

`deploy-runbook.md` used to live here. It described applying four hand-run
migrations and a merchant backfill **to servdph.com's production database**, and
it was the first item on this project's next-steps list for three rounds of
work.

It is deleted rather than corrected, because a runbook is an instruction. Left
in `docs/canvexia/`, someone follows it — and the thing it instructs is
modifying a production database that is not this project's. Its content is in
git history if it is ever wanted for that other system.

## What follows from the separation

**The four "pending" migrations are not pending here.** They existed to move an
already-populated servdph.com forward. The CANVEXIA database was built in one
pass from `schema.prisma` (D26), so `plans."priceFloor"`,
`restaurants."partnerId"`, `partners."gatewaySubAccountId"` and
`partner_ledger_entries` have been there since the first table.
`packages/db/prisma/manual/` is kept as the record of how the *schema* got its
shape — it is history, not a queue.

**The backfill has nothing to backfill.** `backfill-house-partner.mjs` gives an
owner to merchants that predate the `partnerId` column. On CANVEXIA no merchant
predates it: every restaurant and every pharmacy is created through the partner
portal, which sets ownership in the statement that creates the row. The script
still runs and correctly prints `Nothing to do.`

**Two grandfather rules are now inert, and should stay.** Both are dated or
tiered checks that no CANVEXIA row can satisfy:

- `POWERED_BY_SINCE` (2026-08-21) exempts restaurants trading before the
  "Powered by" badge existed. Every CANVEXIA restaurant is newer, so every one
  carries the badge.
- D2's rule that a legacy-tier partner must be on 0% revenue share. Every
  CANVEXIA partner is `operator` tier on a real share.

Neither is dead code to delete. They are guards, and a guard that currently
never fires is still the thing that catches the row somebody imports by hand.

## The domain

Servd's public address comes from **`NEXT_PUBLIC_APP_URL`** and nothing else.

It used to be written into the source in fourteen places — the diner-facing
"Powered by" badge, the QR splash, the partner support link, the prospecting
User-Agent, and ten `?? "https://servdph.com"` fallbacks. See
`apps/servd/src/lib/branding/app-domain.ts`, which is now the only place that
answers the question.

**Everything there degrades to absent, never to a guess.** A wrong domain is
worse than no domain: the badge is the one piece of Servd a diner sees, and
pointing it at a site this deployment does not run is the failure worth
engineering against. With nothing configured, links are relative — the page
links to itself — and the address line simply does not render.

One of those fourteen was a live bug rather than a cosmetic one. The super-admin
feedback page decided whether a reply would reach a real inbox by testing for
`@staff.servdph.com` spelled out. On a different domain that test says **every**
synthetic login is a real inbox, and the reply form tells whoever is writing
that their answer was emailed when it was not. It now asks
`isSyntheticLogin()`, which reads the configured domain.

Set these before deploying Servd:

| | |
|---|---|
| `NEXT_PUBLIC_APP_URL` | the public address, e.g. `https://www.example.ph` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | where merchant subdomains live |
| `NEXT_PUBLIC_PARTNER_ROOT_DOMAIN` | where partner subdomains live (optional) |
| `INTERNAL_LOGIN_DOMAIN` | synthetic staff logins; derived from the root domain when unset |
| `NEXT_PUBLIC_SUPPORT_MESSENGER` | support handle or URL (optional) |

## One thing that is still true of the other system

`servdph.com` has the RLS hole described in **D27**: Supabase grants the
browser-side `anon` key full read/write on any table without a policy, and
twelve tables there have none — including `prospect_leads`, which holds the
names, phone numbers, email addresses and street addresses of sales leads.

That is **not this project's work** and nothing here will fix it. It is recorded
because it is a real exposure on a real system holding real people's contact
details, and whoever runs that system should know. The fix is one command there:
`rls.sql` in this repository closes it, and its final sweep covers those twelve
tables.
