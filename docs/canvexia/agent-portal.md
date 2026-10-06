# Agent portal — runbook

`apps/agent-portal`, deployed at **agents.canvexia.com**. Decisions: D37 in
`decisions.md`. This file is the order of operations to switch it on.

## 1. Database (once, in this order)

```
psql "$DIRECT_URL" -f packages/db/prisma/manual/add-agent-portal.sql
psql "$DIRECT_URL" -f packages/db/prisma/manual/add-product-connection-kit.sql
psql "$DIRECT_URL" -f packages/db/prisma/manual/add-agent-callback-outbox.sql
psql "$DIRECT_URL" -f packages/db/prisma/manual/add-resceta-connection-kit.sql
psql "$DIRECT_URL" -f packages/db/prisma/manual/retire-gateway-billing.sql
pnpm db:rls
```

The first four are additive. The fifth (D38) moves every restaurant to manual
billing and queues a signup event for each live one; it is safe to re-run. `db:rls` must run after them: it holds the agent and
verifier policies, the append-only triggers on the commission ledger and audit
log, and the verifier column guard. A database built fresh from the schema
(D26) needs only `db:rls`.

## 2. Storage

Supabase → Storage → new bucket **`agent-portal-private`**, Public **off**.
Receipts, signatures and contract PDFs go there and are only ever served
through five-minute signed URLs.

## 3. The portal deployment

A third Vercel project, Root Directory `apps/agent-portal`, Node 22, "Include
source files outside of the Root Directory" on. Variables: see
`apps/agent-portal/.env.example` — `CREDENTIALS_ENCRYPTION_KEY`,
`CONTRACT_LINK_SECRET` and `CRON_SECRET` are new values, not Servd's.
Crons (`vercel.json`): events retry every 10 min, callbacks every 5 min.

First admin:

```
pnpm --filter agent-portal staff:create -- admin you@canvexia.com '<password>'
pnpm --filter agent-portal staff:create -- verifier checker@canvexia.com '<password>'
```

## 4. In the portal, as admin

1. **Agent agreement** — publish one. Applications are closed until you do.
2. **Contract templates** — publish the customer subscription agreement
   (global, or per product). The starter text is a placeholder, not legal text.
3. **Products** — create `servd` and `pharmacy`. Each shows its API secret
   once. Set the signup URL (agents' links) and the callback URL:
   - Servd: `https://www.servdph.net/api/agent-portal/callbacks`
   - Resceta: `https://resceta.com/api/agent-portal/callbacks`
4. **Commission rules** — add one per product (the form is pre-filled with
   ₱500 / ₱800 / ₱500 / ₱200 × 6 / ₱100).
5. **Settings** — the defaults are the brief's; change any of them here.

## 5. The products

Servd and Resceta each need `AGENT_PORTAL_URL`, `AGENT_PORTAL_PRODUCT_SLUG`,
`AGENT_PORTAL_SECRET` and the four `PAYMENT_*` variables (see each app's
`.env.example`), plus `HOUSE_PARTNER_EMAIL` for Resceta. Until they are set,
signups still work and their events wait in `product_event_outbox`.

## Day to day

- **Verifiers** work `/admin/queue`, oldest first; red rows are over 24 hours.
- **Payouts**: on the payout day, `/admin/payouts` → generate for the month →
  approve each → send the money → mark paid with the transfer reference.
- **Failed callbacks** show on the overview. A product that was down catches
  up on its own; one answering 4xx needs looking at.

## Retiring the gateway (D38)

- In the Xendit and PayMongo dashboards, remove the webhooks pointing at
  `/api/webhooks/*` — they now answer 410 — and stop any recurring invoices.
- Set `AGENT_PORTAL_URL` on Servd too: partner hosts redirect there, and the
  homepage's "Become an agent" link uses it.
- Pharmacies are activated from Servd super-admin → **Pharmacies**.
