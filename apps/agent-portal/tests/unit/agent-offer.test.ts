import { describe, it, expect } from "vitest";
import { AGENT_OFFER, CALCULATOR, FIRST_SIX_MONTHS_PER_CLIENT, monthlyEarnings } from "@/lib/agentOffer";
import { pesoWhole } from "@/lib/money";

describe("the landing page's income calculator", () => {
  // The three figures the owner signed off on, for 5 new clients a month.
  it("matches the agreed worked example", () => {
    expect(pesoWhole(monthlyEarnings(5, 1))).toBe("₱3,500");
    expect(pesoWhole(monthlyEarnings(5, 6))).toBe("₱8,500");
    expect(pesoWhole(monthlyEarnings(5, 12))).toBe("₱11,500");
  });

  it("pays the activation commission every month, because every month brings new clients", () => {
    expect(monthlyEarnings(1, 1)).toBe(AGENT_OFFER.activationCommission + AGENT_OFFER.tier1Amount);
  });

  it("drops to the lower monthly rate only for clients past the first six months", () => {
    // Month 7 with one new client a month: one client has aged out of tier 1.
    expect(monthlyEarnings(1, 7)).toBe(
      AGENT_OFFER.activationCommission + AGENT_OFFER.tier1Amount * 6 + AGENT_OFFER.tier2Amount,
    );
  });

  it("never goes backwards as the months pass", () => {
    for (let m = 2; m <= 36; m++) {
      expect(monthlyEarnings(3, m)).toBeGreaterThanOrEqual(monthlyEarnings(3, m - 1));
    }
  });

  it("scales with the number of clients", () => {
    expect(monthlyEarnings(4, 9)).toBe(monthlyEarnings(1, 9) * 4);
  });

  it("quotes the same first-six-months figure as the copy", () => {
    expect(pesoWhole(FIRST_SIX_MONTHS_PER_CLIENT)).toBe("₱1,700");
  });

  it("has a slider default inside its own range", () => {
    expect(CALCULATOR.defaultClients).toBeGreaterThanOrEqual(CALCULATOR.minClients);
    expect(CALCULATOR.defaultClients).toBeLessThanOrEqual(CALCULATOR.maxClients);
  });
});

describe("the offer figures shown to visitors", () => {
  it("is in centavos, like the rest of the portal", () => {
    expect(pesoWhole(AGENT_OFFER.activationCommission)).toBe("₱500");
    expect(pesoWhole(AGENT_OFFER.tier1Amount)).toBe("₱200");
    expect(pesoWhole(AGENT_OFFER.tier2Amount)).toBe("₱100");
    expect(pesoWhole(AGENT_OFFER.customerActivationFee)).toBe("₱500");
    expect(pesoWhole(AGENT_OFFER.customerMonthlyFee)).toBe("₱800");
    expect(pesoWhole(AGENT_OFFER.payoutMinimum)).toBe("₱500");
  });

  it("quotes the payout day and minimum the portal actually defaults to", async () => {
    const { SETTING_DEFAULTS } = await import("@/lib/settings");
    expect(AGENT_OFFER.payoutDayOfMonth).toBe(SETTING_DEFAULTS.payout_day_of_month);
    expect(AGENT_OFFER.payoutMinimum).toBe(SETTING_DEFAULTS.payout_minimum_amount);
  });
});
