import { describe, it, expect } from "vitest";
import { placeOrderSchema } from "@/lib/validation/order";

const uuid = "11111111-1111-1111-1111-111111111111";

describe("placeOrderSchema", () => {
  it("accepts a well-formed order", () => {
    const r = placeOrderSchema.safeParse({
      slug: "mango-grill",
      tableToken: "abc",
      lines: [{ itemId: uuid, quantity: 2, modifierIds: [uuid] }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty cart", () => {
    const r = placeOrderSchema.safeParse({
      slug: "x",
      tableToken: "y",
      lines: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-uuid item ids (tampering)", () => {
    const r = placeOrderSchema.safeParse({
      slug: "x",
      tableToken: "y",
      lines: [{ itemId: "not-a-uuid", quantity: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects quantity below 1", () => {
    const r = placeOrderSchema.safeParse({
      slug: "x",
      tableToken: "y",
      lines: [{ itemId: uuid, quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });
});
