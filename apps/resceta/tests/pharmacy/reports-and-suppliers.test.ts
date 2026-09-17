import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SupplierInput } from "@/lib/pharmacy/supplier-input";

/**
 * WAVE 1 OF CLOSING THE GAP WITH RESETA.
 *
 * REPORTED — "i compare both, reseta and resceta. its very far."
 *
 * Three things this app held every fact for and could not show:
 *
 *   1. REVENUE AND MARGIN. Every sale line snapshots its cost, so profit was
 *      computable to the centavo from day one. The dashboard printed three
 *      tables and no total: "did we make money this month" was unanswerable
 *      from the app that held every sale.
 *   2. ALERTS. Expiry and low stock were a section of the dashboard that
 *      scrolled off, with no out-of-stock list at all.
 *   3. SUPPLIERS. `pharmacy_suppliers` has carried a phone, an email, a
 *      contact person and notes since the table was written — written in zero
 *      places, read in zero. A supplier could only be created as a name typed
 *      into the receiving form and never edited.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("the money figures", () => {
  const reports = src("server/pharmacy/reports.ts");

  it("takes cost from the sale line, never the batch", () => {
    // The line snapshots what that batch cost at the time. Reading the batch's
    // current cost would make every past month move whenever stock is
    // received — a report that rewrites its own history.
    expect(reports).toContain("r.lineTotalCentavos - r.unitCostCentavos * r.quantity");
    expect(reports).not.toMatch(/batch\.costCentavos/);
  });

  it("excludes voided sales from revenue and from margin", () => {
    // Both queries, not just the receipts one: a line belonging to a voided
    // receipt is excluded by the same rule that excludes the receipt.
    const completed = reports.match(/status: "completed"/g) ?? [];
    expect(completed.length).toBe(2);
    expect(reports).toContain('sale: { status: "completed"');
  });

  it("ranges on half-open bounds", () => {
    // `lt`, not `lte`: a closed upper bound either misses the last millisecond
    // of the day or books a midnight sale into both days.
    expect(reports).toContain("createdAt: { gte: range.start, lt: range.end }");
    expect(reports).not.toContain("lte: range.end");
  });

  it("never divides by zero on an empty pharmacy", () => {
    // 0/0 is NaN, and NaN renders as the string "NaN%" on the first screen a
    // new pharmacy ever sees.
    expect(reports).toContain("revenueCentavos > 0 ? (profitCentavos / revenueCentavos) * 100 : 0");
  });

  it("breaks expired stock out of the valuation instead of hiding it", () => {
    // Money that was spent and is sitting there. Dropping it makes the
    // valuation agree with the shelf and disagree with the bank.
    expect(reports).toContain("expiredValueCentavos");
    expect(reports).toContain("expiredUnits");
  });

  it("reads through the tenant-scoped client", () => {
    expect(reports).toContain("pharmacyDb(pharmacyId");
    expect(reports).not.toContain("systemDb");
  });
});

describe("the dashboard", () => {
  const page = src("app/page.tsx");

  it("shows the totals a cashier must not see only to those who may", () => {
    // `viewReports` gates the whole top half. The person at the till on a
    // Saturday has no business knowing the shop's margin.
    expect(page).toContain('const showMoney = can(staff.role, "viewReports");');
    expect(page).toContain("showMoney ? salesReport(staff.pharmacyId, range) : null");
    expect(page).toContain("showMoney ? inventoryValuation(staff.pharmacyId) : null");
  });

  it("does not run the money queries for a cashier at all", () => {
    // Gating the render but running the query is a permission check that still
    // reads the rows — and pays for them on a provincial connection.
    expect(page).not.toMatch(/await salesReport\(/);
  });

  it("links the two stock questions rather than reprinting them", () => {
    expect(page).toContain('href="/alerts"');
  });
});

describe("alerts", () => {
  const page = src("app/alerts/page.tsx");

  it("separates expired from expiring", () => {
    // A batch past its date is not a warning, it is stock that must come off
    // the shelf. Sorted in with "expiring soon" it scrolls past.
    expect(page).toContain("expiring.filter((b) => b.expired)");
    expect(page).toContain("expiring.filter((b) => !b.expired)");
  });

  it("separates out-of-stock from low", () => {
    expect(page).toContain("stock.filter((p) => p.onHand === 0)");
    expect(page).toContain("p.onHand > 0 && p.onHand <= p.reorderPoint");
  });

  it("shows the dates to everyone and the costs only to reporters", () => {
    // A cashier who can see the Amoxicillin expired last week is a cashier who
    // does not sell it.
    expect(page).toContain('const showCost = can(staff.role, "viewReports");');
    expect(page).toContain("showCost && (");
  });

  it("says when a reorder point of zero is why nothing is listed", () => {
    // A product with reorderPoint 0 can never be low — only out. That is an
    // unanswered question, not a setting.
    expect(page).toContain("stock.filter((p) => p.reorderPoint === 0)");
  });
});

describe("suppliers", () => {
  const server = src("server/pharmacy/suppliers.ts");
  const actions = src("app/suppliers/actions.ts");

  it("writes every column the table has carried unused", () => {
    for (const field of ["contactPerson", "phone", "email", "address", "notes"]) {
      expect(server).toContain(field);
    }
  });

  it("keeps the pharmacy in the WHERE clause of every write", () => {
    expect(server).toContain("where: { id: supplierId, pharmacyId }");
    expect(server).toContain("where: { pharmacyId, supplierId }");
  });

  it("refuses to delete a supplier that has delivered", () => {
    // A batch records which supplier it came from, and that is the trail a
    // recall follows. Deleting the row nulls it.
    expect(server).toContain("tx.pharmacyBatch.count({ where: { pharmacyId, supplierId } })");
    expect(server).toContain("if (batches > 0) return { blocked: batches };");
  });

  it("writes the audit row without a restaurant id", () => {
    // `restaurantId` has a foreign key to `restaurants`; a pharmacy id there
    // fails the constraint.
    expect(server).toContain('entityType: "pharmacy_supplier"');
    // The assignment, not the word — the comment above it explains why the
    // column is absent, and matching that would make this unfailable.
    expect(server).not.toMatch(/restaurantId:/);
  });

  it("gates writes on manageStock", () => {
    const gates = actions.match(/requireStaff\("manageStock"\)/g) ?? [];
    expect(gates.length).toBe(2); // save and remove
  });

  it("takes the pharmacy from the session, never the form", () => {
    expect(actions).toContain("staff.pharmacyId");
    expect(actions).not.toMatch(/formData\.get\("pharmacyId"\)/);
  });
});

describe("what a supplier row may contain", () => {
  it("requires a name", () => {
    expect(SupplierInput.safeParse({ name: "  " }).success).toBe(false);
  });

  it("turns blanks into null rather than empty strings", () => {
    // An empty-string phone number sorts, prints and compares as a value.
    const r = SupplierInput.parse({ name: "Zuellig", phone: "", email: "  " });
    expect(r.phone).toBeNull();
    expect(r.email).toBeNull();
  });

  it("accepts a distributor's messy contact details", () => {
    // Often two addresses or a note. Refusing it because it is not RFC-shaped
    // loses the only contact detail the pharmacy has.
    const r = SupplierInput.parse({ name: "Metro Drug", email: "orders@x.ph / ask for Let" });
    expect(r.email).toBe("orders@x.ph / ask for Let");
  });

  it("trims what it keeps", () => {
    expect(SupplierInput.parse({ name: "  Zuellig  " }).name).toBe("Zuellig");
  });
});
