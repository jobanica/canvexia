# Questions for Xendit

Written to be taken into the call and filled in. The direction is decided —
**Option B, CANVEXIA as the platform, partners as sub-accounts** (D5) — so most
of this is confirming the ground that decision stands on rather than choosing
between options.

Two answers can **reopen** D5 rather than refine it: §1.1 (does the arrangement
exist for us) and §2.1 (does recurring charging work inside it). Everything else
changes details.

Claims marked ✅ were verified in this codebase. Claims about Xendit's products
are questions, not assumptions — nobody here has confirmed them.

---

## 1. The platform arrangement

**1.1 — Do you offer a platform / marketplace arrangement** where sub-accounts
settle to their own owners and the platform takes an automatic cut? What is it
called, and is it available to a Philippine company at our stage?

> ☐ Answer:

**1.2 — Can sub-accounts be created programmatically**, or does each partner
onboard through a manual process? This is the difference between partner signup
being one form and being a two-week wait, which changes what we promise partners.

> ☐ Answer:

**1.3 — Can the platform fee be a percentage, and can it differ per sub-account?**
Ours is per-partner by design and genuinely varies: partners on the legacy
agreement are at 0%, CANVEXIA operators at 70/30 (D2).

> ☐ Answer:

**1.4 — What KYC does a sub-account owner go through, and how long does it take?**
This is the cost we accepted when choosing B, so we need the real number to tell
partners.

> ☐ Answer:

**1.5 — If a partner leaves**, can their sub-account be detached or transferred,
or does it end? We can reassign a merchant between partners already; we need to
know whether the payment relationship can follow.

> ☐ Answer:

---

## 2. Recurring charging — already a live problem

✅ Verified in `apps/servd/src/server/billing/xendit.ts:68-72`:
`chargeSavedCard()` is a deliberate no-op returning `pending`, with a comment
saying off-session charging needs Xendit's recurring / payment-methods API.

✅ The consequence, traced through `run-cron.ts` and `lifecycle.ts`: no
payment-method id is ever captured → `hasSavedCard` is always false → every
merchant is issued a manual invoice and set `past_due` every cycle → and because
`failedCharges` only increments in the charge-*failure* branch, which is
unreachable on this path, **non-payment never escalates to suspension.** A
merchant can sit unpaid indefinitely and keep using the product.

**2.1 — Do you support card-on-file / tokenised recurring charges** on our
account type? What is it called and what does enabling it involve?

> ☐ Answer:

**2.2 — Does it work inside the platform arrangement, or only on standalone
accounts?** If recurring only works standalone, that is a real argument back
toward Option A and D5 should be reopened, not worked around.

> ☐ Answer:

**2.3 — Is there a hosted flow that both takes the first payment and returns a
reusable token**, so a merchant's first invoice sets up every month after it?

> ☐ Answer:

---

## 3. Webhooks

✅ Verified: `verifyAndParseWebhook` does a timing-safe compare against **one**
`callbackToken`, and `getBillingProvider()` is a process-wide singleton reading a
single `PlatformSetting` row. Both assume exactly one gateway account exists.

**3.1 — Does each sub-account have its own `x-callback-token`?** We have assumed
yes and designed a per-partner webhook URL accordingly.

> ☐ Answer:

**3.2 — Can the platform receive one webhook stream for all sub-accounts**,
authenticated by the platform's own token? That is simpler than per-partner URLs
and we would prefer it.

> ☐ Answer:

**3.3 — Does the payload identify which sub-account the event belongs to?**

This one is security, not convenience. ✅ `activateByProviderRef()` currently
settles an invoice by gateway reference alone — safe when every reference came
from one trusted account, unsafe when references are minted by N accounts with
different trust boundaries. We are partner-scoping those lookups either way; the
answer decides whether we scope by URL or by payload.

> ☐ Answer:

---

## 4. Money mechanics

**4.1 — Settlement timing.** How long from a merchant paying to the partner
having the money? Partner statements reconcile against **settled**, not issued.

> ☐ Answer:

**4.2 — Refunds and chargebacks.** Who is debited, and does a refund
automatically reverse the platform fee? If not, a statement can show revenue that
later evaporates and we need to model the reversal ourselves.

> ☐ Answer:

**4.3 — Does the PHP invoice amount accept centavos?**

✅ Our integration does `Math.round(amount / 100)` because the code comment says
PHP amounts are whole pesos. We store money as integer centavos. So a partner
pricing at ₱999.50 would be silently charged ₱1,000. Harmless while every plan is
a whole peso; not harmless once partners set their own prices, which is the
entire point of the partner model.

> ☐ Answer:

---

## 5. Fees — the commercial question underneath

**5.1 — What are the actual rates by method** (card / GCash / bank transfer /
over-the-counter)?

> ☐ Answer:

**5.2 — Under the platform arrangement, who is charged the transaction fee** —
the platform or the sub-account?

> ☐ Answer:

**Then a decision for CANVEXIA, not for Xendit: is the 70/30 split on gross or on
net of fees?** On ₱999 at roughly 2–3.5% that is ₱20–35 per transaction. Whether
the partner absorbs it, CANVEXIA absorbs it, or it comes off the top before
splitting is a contract term. Settle it now; renegotiating it across fifty
partners later is a different kind of conversation.

> ☐ Decision:

---

## 6. Practical

**6.1 — Is there a sandbox that supports sub-accounts?** Phase 4a cannot be built
or tested against a real gateway, and every other phase so far has been verified
against something real before shipping.

> ☐ Answer:

**6.2 — Anything contractual that restricts re-selling payment acceptance** to
partners under our own brand? Worth asking explicitly rather than discovering in
a terms document later.

> ☐ Answer:

---

## The three that unblock code

Everything above refines the design. These decide it:

1. Platform arrangement available — **yes / no**
2. Recurring charging available, and in which topology
3. One webhook endpoint, or one per sub-account

A "no" on 1 or a "standalone only" on 2 sends D5 back to Option A.
