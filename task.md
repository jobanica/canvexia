# Phase 4 — per-partner gateway, suspension, ledger ✅

## 4a — The settlement security fix

Six handlers settled a payment by gateway reference **alone**. Sound with one
trusted gateway; not sound with N sub-accounts, where a reference unique inside
one account need not be unique across them.

- [x] All six take an explicit `SettlementScope` — a tagged union, so
      `PLATFORM_SCOPE` has to be written out rather than defaulted into
- [x] `Partner.gatewaySubAccountId` + migration (an identifier, not a secret)
- [x] `getBillingProviderForPartner()`, and the unverified sub-account mechanism
      alone in `subaccount.ts` behind `SUB_ACCOUNT_MECHANISM_CONFIRMED = false`
- [x] `/api/webhooks/billing/[partnerId]` — per-partner route
- [x] `settle.ts` — one ordered chain shared by both webhook routes
- [x] Outbound checkout resolves through the owning partner (D19)

**Deviation from the plan, deliberately.** It said retire `/api/webhooks/billing`
with a 410. That was wrong — the URL is configured in the gateway dashboard and
is how subscriptions settle today. It stays live on `PLATFORM_SCOPE`.

## 4b — Suspension that does not depend on `failedCharges`

- [x] `MAX_PAST_DUE_DAYS = 14`, keyed on the oldest unpaid invoice
- [x] **A second bug on the same path:** the daily cron raised a *new* invoice on
      every run for a past-due merchant. Thirty days late meant thirty open
      invoices for one month of service. Now raises one only when nothing is
      outstanding.

## 4c — The ledger (D15)

- [x] `PartnerLedgerEntry` — one row per settled payment, written in the same
      transaction that grants the access it paid for
- [x] `providerRef` unique → a replayed webhook credits nobody twice
- [x] `sharePct` snapshotted → renegotiating a rate cannot rewrite past statements
- [x] Excluded from the tenant RLS loop with a partner-and-HQ-only policy — each
      row holds the partner/HQ split, which is not the merchant's business

## Verification

Offline: typecheck ✅ · **942 tests** ✅ (was 933) · build ✅ 118 pages.

Live PostgreSQL 16, along the upgrade path production takes — push the **Phase 3**
schema, then the two Phase 4 migrations:

| Check | Result |
|---|---|
| `add-partner-subaccount.sql` + `add-partner-ledger.sql` on a Phase 3 DB | ✅ clean, self-checks true |
| Column/table drift afterwards | ✅ none |
| `db:rls` with the ledger policies | ✅ `ledger_read` (SELECT) + `ledger_write` (ALL) |
| **DB-backed suite** | ✅ **32/32 across 5 files** |
| Partner A settling partner B's invoice | ✅ refused, invoice still open, no ledger row |
| Owning partner settling it | ✅ paid, split recorded at **65%** — B's negotiated rate, not the 70 default |
| Replayed webhook | ✅ exactly one ledger row |
| Merchant reading the ledger | ✅ zero rows |
| Partner reading the ledger | ✅ their own entries only |

## Deferred, with reasons

**The monthly statement job and its UI.** The ledger is the part everything else
reads and it is now verified against a real database on its own. A statement is a
query over it plus a cron entry.

**Xendit's recurring / card-on-file API.** Needs
`docs/canvexia/xendit-questions.md` §2 answered — specifically whether it works
inside the platform arrangement at all. 4b makes its absence survivable rather
than silent, which is what made this deferrable.

**The five other checkout sites** (add-ons, features, branch, DIY activation)
still resolve to the platform account. Correct today — every merchant belongs to
the house partner, whose money is CANVEXIA's — and they are one-off platform
charges rather than partner-shared subscription revenue. They follow when the
first external operator onboards.

## Before any of this is real

`SUB_ACCOUNT_MECHANISM_CONFIRMED` is **false**, and a partner-scoped gateway call
throws while it is. That is deliberate: with N partners' revenue moving through
one platform credential, a call whose sub-account binding is wrong does not fail
— it succeeds, into the wrong account. Flip it once xendit-questions.md §1.1–1.2
are answered and a sandbox call has been seen to land in the right sub-account.
