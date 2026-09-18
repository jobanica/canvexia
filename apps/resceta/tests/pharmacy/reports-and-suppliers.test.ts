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
    // The GATE, not the argument list — wave 6 added a branch argument to both
    // calls, and a test that pins the exact call signature fails on a change
    // that does not touch the rule it is protecting.
    // `.*` rather than `[^)]*`: the arguments now contain a `new Date()`, and
    // a character class that stops at the first paren stopped inside it.
    expect(page).toMatch(/showMoney \? salesReport\(.*\) : null/);
    expect(page).toMatch(/showMoney \? inventoryValuation\(.*\) : null/);
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

/**
 * The alerts page became four tabs backed by `server/pharmacy/alerts.ts`, so
 * these moved with it. THE RULES ARE UNCHANGED — each one is still the rule it
 * always was, pinned against where it now lives.
 */
describe("alerts", () => {
  const page = src("app/alerts/page.tsx");
  const server = src("server/pharmacy/alerts.ts");

  it("separates expired from expiring", () => {
    // A batch past its date is not a warning, it is stock that must come off
    // the shelf. Sorted in with "expiring soon" it scrolls past — so it is its
    // own bucket, its own filter tile and its own badge.
    expect(server).toMatch(/bucket: ExpiryBucket/);
    expect(page).toMatch(/BUCKETS: ExpiryBucket\[\] = \["expired", "d30", "d60", "d90"\]/);
    expect(page).toMatch(/bucket === "expired"\s*\n?\s*\? "border-rose/);
  });

  it("still lists what has run out, even with no reorder point set", () => {
    // Previously its own section. Now the top of the low-stock list, because a
    // product at zero is the most urgent row there is — and requiring a reorder
    // point would have hidden every empty shelf in a freshly imported
    // catalogue, where the threshold is 0 on almost everything.
    expect(server).toMatch(/p\.onHand === 0 \|\| \(p\.onHand <= p\.reorderPoint && p\.reorderPoint > 0\)/);
    expect(server).toMatch(/low\.sort\(\(a, b\) => a\.onHand - b\.onHand/);
  });

  it("shows the dates to everyone and the money only to reporters", () => {
    // A cashier who can see the Amoxicillin expired last week is a cashier who
    // does not sell it.
    expect(page).toContain('const showMoney = can(staff.role, "viewReports");');
    expect(page).toMatch(/showMoney && /);
  });

  it("says when a reorder point of zero is why something is not listed", () => {
    // A product with reorderPoint 0 can never be low — only out. That is an
    // unanswered question, not a setting, and it is said out loud rather than
    // quietly shrinking the list.
    expect(server).toMatch(/if \(p\.reorderPoint === 0\) noReorderPoint \+= 1;/);
    expect(page).toMatch(/no reorder point set/);
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
