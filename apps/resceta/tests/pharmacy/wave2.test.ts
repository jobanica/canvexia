import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CustomerInput, PointsAdjustment, pointsEarned, redeemable } from "@/lib/pharmacy/customer-input";
import { PoInput, poStatusFor, outstanding } from "@/lib/pharmacy/po-input";

/**
 * WAVE 2 — customers with a points ledger, and purchase orders.
 *
 * Receiving already existed and wrote batches directly, which records what came
 * in and answers nothing about what was supposed to: a pharmacy could not tell
 * a short delivery from a complete one, or chase a distributor for the missing
 * boxes. And the same people come back every month for the same maintenance
 * medicine, with nowhere to record that they exist.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("points arithmetic", () => {
  it("rounds earnings down, never up", () => {
    // Rounding up hands out points nobody paid for, on every transaction.
    expect(pointsEarned(15050, 1)).toBe(150);
    expect(pointsEarned(9999, 1)).toBe(99);
  });

  it("earns nothing when the programme is off", () => {
    expect(pointsEarned(100000, 0)).toBe(0);
  });

  it("earns nothing on a zero or negative amount", () => {
    expect(pointsEarned(0, 5)).toBe(0);
    expect(pointsEarned(-500, 5)).toBe(0);
  });

  it("caps a redemption at the balance", () => {
    // 80 points held, 200 asked for, each worth 50c, bill is ₱500.
    expect(redeemable(200, 80, 50000, 50)).toEqual({ points: 80, centavos: 4000 });
  });

  it("caps a redemption at the bill, so a till never hands out cash", () => {
    // 1000 points at 50c is ₱500 of value against a ₱100 bill.
    expect(redeemable(1000, 1000, 10000, 50)).toEqual({ points: 200, centavos: 10000 });
  });

  it("redeems nothing when points have no redemption value", () => {
    // Points that can be earned and never spent are worse than no points.
    expect(redeemable(100, 100, 50000, 0)).toEqual({ points: 0, centavos: 0 });
  });
});

describe("what a customer and an adjustment may contain", () => {
  it("requires a name and nothing else", () => {
    expect(CustomerInput.safeParse({ name: " " }).success).toBe(false);
    const ok = CustomerInput.parse({ name: "Ana Reyes" });
    expect(ok.phone).toBeNull();
    expect(ok.address).toBeNull();
  });

  it("refuses a zero-point adjustment", () => {
    // A ledger row that says nothing.
    expect(PointsAdjustment.safeParse({ points: "0", note: "why" }).success).toBe(false);
  });

  it("refuses an adjustment with no reason", () => {
    // An unexplained balance change is what this ledger exists to prevent.
    expect(PointsAdjustment.safeParse({ points: "50", note: "  " }).success).toBe(false);
  });

  it("accepts a negative adjustment", () => {
    expect(PointsAdjustment.parse({ points: "-50", note: "Correction" }).points).toBe(-50);
  });
});

describe("the points ledger and its cache", () => {
  const customers = src("server/pharmacy/customers.ts");

  it("writes the ledger row and the balance in one transaction", () => {
    // A crash between the two leaves a customer whose points do not add up —
    // and the ledger is what they are shown when they dispute it.
    const txn = customers.indexOf("tx.pharmacyLoyaltyTxn.create");
    // The balance write specifically — `tx.pharmacyCustomer.update` also
    // prefix-matches the unrelated `updateMany` in updateCustomer, which sits
    // higher in the file and made an earlier version of this pass for the
    // wrong reason.
    const bal = customers.indexOf("data: { pointsBalance: balance }");
    expect(txn).toBeGreaterThan(-1);
    expect(bal).toBeGreaterThan(txn);
    // Both inside the same systemDb callback: one `return await systemDb`.
    expect(customers).toContain("return await systemDb(async (tx) => {");
  });

  it("refuses to overdraw rather than clamping to zero", () => {
    // A clamp writes a ledger row that does not reconcile with the balance it
    // produced.
    expect(customers).toContain("if (balance < 0) {");
  });

  it("can prove the cache agrees with the ledger", () => {
    expect(customers).toContain("export async function recountPoints");
    expect(customers).toContain("_sum: { points: true }");
  });

  it("counts only completed sales toward lifetime spend", () => {
    expect(customers).toContain('where: { status: "completed" }');
  });
});

describe("who may do what with customers", () => {
  const actions = src("app/customers/actions.ts");

  it("lets anyone who can sell add a customer", () => {
    // The person who needs to is the one at the counter with them in front of
    // them. Gating it to the owner means the record never gets created.
    expect(actions).toContain('requireStaff("sell")');
  });

  it("gates points adjustments higher, because points are money", () => {
    expect(actions).toContain('requireStaff("viewReports")');
  });
});

describe("purchase order status", () => {
  it("is draft until sent and nothing has arrived", () => {
    expect(poStatusFor([{ quantityOrdered: 10, quantityReceived: 0 }], false)).toBe("draft");
    expect(poStatusFor([{ quantityOrdered: 10, quantityReceived: 0 }], true)).toBe("sent");
  });

  it("is partial when only some of it came", () => {
    expect(
      poStatusFor(
        [
          { quantityOrdered: 10, quantityReceived: 10 },
          { quantityOrdered: 5, quantityReceived: 2 },
        ],
        true,
      ),
    ).toBe("partial");
  });

  it("is received when every line is complete", () => {
    expect(
      poStatusFor(
        [
          { quantityOrdered: 10, quantityReceived: 10 },
          { quantityOrdered: 5, quantityReceived: 5 },
        ],
        true,
      ),
    ).toBe("received");
  });

  it("treats an over-delivery as complete, not forever partial", () => {
    // A supplier who sends 110 of 100 has not left the order outstanding.
    expect(poStatusFor([{ quantityOrdered: 100, quantityReceived: 110 }], true)).toBe("received");
    expect(outstanding({ quantityOrdered: 100, quantityReceived: 110 })).toBe(0);
  });
});

describe("what a purchase order may contain", () => {
  it("needs at least one line", () => {
    expect(PoInput.safeParse({ lines: [] }).success).toBe(false);
  });

  it("refuses a blank unit cost rather than recording a free delivery", () => {
    // z.coerce.number() turns "" into 0, and a zero-cost batch is a 100%
    // margin on every future sale of it.
    const r = PoInput.safeParse({
      lines: [{ productId: "11111111-1111-1111-1111-111111111111", quantityOrdered: "5", unitCostCentavos: "" }],
    });
    expect(r.success).toBe(false);
  });

  it("turns pesos into centavos", () => {
    const r = PoInput.parse({
      lines: [
        {
          productId: "11111111-1111-1111-1111-111111111111",
          quantityOrdered: "5",
          unitCostCentavos: "12.35",
        },
      ],
    });
    expect(r.lines[0]!.unitCostCentavos).toBe(1235);
  });

  it("refuses a zero or fractional quantity", () => {
    const base = { productId: "11111111-1111-1111-1111-111111111111", unitCostCentavos: "1.00" };
    expect(PoInput.safeParse({ lines: [{ ...base, quantityOrdered: "0" }] }).success).toBe(false);
    expect(PoInput.safeParse({ lines: [{ ...base, quantityOrdered: "1.5" }] }).success).toBe(false);
  });
});

describe("receiving against an order", () => {
  const po = src("server/pharmacy/purchase-orders.ts");

  it("creates real batches and real stock movements", () => {
    // Not a second, parallel stock path: it does what the receiving screen
    // does, and additionally advances the line.
    expect(po).toContain("tx.pharmacyBatch.create");
    expect(po).toContain("tx.pharmacyStockMovement.create");
    expect(po).toContain('type: "receive"');
  });

  it("advances the line and the status in the same transaction as the stock", () => {
    // Splitting them is how stock ends up on the shelf against an order that
    // still says nothing arrived.
    expect(po).toContain("quantityReceived: { increment: line.quantity }");
    expect(po).toContain("const status = poStatusFor(after, po.status !== \"draft\");");
  });

  it("re-reads the lines before deciding the status", () => {
    // The increments above are what the database now holds; adding up in
    // memory would disagree with it under a concurrent receipt.
    expect(po).toContain("const after = await tx.pharmacyPurchaseOrderItem.findMany(");
  });

  it("takes the cost from the delivery, not from the order", () => {
    // A distributor invoicing at a different price than quoted is ordinary,
    // and every margin figure in this app reads the batch's cost.
    expect(po).toContain("costCentavos: line.unitCostCentavos");
  });

  it("refuses a line that is not on this order", () => {
    expect(po).toContain("if (lines.some((l) => !byId.has(l.itemId)))");
  });

  it("refuses to receive against a cancelled order", () => {
    expect(po).toContain('if (po.status === "cancelled")');
  });

  it("refuses to cancel an order that has started arriving", () => {
    // Goods on the shelf against a cancelled order is a stock record nobody
    // can explain.
    expect(po).toContain("if (po.items.some((i) => i.quantityReceived > 0))");
  });

  it("checks every product belongs to this pharmacy", () => {
    expect(po).toContain("where: { id: { in: ids }, pharmacyId }");
  });

  it("allocates the PO number from a counter, not a row count", () => {
    // Counting reissues a number after a cancellation, and two people raising
    // an order at once race to the same one.
    expect(po).toContain("data: { nextPoNo: { increment: 1 } }");
  });
});
