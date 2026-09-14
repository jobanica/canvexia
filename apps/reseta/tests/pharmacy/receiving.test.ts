import { describe, it, expect } from "vitest";
import {
  checkDelivery,
  hasErrors,
  issuesFor,
  SHORT_DATED_DAYS,
  type DeliveryLine,
} from "@/lib/pharmacy/receiving";

const TODAY = new Date("2026-09-14T09:00:00+08:00");

function line(over: Partial<DeliveryLine> = {}): DeliveryLine {
  return {
    productId: "11111111-1111-4111-8111-111111111111",
    lotNumber: "LOT-1",
    expiryDate: "2027-12-31",
    quantity: 10,
    unitCostCentavos: 5000,
    ...over,
  };
}

describe("checking a delivery", () => {
  it("passes a clean line with nothing to say about it", () => {
    expect(checkDelivery([line()], TODAY)).toEqual([]);
  });

  describe("what it refuses", () => {
    it("refuses stock that has already expired", () => {
      // Not a warning. Expired stock cannot be dispensed, so accepting it only
      // puts a write-off on the shelf and hides a supplier problem.
      const issues = checkDelivery([line({ expiryDate: "2026-09-13" })], TODAY);
      expect(hasErrors(issues)).toBe(true);
      expect(issues[0]).toMatchObject({ severity: "error", field: "expiryDate" });
    });

    it("accepts stock expiring TODAY — a date is good to the end of its day", () => {
      const issues = checkDelivery([line({ expiryDate: "2026-09-14" })], TODAY);
      expect(hasErrors(issues)).toBe(false);
    });

    it("refuses a line with no product and no new name", () => {
      const issues = checkDelivery([line({ productId: null })], TODAY);
      expect(issues).toContainEqual(
        expect.objectContaining({ severity: "error", field: "product" }),
      );
    });

    it("refuses a new product with no selling price", () => {
      // A product that sells for nothing is one someone forgot to price, and
      // the till would hand it out free.
      const issues = checkDelivery(
        [line({ productId: null, newProductName: "Biogesic 500mg" })],
        TODAY,
      );
      expect(issues).toContainEqual(
        expect.objectContaining({ severity: "error", field: "product" }),
      );
    });

    it("accepts a new product that IS priced", () => {
      const issues = checkDelivery(
        [
          line({
            productId: null,
            newProductName: "Biogesic 500mg",
            newProductPriceCentavos: 11200,
          }),
        ],
        TODAY,
      );
      expect(hasErrors(issues)).toBe(false);
    });

    it("refuses zero, negative and fractional quantities", () => {
      for (const quantity of [0, -5, 2.5]) {
        expect(hasErrors(checkDelivery([line({ quantity })], TODAY))).toBe(true);
      }
    });

    it("refuses a negative cost", () => {
      const issues = checkDelivery([line({ unitCostCentavos: -1 })], TODAY);
      expect(issues).toContainEqual(
        expect.objectContaining({ severity: "error", field: "unitCostCentavos" }),
      );
    });

    it("refuses something that is not a date", () => {
      expect(hasErrors(checkDelivery([line({ expiryDate: "next tuesday" })], TODAY))).toBe(true);
    });
  });

  describe("what it flags but lets through", () => {
    it("warns on short-dated stock without blocking it", () => {
      // Buying short-dated stock cheap is a normal trade. Refusing it would
      // get the screen worked around, and the workaround is worse.
      const issues = checkDelivery([line({ expiryDate: "2026-10-15" })], TODAY);
      expect(hasErrors(issues)).toBe(false);
      expect(issues[0]).toMatchObject({ severity: "warning", field: "expiryDate" });
      expect(issues[0].message).toContain(String(SHORT_DATED_DAYS));
    });

    it("warns on a missing lot number — a recall names a lot", () => {
      const issues = checkDelivery([line({ lotNumber: null })], TODAY);
      expect(hasErrors(issues)).toBe(false);
      expect(issues).toContainEqual(
        expect.objectContaining({ severity: "warning", field: "lotNumber" }),
      );
    });

    it("warns on a deliberate no-expiry batch, saying what it costs", () => {
      const issues = checkDelivery([line({ expiryDate: null })], TODAY);
      expect(hasErrors(issues)).toBe(false);
      expect(issues[0].message).toMatch(/dispensed last/i);
    });

    it("warns on zero cost — samples are real, typos are too", () => {
      const issues = checkDelivery([line({ unitCostCentavos: 0 })], TODAY);
      expect(hasErrors(issues)).toBe(false);
      expect(issues).toContainEqual(
        expect.objectContaining({ severity: "warning", field: "unitCostCentavos" }),
      );
    });
  });

  it("reports issues against the right line", () => {
    const issues = checkDelivery(
      [line(), line({ expiryDate: "2020-01-01" }), line({ lotNumber: null })],
      TODAY,
    );
    expect(issuesFor(issues, 0)).toEqual([]);
    expect(issuesFor(issues, 1)).toHaveLength(1);
    expect(issuesFor(issues, 1)[0].severity).toBe("error");
    expect(issuesFor(issues, 2)[0].severity).toBe("warning");
  });

  it("collects several problems on one line rather than stopping at the first", () => {
    const issues = issuesFor(
      checkDelivery([line({ quantity: 0, lotNumber: null, unitCostCentavos: 0 })], TODAY),
      0,
    );
    expect(issues.map((i) => i.field).sort()).toEqual([
      "lotNumber",
      "quantity",
      "unitCostCentavos",
    ]);
  });

  it("judges expiry in Manila, not in the server's timezone", () => {
    // 2026-09-14T01:00Z is already the 14th in Manila (09:00). A batch dated
    // the 14th is good today; treating the server's date as authoritative
    // would expire it eight hours early.
    const earlyMorningManila = new Date("2026-09-13T17:30:00Z"); // 01:30 on the 14th
    expect(
      hasErrors(checkDelivery([line({ expiryDate: "2026-09-14" })], earlyMorningManila)),
    ).toBe(false);
  });
});
