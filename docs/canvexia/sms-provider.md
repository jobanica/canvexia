# SMS provider — what we have, and what we still need from Semaphore

CANVEXIA sends SMS through **Semaphore**, the Philippine A2P aggregator, on one
platform account. Merchants and partner operators both draw on it; usage is
metered per sender through the credit ledger.

This document exists because two things in that integration were written
against a **guess**, and a guess in a webhook handler is invisible until the
day it silently drops something.

---

## What works today

| | |
|---|---|
| Sending | `POST https://api.semaphore.co/api/v4/messages`, implemented in `apps/servd/src/server/sms/semaphore.ts` |
| Auth | `apikey` in the JSON body, from `SEMAPHORE_API_KEY` |
| Sender name | per merchant (`restaurants.smsSenderName`) or per partner (`partners.smsSenderName`, once HQ marks it approved); CANVEXIA's default until then |
| Inbound | `POST /api/webhooks/sms` — accepts `{sender|from, message|text}` |

## What is a guess

### 1. The inbound payload shape

`semaphore.ts` says, in its own comment:

> Semaphore inbound payloads vary by setup; accept the common shape.

It reads `sender ?? from` and `message ?? text`. That covers the shapes other
integrations use. **It has never been verified against a real delivery from
Semaphore.**

If the real payload nests the message (`{data: {...}}`), or names the fields
anything else, every inbound message is silently ignored — including **every
STOP**, which is the one that matters. A person who texts STOP would keep
receiving marketing, and nothing in any log would say so.

**What we need:** one real inbound webhook body, verbatim. A screenshot of the
dashboard's test delivery is enough.

### 2. Delivery receipts

**Not handled at all.** There is no DLR endpoint and no status callback.
`sms_messages.status` is therefore written once at send time as `sent` or
`failed`, and `delivered` is never reached — so the campaign status column and
the analytics that A8.5 builds on it are decorative until this is wired.

The refund rule also depends on it: the brief says a failed message refunds its
credit, and "failed" is a thing only the network can tell us after the fact.

**What we need:**

- the DLR callback URL format Semaphore posts to, and how it is configured;
- the payload, verbatim;
- the status vocabulary and which of them are final;
- whether the message id in the DLR is the `message_id` returned by the send
  call (the one stored in `sms_messages.providerRef`).

### 3. Per-segment price

Not in this repository, and **deliberately not guessed**. The partner statement
has a pass-through line for what a segment costs us; a made-up figure there
produces a made-up margin on a document an operator uses to decide whether this
business is worth running.

Until a real figure is entered in `platform_settings.smsProviderCostCentavos`,
`providerCostLine()` prints *"Provider cost not configured"* rather than a
number. See `packages/core/src/sms/credits.ts`.

**What we need:** the per-segment rate actually billed, and whether it differs
by network (Globe / Smart / DITO) or by volume tier.

### 4. Sender-name registration

Registration is manual with the aggregator. `partners.smsSenderStatus` carries
`none | pending | approved | rejected` and sends fall back to CANVEXIA's
registered default until it is `approved`, because an unregistered sender name
is rejected by the network rather than by us.

**What we need:** the turnaround time and what documents an operator must
supply, so the portal can say so instead of leaving people waiting.

---

## Until then

Everything above is stubbed **behind the provider interface**
(`packages/core/src/sms/provider.ts`), so answering these questions means
editing one implementation file and not the campaign, consent or wallet code.

The inbound handler is deliberately forgiving — an unrecognised payload returns
200 and changes nothing, rather than erroring — because a webhook that 500s
gets retried and then disabled by the provider.
