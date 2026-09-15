import { describe, it, expect } from "vitest";
import {
  buildHealthBoard,
  buildHqAttention,
  settlementOf,
  troubleOf,
  DEMAND_THRESHOLD,
  type PartnerFact,
  type HealthRow,
} from "@/lib/hq/health";

const NOW = new Date("2026-09-15T00:00:00Z");

function partner(over: Partial<PartnerFact> = {}): PartnerFact {
  return {
    id: "p-1",
    name: "Cebu",
    email: "cebu@example.test",
    status: "approved",
    tier: "operator",
    territory: "Cebu City",
    isHouse: false,
    revenueSharePct: 70,
    collectionMode: "hq_collects",
    licenseStartedAt: new Date("2026-03-15T00:00:00Z"),
    exclusivityExpiresAt: null,
    milestones: null,
    merchants: 12,
    paying: 12,
    mrrCentavos: 1_200_00,
    latestStatement: null,
    ...over,
  };
}

describe("settlement", () => {
  it("calls it an invoice when the partner collects, a payout when HQ does", () => {
    // Not cosmetic. partner_collects means the money never passes through HQ,
    // so what is owed flows the other way. Labelling both "payout" tells half
    // of all partners they are owed money they actually owe.
    const s = {
      month: "2026-08",
      payoutStatus: "pending",
      frozenAt: new Date("2026-09-01T00:00:00Z"),
      partnerCentavos: 50_000,
    };
    expect(
      settlementOf({ latestStatement: s, collectionMode: "hq_collects" }, 15, NOW).kind,
    ).toBe("pending");
    expect(
      (settlementOf({ latestStatement: s, collectionMode: "hq_collects" }, 15, NOW) as any).direction,
    ).toBe("payout");
    expect(
      (settlementOf({ latestStatement: s, collectionMode: "partner_collects" }, 15, NOW) as any)
        .direction,
    ).toBe("invoice");
  });

  it("computes overdue from the date rather than trusting the column", () => {
    // The column can say "overdue", but nothing sets it. A status that only
    // becomes true when a cron remembers to run is a status that lies every
    // time the cron does not — and the freeze cron on this project has never
    // once succeeded.
    const frozen = new Date("2026-08-20T00:00:00Z"); // 26 days before NOW
    const s = {
      month: "2026-07",
      payoutStatus: "pending",
      frozenAt: frozen,
      partnerCentavos: 50_000,
    };
    const out = settlementOf({ latestStatement: s, collectionMode: "hq_collects" }, 15, NOW);
    expect(out.kind).toBe("overdue");
    expect((out as any).days).toBe(26);
  });

  it("honours a stored overdue even inside the window", () => {
    const s = {
      month: "2026-09",
      payoutStatus: "overdue",
      frozenAt: new Date("2026-09-14T00:00:00Z"),
      partnerCentavos: 10,
    };
    expect(settlementOf({ latestStatement: s, collectionMode: "hq_collects" }, 15, NOW).kind).toBe(
      "overdue",
    );
  });

  it("does not call a paid statement overdue however old it is", () => {
    const s = {
      month: "2026-01",
      payoutStatus: "paid",
      frozenAt: new Date("2026-02-01T00:00:00Z"),
      partnerCentavos: 10,
    };
    expect(settlementOf({ latestStatement: s, collectionMode: "hq_collects" }, 15, NOW).kind).toBe(
      "paid",
    );
  });

  it("says nothing rather than something when there is no statement", () => {
    expect(settlementOf({ latestStatement: null, collectionMode: "hq_collects" }, 15, NOW)).toEqual({
      kind: "none",
    });
  });
});

