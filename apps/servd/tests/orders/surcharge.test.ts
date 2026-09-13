import { describe, it, expect } from "vitest";
import { isSurchargeable, surchargeFor, surchargeLabel } from "@/lib/orders/surcharge";
import {
  DEFAULT_CARD_SURCHARGE_BP,
  MAX_SURCHARGE_BP,
  bpToPercentString,
  normalizeSurchargeBp,
  parsePrinterConfig,
  percentToBp,
} from "@/lib/printing/printer-config";
import { netTotal } from "@/lib/discount";

describe("surchargeFor", () => {
  it("charges the rate that was asked for", () => {
    // ₱1,000 on a card at 3.5% → ₱35.
    expect(surchargeFor("card_terminal", 100_000, DEFAULT_CARD_SURCHARGE_BP)).toBe(3_500);
  });

  it("leaves every other method alone", () => {
    for (const m of ["cash", "gcash", "maya", "bank_transfer"]) {
      expect(surchargeFor(m, 100_000, DEFAULT_CARD_SURCHARGE_BP)).toBe(0);
    }
  });

  it("is nothing when no rate is set", () => {
    expect(surchargeFor("card_terminal", 100_000, 0)).toBe(0);
  });

  it("rounds to the centavo", () => {
    // 3.5% of ₱9.99 is 34.965 centavos.
    expect(surchargeFor("card_terminal", 999, 350)).toBe(35);
  });

  it("never charges on nothing", () => {
    expect(surchargeFor("card_terminal", 0, 350)).toBe(0);
    expect(surchargeFor("card_terminal", -500, 350)).toBe(0);
  });

  it("ignores a rate that isn't a number", () => {
    expect(surchargeFor("card_terminal", 100_000, NaN)).toBe(0);
  });

  it("knows which methods cost", () => {
    expect(isSurchargeable("card_terminal")).toBe(true);
    expect(isSurchargeable("cash")).toBe(false);
    expect(isSurchargeable(null)).toBe(false);
  });

  // The rate has to be on the receipt or the line can't be questioned.
  it("names the rate on the receipt line", () => {
    expect(surchargeLabel(350)).toBe("Card fee (3.5%)");
    expect(surchargeLabel(200)).toBe("Card fee (2%)");
  });
});

describe("the split-bill rule", () => {
  // Charging the fee on the tender rather than on the order is the whole
  // reason a half-cash bill isn't charged 3.5% of the total.
  it("charges only the part that goes on the card", () => {
    const bill = 100_000;
    const cash = 50_000;
    const card = bill - cash;
    expect(surchargeFor("cash", cash, 350) + surchargeFor("card_terminal", card, 350)).toBe(1_750);
  });
});

describe("percent ↔ basis points", () => {
  it("round-trips what an owner types", () => {
    expect(bpToPercentString(percentToBp("3.5"))).toBe("3.5");
    expect(bpToPercentString(percentToBp("2"))).toBe("2");
  });

  it("reads blank as no surcharge", () => {
    expect(percentToBp("")).toBe(0);
    expect(percentToBp(null)).toBe(0);
    expect(bpToPercentString(0)).toBe("");
  });

  // A fat-fingered 350 in the percent box would otherwise mean 350%.
  it("clamps a typo instead of charging it", () => {
    expect(percentToBp("350")).toBe(MAX_SURCHARGE_BP);
    expect(normalizeSurchargeBp(999_999)).toBe(MAX_SURCHARGE_BP);
  });

  it("refuses a negative rate", () => {
    expect(percentToBp("-3")).toBe(0);
    expect(normalizeSurchargeBp(-1)).toBe(0);
  });
});

describe("netTotal with a surcharge", () => {
  it("adds the fee on top", () => {
    expect(netTotal(100_000, 0, 0, 3_500)).toBe(103_500);
  });

  it("still takes the discount off first", () => {
    expect(netTotal(100_000, 20_000, 0, 2_800)).toBe(82_800);
  });

  it("behaves exactly as before when there's no surcharge", () => {
    expect(netTotal(100_000, 20_000, 10_000)).toBe(70_000);
  });

  it("never goes negative", () => {
    expect(netTotal(1_000, 5_000, 0, 0)).toBe(0);
  });
});

describe("printerConfig defaults", () => {
  // A restaurant that has never opened the settings page must see no change.
  it("is the old behaviour when the blob is empty", () => {
    const c = parsePrinterConfig(null);
    expect(c.receipt.showVat).toBe(true);
    expect(c.receipt.showCustomer).toBe(true);
    expect(c.receipt.showCashTendered).toBe(true);
    expect(c.kitchen.showAddress).toBe(false); // opt-in: it's a home address
    expect(c.payments.cardSurchargeBp).toBe(0); // opt-in: it's money
  });

  it("keeps the existing receipt branding", () => {
    const c = parsePrinterConfig({
      receipt: { address: " 123 Main St ", phone: "0917", showVat: false },
    });
    expect(c.receipt.address).toBe("123 Main St");
    expect(c.receipt.phone).toBe("0917");
    expect(c.receipt.showVat).toBe(false);
  });

  it("reads back what was saved", () => {
    const c = parsePrinterConfig({
      receipt: { showCustomer: false, showCashTendered: false },
      kitchen: { showAddress: true },
      payments: { cardSurchargeBp: 350 },
    });
    expect(c.receipt.showCustomer).toBe(false);
    expect(c.receipt.showCashTendered).toBe(false);
    expect(c.kitchen.showAddress).toBe(true);
    expect(c.payments.cardSurchargeBp).toBe(350);
  });

  it("treats a blank branding string as absent, not as an empty line", () => {
    expect(parsePrinterConfig({ receipt: { address: "   " } }).receipt.address).toBeNull();
  });
});
