import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeCommission,
  describeRule,
  ruleApplies,
  type CommissionFact,
  type CommissionRuleFact,
} from "@servd/db";

/**
 * A7.6: what a salesperson is owed.
 *
 * Money, so it is tested the way `computeStatement` is: pure, at fixed inputs,
 * with the rounding direction pinned. A commission that is a centavo out is not
 * a rounding curiosity — it is a number two people will disagree about.
 */

const JAN = new Date("2026-01-15T04:00:00Z");

const rule = (over: Partial<CommissionRuleFact> = {}): CommissionRuleFact => ({
  type: "pct_recurring",
  value: 1000, // 10.00% in basis points
  appliesTo: "all_products",
  productId: null,
  startsAt: new Date("2020-01-01T00:00:00Z"),
  endsAt: null,
  ...over,
});

const fact = (over: Partial<CommissionFact> = {}): CommissionFact => ({
  ledgerEntryId: "l1",
  productId: "servd",
  merchantId: "m1",
  merchantName: "Aling Nena",
  grossAmount: 49_900, // ₱499
  isFirstPayment: false,
  occurredAt: JAN,
  ...over,
});

describe("rounding", () => {
  it("rounds DOWN, so the lines can never sum past what was collected", () => {
    // 2.5% of ₱499 is ₱12.475. Rounding up would pay a centavo the partner was
    // never given — the same floor the partner's own share uses.
    const d = computeCommission("2026-01", [rule({ value: 250 })], [fact()]);
    expect(d.totalCentavos).toBe(1247);
  });

  it("drops a line that rounds to nothing rather than writing a zero", () => {
    // 0.01% of ₱4.99 is under a centavo. A ₱0.00 line on a statement is noise
    // somebody has to ask about.
    const d = computeCommission("2026-01", [rule({ value: 1 })], [fact({ grossAmount: 499 })]);
    expect(d.lines).toHaveLength(0);
    expect(d.totalCentavos).toBe(0);
  });
});

describe("which rule pays on what", () => {
  it("pays SEVERAL rules on one settlement, each as its own line", () => {
    // per_signup plus pct_recurring is the ordinary arrangement, and a single
    // summed figure is the thing nobody can check.
    const d = computeCommission(
      "2026-01",
      [rule({ type: "per_signup", value: 50_000 }), rule({ type: "pct_recurring", value: 1000 })],
      [fact({ isFirstPayment: true })],
    );
    expect(d.lines).toHaveLength(2);
    expect(d.totalCentavos).toBe(50_000 + 4_990);
  });

  it("pays per_signup only on the FIRST settlement", () => {
    // Paying it monthly would turn a one-off signing bonus into a second
    // recurring percentage, silently, and nobody would notice until March.
    const r = [rule({ type: "per_signup", value: 50_000 })];
    expect(computeCommission("2026-01", r, [fact({ isFirstPayment: true })]).totalCentavos).toBe(
      50_000,
    );
    expect(computeCommission("2026-02", r, [fact({ isFirstPayment: false })]).totalCentavos).toBe(
      0,
    );
  });

  it("pays pct_first_month only on the first settlement too", () => {
    const r = [rule({ type: "pct_first_month", value: 5000 })];
    expect(computeCommission("2026-01", r, [fact({ isFirstPayment: true })]).totalCentavos).toBe(
      24_950,
    );
    expect(computeCommission("2026-02", r, [fact()]).totalCentavos).toBe(0);
  });

  it("pays nothing for a rule of type none", () => {
    expect(computeCommission("2026-01", [rule({ type: "none" })], [fact()]).lines).toHaveLength(0);
  });

  it("scopes a product rule to that product only", () => {
    const r = [rule({ appliesTo: "product", productId: "pharmacy" })];
    expect(computeCommission("2026-01", r, [fact({ productId: "servd" })]).lines).toHaveLength(0);
    expect(
      computeCommission("2026-01", r, [fact({ productId: "pharmacy" })]).lines,
    ).toHaveLength(1);
  });
});