describe("the health board", () => {
  it("floors HQ's share so it never shows a peso the partner also sees", () => {
    // 70/30 on ₱333.33 is 23333.1 for the partner. Floored to 23333, so HQ gets
    // the 10000 that is left — NOT the 10001 that rounding the other way would
    // produce, which is a centavo shown to both sides at once.
    const [row] = buildHealthBoard([partner({ mrrCentavos: 33_333, revenueSharePct: 70 })], {
      overdueDays: 15,
      asOf: NOW,
    });
    expect(row.hqShareCentavos).toBe(33_333 - Math.floor((33_333 * 70) / 100));
    expect(row.hqShareCentavos).toBe(10_000);
  });

  it("computes milestone status through packages/core, not a second copy", () => {
    // The brief asks for "computed the same way as the partner portal". The
    // only way to guarantee that is to call the same function — this asserts
    // the ladder is applied at all, and milestones.test.ts owns the arithmetic.
    const [row] = buildHealthBoard(
      [partner({ paying: 0, licenseStartedAt: new Date("2026-01-01T00:00:00Z") })],
      { overdueDays: 15, asOf: NOW },
    );
    expect(row.milestone).not.toBeNull();
    expect(row.milestone!.status).toBe("missed");
  });

  it("sorts problems first, then by size", () => {
    const board = buildHealthBoard(
      [
        partner({ id: "healthy-small", name: "Small", mrrCentavos: 10_000 }),
        partner({ id: "healthy-big", name: "Big", mrrCentavos: 900_000 }),
        partner({ id: "suspended", name: "Suspended", status: "suspended" }),
        partner({
          id: "overdue",
          name: "Overdue",
          latestStatement: {
            month: "2026-07",
            payoutStatus: "pending",
            frozenAt: new Date("2026-08-01T00:00:00Z"),
            partnerCentavos: 5,
          },
        }),
      ],
      { overdueDays: 15, asOf: NOW },
    );
    expect(board.map((r) => r.id)).toEqual([
      "suspended",
      "overdue",
      "healthy-big",
      "healthy-small",
    ]);
  });

  it("treats a licensed partner with no merchants as worse than a working one", () => {
    // A licence sold and nothing happening is not "fine". It sits below the
    // active problems and above the rest.
    const base = {
      id: "x",
      name: "x",
      territory: null,
      tier: "operator",
      isHouse: false,
      status: "approved",
      paying: 0,
      mrrCentavos: 0,
      hqShareCentavos: 0,
      milestone: null,
      daysToExclusivity: null,
      settlement: { kind: "none" } as const,
    };
    expect(troubleOf({ ...base, merchants: 0 })).toBeLessThan(
      troubleOf({ ...base, merchants: 3 }),
    );
  });

  it("flags exclusivity inside 30 days, and reports a lapsed one as negative", () => {
    const soon = buildHealthBoard(
      [partner({ exclusivityExpiresAt: new Date("2026-10-01T00:00:00Z") })],
      { overdueDays: 15, asOf: NOW },
    )[0];
    expect(soon.daysToExclusivity).toBe(16);

    const gone = buildHealthBoard(
      [partner({ exclusivityExpiresAt: new Date("2026-09-01T00:00:00Z") })],
      { overdueDays: 15, asOf: NOW },
    )[0];
    expect(gone.daysToExclusivity).toBeLessThan(0);
  });
});

describe("the attention list", () => {
  const board = (over: Partial<PartnerFact>) =>
    buildHealthBoard([partner(over)], { overdueDays: 15, asOf: NOW });

  it("raises an overdue settlement with the right direction in the words", () => {
    const rows = buildHqAttention(
      board({
        collectionMode: "partner_collects",
        latestStatement: {
          month: "2026-07",
          payoutStatus: "pending",
          frozenAt: new Date("2026-08-01T00:00:00Z"),
          partnerCentavos: 5,
        },
      }),
      [],
    );
    expect(rows[0].kind).toBe("overdue");
    expect(rows[0].detail).toContain("Invoice");
    expect(rows[0].detail).not.toContain("Payout");
  });

  it("raises a missed milestone but not an on-track one", () => {
    const missed = buildHqAttention(
      board({ paying: 0, licenseStartedAt: new Date("2026-01-01T00:00:00Z") }),
      [],
    );
    expect(missed.some((r) => r.kind === "milestone")).toBe(true);

    const fine = buildHqAttention(board({ paying: 60 }), []);
    expect(fine.some((r) => r.kind === "milestone")).toBe(false);
  });

  it("raises a city only at the threshold, and never one already taken", () => {
    const rows = buildHqAttention([] as HealthRow[], [
      { city: "Iloilo", applicants: DEMAND_THRESHOLD, taken: false },
      { city: "Bacolod", applicants: DEMAND_THRESHOLD - 1, taken: false },
      { city: "Cebu City", applicants: 50, taken: true },
    ]);
    expect(rows.map((r) => r.title)).toEqual(["Iloilo"]);
  });

  it("puts money before milestones before demand", () => {
    const rows = buildHqAttention(
      board({
        paying: 0,
        licenseStartedAt: new Date("2026-01-01T00:00:00Z"),
        latestStatement: {
          month: "2026-07",
          payoutStatus: "pending",
          frozenAt: new Date("2026-08-01T00:00:00Z"),
          partnerCentavos: 5,
        },
      }),
      [{ city: "Iloilo", applicants: 9, taken: false }],
    );
    expect(rows.map((r) => r.kind)).toEqual(["overdue", "milestone", "demand"]);
  });

  it("has no rule for domains or escalations, because there is no data", () => {
    // Asserted rather than left implicit. `listPartnerDomains` returns one
    // *planned* entry and no partner domain has ever been registered — no
    // domain in this project resolves at all. There is no ticket system either.
    // An always-empty section looks like everything is handled.
    const kinds = new Set(
      buildHqAttention(
        board({
          // Enough merchants that the ladder is met — otherwise this partner
          // raises a milestone row and the assertion is about the wrong thing.
          paying: 60,
          latestStatement: {
            month: "2026-07",
            payoutStatus: "pending",
            frozenAt: new Date("2026-08-01T00:00:00Z"),
            partnerCentavos: 5,
          },
        }),
        [{ city: "Iloilo", applicants: 9, taken: false }],
      ).map((r) => r.kind),
    );
    expect([...kinds].sort()).toEqual(["demand", "overdue"]);
  });
});
