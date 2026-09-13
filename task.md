# Phase 5 — brand engine ✅

Q4 and Q5 were the two open questions this phase needed. Both decided (D20, D21).

- [x] **Q4** — diner-facing surfaces render the *merchant's* brand; merchant-facing
      surfaces render the *partner's*. `src/server/branding/partner-brand.ts`
- [x] **Q5** — either the merchant's paid unlock or the partner's contracted brand
      mode removes the Servd badge; neither reinstates it. Grandfathering intact
- [x] `parseHost` gains a `partner` kind on a second root domain, inert until
      `NEXT_PUBLIC_PARTNER_ROOT_DOMAIN` is set
- [x] Middleware routes a partner host to the portal — shipped *before* the domain,
      because without it the first host configured would be looked up as a restaurant
- [x] 41 new tests, including an exhaustive identity property

## The gate — run, not asserted

The promise was that servdph.com renders identically. Built and served the app at
the **pre-Phase-5** source against a seeded database, captured three pages, then
rebuilt at the Phase-5 source and captured again:

| Page | Result |
|---|---|
| diner ordering page | **IDENTICAL** (20,354 chars) |
| restaurant page | **IDENTICAL** (18,386 chars) |
| platform home | **IDENTICAL** (105,134 chars) |

The raw captures differed by exactly three opaque fragments, which turned out to
be pieces of `.next/BUILD_ID` — random per build. Normalised out, byte-identical.

## Found while building the fixture — not fixed here

`hasFeature(restaurantId, "whiteLabel")` returns **true** for seeded demo
restaurants *and* for a restaurant with no plan and no subscription at all. So
`servdBranding` short-circuits on `ownsWhiteLabel` and the badge is suppressed
regardless of any partner term.

This is pre-existing, nothing to do with Phase 5, and it is why the end-to-end
fixture could not be made to exercise the partner arm — the unit tests carry that
proof instead. It may well be deliberate (a preview account with everything on).
Worth a look before the first external operator goes live, because a merchant who
has not paid for white-label should be showing the badge.

## Deferred, with reasons

**Surfacing the partner brand in merchant-facing UI.** The resolver and the
platform defaults are built and tested, but there is no support-contact element
in the admin shell to swap — the `servdph.com` references live in the badge, the
QR splash and outbound email. Wiring this means *designing* a support surface,
not rebranding an existing one, and that is a screen rather than a resolution
layer.

**The partner-host portal page itself.** `parseHost` and the middleware route it;
`getPartnerBrandBySlug` resolves it. What a partner's public front door actually
shows is a page nobody has specified.

## Next — Phase 6

Product adapter + scaffold for the next vertical. **Scope depends on Q7**, still
open: an adapter interface against `provisionMerchant` is about a week; migrating
laundry / Pharmacy / print-new into this monorepo is three repo migrations.
