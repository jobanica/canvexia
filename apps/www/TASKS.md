# apps/www — execution checklist

The antigravity Mode C checklist for `implementation_plan.md`. It lives here
rather than in the repo root's `task.md`, which is this project's live status
doc and was not a scratch file to overwrite.

## 1. Schema, RLS, seed

- [x] `Territory` + `PartnerWaitlist` models, `public` schema (A4)
- [x] `packages/db/prisma/manual/add-partner-waitlist.sql` — tables, enums,
      indexes, FK, `super_only` policies, `REVOKE ALL … FROM anon`
- [x] `packages/db/prisma/territories.mjs` — 143 cities, one line each
- [x] `packages/db/prisma/seed-territories.mjs` — idempotent upsert on `slug`,
      never resets `status` on an existing row
- [x] `apps/www/tests/isolation/waitlist.test.ts` — anon cannot read, anon
      cannot insert, position counts per city
- [x] **Migration run** against the live database — 2 tables, 2 policies,
      `FORCE ROW LEVEL SECURITY`, and zero grants to `anon` or `authenticated`
- [x] **Seed run** — 143 cities: 26 large, 47 mid, 69 small, 1 HQ. Verified
      against the brief: Cebu City → large ₱79,000, Digos → mid ₱49,000,
      Mati → small ₱29,000, Davao City → hq
- [x] **Isolation proved in SQL** against the real database: as `anon` and as
      `authenticated`, SELECT and INSERT on `partner_waitlist` both fail with
      `42501 permission denied` — refused at the grant, not merely filtered by
      a policy
- [ ] **Run `tests/isolation/waitlist.test.ts` itself.** Postgres ports are not
      reachable from the session that wrote this (only HTTPS is), so the suite
      has still never executed. The SQL above proves the same property; the
      suite is what keeps it proved.

## 2. Shared helpers into packages/db

- [x] `packages/db/src/waitlist.ts` — `joinWaitlistIn(tx, input)`, position
      query, duplicate collapse
- [x] `packages/db/src/rate-limit.ts` — window arithmetic + upsert, shared
- [x] `apps/servd/src/server/build/rate-limit.ts` now calls it
- [ ] Email. Deliberately not moved: there is no key to send with (B1).

## 3. App shell

- [x] Scaffold, palette, fonts, globals
- [x] `Nav` (sticky, hamburger), `Footer`, `/privacy`, `/terms`, `/login` stub

## 4. Static sections

- [x] 1 Hero · 2 Steps · 3 What you get · 4 Products · 6 Tier cards ·
      "Why this isn't networking" · 7 For whom · 8 Founder · 9 Cities on the
      waitlist · 12 Footer

## 5. Interactive

- [x] 5 Calculator — `earnings()` tested, 30 × ₱999 → ₱20,979
- [x] 6 City finder — Cebu City → Large ₱79,000, Digos → Mid ₱49,000,
      Mati → Small ₱29,000, Davao City → HQ
- [x] 10 FAQ — `<details>`, no JavaScript

## 6. Form

- [x] 11 Waitlist form, server action, per-city position in the success state
- [x] `lib/waitlist-input.ts` + 17 tests (PH mobile, required fields)
- [ ] Confirmation email — blocked on `CREDENTIALS_ENCRYPTION_KEY` (B1). The
      success state says no email is coming rather than promising one.

## 7. Metadata

- [x] Title, description, keywords, OG tags
- [x] `opengraph-image.tsx` — no build-time font fetch
- [ ] Lighthouse mobile ≥ 90 — not measured; needs a deployment.

## 8. Deploy

- [x] Vercel project `canvexia-www`, root `apps/www`, Node 22.x, source files
      outside the root directory ON, Vercel Authentication OFF
- [x] Live at **https://canvexia-www.vercel.app**
- [ ] `canvexia.com` → this app (see `docs/canvexia/domains.md` — it is a
      two-step flip and both steps go together)
- [ ] Portal to `partner.canvexia.com` — `parseHost`, the middleware,
      `NEXT_PUBLIC_PARTNER_ROOT_DOMAIN`, and inverting
      `apps/servd/tests/host/host.test.ts`

## Not done, and why

| Item | Reason |
|---|---|
| Isolation suite executed | Only HTTPS leaves this environment, so Prisma cannot reach Postgres. The property is proved in SQL instead |
| Confirmation email | No encryption key, no Resend key, no verified domain |
| Social links | Handles were never supplied; a guessed link is worse than none |
| Real screenshots | None in the repo; `ScreenFrame` is schematic and claims nothing |
| Logo as a file | It is on the founder's desktop; `Brand.tsx` redraws it and says so |
| `[registration details]` | Asked for as a placeholder to fill in |
