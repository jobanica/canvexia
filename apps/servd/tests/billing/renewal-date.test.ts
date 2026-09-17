import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextBillingAction } from "@/lib/billing/lifecycle";
import { codeAt } from "../support/source";

/**
 * "Add the expiration of their account, so they can renew in advance."
 *
 * There was no expiration to add. A Standard conversion wrote
 * `currentPeriodEnd: trialEndsAt`, which is null outside a trial — so a ₱999/mo
 * subscription had no period end at all, and `nextBillingAction` reads a null
 * boundary as "not yet due". It never came due, never renewed, and the owner
 * had nothing to renew before.
 *
 * Populating that date is not free: the daily cron reads a paid plan reaching
 * its period end with no saved card as non-payment, raises an invoice, marks
 * the subscription past_due, and eventually SUSPENDS the restaurant. On a
 * partner-sold account, where the partner collects in cash off this system,
 * every one of those steps is wrong. Hence `billedExternally`.
 */

describe("a null period end never came due", () => {
  const now = new Date("2026-09-17T00:00:00Z");

  it("is the bug: no boundary means no billing, ever", () => {
    const d = nextBillingAction(
      {
        status: "active",
        trialEndsAt: null,
        currentPeriodEnd: null,
        failedCharges: 0,
        cancelAtPeriodEnd: false,
        hasSavedCard: false,
        oldestOpenInvoiceAt: null,
      },
      now,
    );
    expect(d.action).toBe("none");
    expect(d.reason).toBe("not yet due");
  });

  it("a real date does come due, which is what needed guarding", () => {
    const d = nextBillingAction(
      {
        status: "active",
        trialEndsAt: null,
        currentPeriodEnd: new Date("2026-09-16T00:00:00Z"),
        failedCharges: 0,
        cancelAtPeriodEnd: false,
        hasSavedCard: false,
        oldestOpenInvoiceAt: null,
      },
      now,
    );
    // Invoice + past_due, and MAX_PAST_DUE_DAYS later a suspension.
    expect(d.action).toBe("await_payment");
  });
});

describe("Servd does not collect from a partner-sold shop", () => {
  const cron = codeAt("src/server/billing/run-cron.ts");
  const convert = codeAt("src/server/storefront-demo/convert.ts");

  it("skips every billing action on an externally billed subscription", () => {
    expect(cron).toContain("if (sub.billedExternally) continue;");
  });

  it("skips BEFORE it can invoice, suspend or charge", () => {
    const guard = cron.indexOf("if (sub.billedExternally) continue;");
    expect(guard).toBeGreaterThan(-1);
    for (const later of ['decision.action === "suspend"', "restaurantInvoice.create", "chargeSavedCard"]) {
      expect(cron.indexOf(later), later).toBeGreaterThan(guard);
    }
  });

  it("does not quietly roll the period forward instead", () => {
    // Auto-renewing would make the date permanently read "paid up" — the one
    // thing it must never say when nobody has checked whether they paid.
    const guardBlock = cron.slice(
      cron.indexOf("if (sub.billedExternally)") - 200,
      cron.indexOf("if (sub.billedExternally)") + 60,
    );
    expect(guardBlock).not.toContain("addMonths");
  });

  it("marks a partner conversion as externally billed, and gives it a date", () => {
    expect(convert).toContain('const billedExternally = billing === "standard"');
    expect(convert).toContain('billing === "standard" ? addMonths(new Date(), 1) : trialEndsAt');
    expect(convert).toContain("currentPeriodEnd: periodEnd");
  });
});

describe("the owner can see when to renew", () => {
  const page = codeAt("src/app/(platform)/admin/billing/page.tsx");

  it("shows the date the account is paid up to", () => {
    expect(page).toContain("const paidUntil =");
    expect(page).toContain("Your plan runs until");
  });

  it("counts the days, and says so louder as it approaches", () => {
    expect(page).toContain("const renewSoon = untilDays !== null && untilDays <= 14");
    expect(page).toContain("renew now so nothing stops");
  });

  it("says plainly when it has already run out", () => {
    expect(page).toContain("Your plan has run out");
  });

  it("stays quiet during a trial and on the ₱0 plan", () => {
    // The trial banner already answers "how long have I got", and two
    // countdowns disagreeing is worse than one. Free rolls forward forever, so
    // a date on it would be a deadline nobody has.
    expect(page).toContain("!onTrial && (sub?.plan.priceMonthly ?? 0) > 0");
  });

  it("sends them to whoever sold them the account, not to a card form", () => {
    // Servd is not collecting this money.
    const block = page.slice(page.indexOf("Your plan runs until"));
    expect(block.slice(0, 900)).toContain("whoever set up your account");
  });
});

describe("the migration", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), "../../packages/db/prisma", p), "utf8");

  it("defaults the flag off, so nothing existing changes meaning", () => {
    const sql = read("manual/subscription-billed-externally.sql");
    expect(sql).toContain("not null default false");
  });

  it("only flags paid plans, never the ₱0 rows", () => {
    // Free never bills, so the flag would mean nothing on it.
    const sql = read("manual/subscription-billed-externally.sql");
    expect(sql).toContain('p."priceMonthly" > 0');
  });

  it("is declared in the schema with the reason", () => {
    const schema = read("schema.prisma");
    expect(schema).toContain("billedExternally");
    expect(schema).toContain("SUSPENDS the shop");
  });
});