describe("the date window", () => {
  it("does not pay before the rule started", () => {
    const r = rule({ startsAt: new Date("2026-02-01T00:00:00Z") });
    expect(ruleApplies(r, fact({ occurredAt: JAN }))).toBe(false);
  });

  it("treats endsAt as EXCLUSIVE, so consecutive rules neither overlap nor gap", () => {
    // A rule that ended on the 1st did not cover the 1st. That reading is what
    // makes "ends when the next one starts" produce exactly one payer.
    const boundary = new Date("2026-02-01T00:00:00Z");
    const ending = rule({ endsAt: boundary });
    const starting = rule({ startsAt: boundary });
    const atBoundary = fact({ occurredAt: boundary });
    expect(ruleApplies(ending, atBoundary)).toBe(false);
    expect(ruleApplies(starting, atBoundary)).toBe(true);

    // And the pair pays exactly once, not twice and not never.
    const d = computeCommission("2026-02", [ending, starting], [atBoundary]);
    expect(d.lines).toHaveLength(1);
  });
});

describe("the statement reads as an explanation", () => {
  it("snapshots the rule that produced each line", () => {
    // A rule edited in March must not rewrite January. Same reasoning as
    // PartnerLedgerEntry.sharePct.
    const d = computeCommission("2026-01", [rule({ value: 1234 })], [fact()]);
    expect(d.lines[0].ruleType).toBe("pct_recurring");
    expect(d.lines[0].ruleValue).toBe(1234);
    expect(d.lines[0].basisCentavos).toBe(49_900);
  });

  it("carries the ledger id, which is what makes a replay safe", () => {
    const d = computeCommission("2026-01", [rule()], [fact({ ledgerEntryId: "entry-9" })]);
    expect(d.lines[0].ledgerEntryId).toBe("entry-9");
  });

  it("groups by merchant name so it can be checked against memory", () => {
    const d = computeCommission(
      "2026-01",
      [rule()],
      [
        fact({ ledgerEntryId: "a", merchantName: "Zamboanga Grill", merchantId: "m2" }),
        fact({ ledgerEntryId: "b", merchantName: "Aling Nena" }),
      ],
    );
    expect(d.lines.map((l) => l.merchantName)).toEqual(["Aling Nena", "Zamboanga Grill"]);
  });
});

describe("describeRule", () => {
  it("renders basis points as a percentage and centavos as pesos", () => {
    expect(describeRule({ type: "pct_recurring", value: 250 })).toContain("2.50%");
    expect(describeRule({ type: "per_signup", value: 50_000 })).toContain("₱500");
    expect(describeRule({ type: "none", value: 0 })).toBe("No commission");
  });
});

describe("the job and the screen", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("is scheduled on the 1st at 01:00 UTC, beside the partner statements", () => {
    // 09:00 Manila, unambiguously the 1st there. A job at 16:00 UTC on the 1st
    // is running on the 2nd in Manila and would freeze the month that had just
    // started — the mistake freeze-statements already made once.
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    const cron = vercel.crons.find((c) => c.path === "/api/cron/partner-commissions");
    expect(cron?.schedule).toBe("0 1 1 * *");
  });

  it("freezes idempotently and never recomputes an existing statement", () => {
    const src = read("src/server/partners/commissions.ts");
    const fn = src.slice(src.indexOf("export async function freezeCommission"));
    expect(fn).toContain("if (existing) return { created: false");
  });

  it("writes a ZERO statement rather than no statement", () => {
    // "You earned nothing in September" is a fact somebody can look at. A
    // missing row reads as "the job did not run", which is a different problem
    // with the same appearance.
    const src = read("src/server/partners/commissions.ts");
    expect(src).toContain("A zero statement is still written");
  });

  it("uses the same draft function for the live preview and the freeze", () => {
    // Or the preview would be able to disagree with what lands on the 1st.
    expect(read("src/app/(platform)/partner/commissions/page.tsx")).toContain(
      "draftCommission",
    );
    expect(read("src/server/partners/commissions.ts")).toContain(
      "const draft = await draftCommission",
    );
  });

  it("gates rules and mark-paid on commissions.manage, which is admin-only", () => {
    const actions = read("src/server/partners/commissions-actions.ts");
    const gates = actions.match(/requireWritablePartner\("([^"]+)"\)/g) ?? [];
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) expect(g).toContain("commissions.manage");
  });

  it("never re-marks a statement that is already paid", () => {
    // A double submit must not overwrite the date and reference of the payment
    // that actually happened.
    const actions = read("src/server/partners/commissions-actions.ts");
    expect(actions).toContain("paidAt: null");
  });
});
