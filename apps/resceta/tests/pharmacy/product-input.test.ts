import { describe, it, expect } from "vitest";
import { ProductInput, Price, ReorderPoint } from "@/lib/pharmacy/product-input";

/**
 * THE TWO FIELDS THAT COULD NEVER BE SET.
 *
 * A product could only be created inline while receiving a delivery, which set
 * `name` and `priceCentavos` and nothing else, and nothing anywhere could
 * update one afterwards. So:
 *
 *   `requiresPrescription` was read in six places — the sale gate, the
 *   counter's warning, the dashboard badge, the role rules — and written in
 *   ZERO. The statutory rule that only a pharmacist may dispense an Rx medicine
 *   was enforced flawlessly against a flag that was false for every product in
 *   every pharmacy, permanently.
 *
 *   `reorderPoint` defaulted to 0, and the dashboard computes
 *   `onHand <= reorderPoint` — so "about to run out" fired only once an item
 *   had run out.
 *
 * This is the shape the form now goes through. It is tested here rather than
 * trusted because the two failure modes above both looked like working code.
 */

const base = {
  name: "Amoxicillin",
  genericName: "",
  form: "",
  strength: "",
  sku: "",
  barcode: "",
  unit: "piece",
  categoryId: "",
  requiresPrescription: undefined,
  reorderPoint: "10",
  priceCentavos: "12.50",
};

describe("the price", () => {
  it("is taken in pesos and stored in centavos", () => {
    expect(Price.parse("12.50")).toBe(1250);
  });

  it("rounds rather than truncating", () => {
    // 19.99 * 100 is 1998.9999… in floating point. Truncation would price this
    // at ₱19.98 for the rest of its life.
    expect(Price.parse("19.99")).toBe(1999);
    expect(Price.parse("0.07")).toBe(7);
  });

  it("refuses a blank rather than reading it as free", () => {
    // z.coerce.number() parses "" as 0, and an HTML form submits an empty text
    // box as "". A plain coercion turns "I left it alone" into "this is free".
    const r = Price.safeParse("");
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toContain("Enter a price");
  });

  it("still allows a deliberate zero", () => {
    expect(Price.parse("0")).toBe(0);
  });
});

describe("the reorder point", () => {
  it("refuses a blank, for the same reason", () => {
    const r = ReorderPoint.safeParse("");
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toContain("reorder point");
  });

  it("allows a deliberate zero, which means 'warn me when I run out'", () => {
    expect(ReorderPoint.parse("0")).toBe(0);
  });

  it("takes whole units only", () => {
    // You cannot be 2.5 boxes low.
    expect(ReorderPoint.safeParse("2.5").success).toBe(false);
  });
});

describe("the prescription flag", () => {
  it("is false when the checkbox is absent, which is how a form submits it", () => {
    // Unticked checkboxes are not in the FormData at all — they are not
    // "false", they are nothing.
    expect(ProductInput.parse(base).requiresPrescription).toBe(false);
    expect(
      ProductInput.parse({ ...base, requiresPrescription: null }).requiresPrescription,
    ).toBe(false);
  });

  it("is true when it is ticked", () => {
    expect(
      ProductInput.parse({ ...base, requiresPrescription: "on" }).requiresPrescription,
    ).toBe(true);
  });
});

describe("the rest of the record", () => {
  it("treats an empty box as not-set rather than as an empty string", () => {
    const out = ProductInput.parse(base);
    expect(out.genericName).toBeNull();
    expect(out.barcode).toBeNull();
    expect(out.categoryId).toBeNull();
  });

  it("trims what it keeps", () => {
    expect(ProductInput.parse({ ...base, sku: "  AMX-500  " }).sku).toBe("AMX-500");
  });

  it("defaults the unit rather than storing a blank one", () => {
    expect(ProductInput.parse({ ...base, unit: "piece" }).unit).toBe("piece");
  });

  it("insists on a name", () => {
    const r = ProductInput.safeParse({ ...base, name: "   " });
    expect(r.success).toBe(false);
  });
});
