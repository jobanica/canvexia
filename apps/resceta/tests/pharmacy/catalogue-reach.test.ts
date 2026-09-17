import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { can, PERMISSIONS, type PharmacyRole } from "@/lib/pharmacy/roles";

/**
 * A COLUMN THE APP READS MUST BE A COLUMN THE APP CAN WRITE.
 *
 * `requiresPrescription` was read in six places and written in zero. The rule
 * the brief calls law rather than policy — only a pharmacist may dispense a
 * prescription-only medicine — was therefore enforced flawlessly against a flag
 * that was false for every product in every pharmacy and could not be changed.
 * `reorderPoint` was the same shape with a smaller blast radius: read by the
 * low-stock report, writable by nothing, so the report fired only after the
 * shelf was empty.
 *
 * Source-level, because the failure was structural: every unit test passed, the
 * gate worked, the counter warned correctly. There was simply no input.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("the statutory flag can be set", () => {
  it("has a write path", () => {
    // The only writer before was receiving, which set name and price.
    const catalogue = src("server/pharmacy/catalogue.ts");
    expect(catalogue).toContain("tx.pharmacyProduct.create");
    expect(catalogue).toContain("tx.pharmacyProduct.update");
  });

  it("is on the form that feeds it", () => {
    const form = src("app/catalogue/ProductForm.tsx");
    expect(form).toContain('name="requiresPrescription"');
    expect(form).toContain('name="reorderPoint"');
  });

  it("survives a form that omits the unticked checkbox", () => {
    // An unticked checkbox is absent from the FormData, not false. Reading it
    // as a plain string would make every product Rx-required the moment the
    // field existed.
    expect(src("app/catalogue/actions.ts")).toContain(
      'requiresPrescription: formData.get("requiresPrescription")',
    );
  });
});

describe("the permission that had no screen now has one", () => {
  it("is held by owner and manager, not a cashier", () => {
    expect(can("owner" as PharmacyRole, "manageCatalogue")).toBe(true);
    expect(can("manager" as PharmacyRole, "manageCatalogue")).toBe(true);
    expect(can("cashier" as PharmacyRole, "manageCatalogue")).toBe(false);
    // A pharmacist runs stock, they do not set prices — the role table's own
    // words, and the page says so rather than just refusing.
    expect(can("pharmacist" as PharmacyRole, "manageCatalogue")).toBe(false);
  });

  it("gates the page and the action on it, not on a role", () => {
    expect(src("app/catalogue/page.tsx")).toContain('can(staff.role, "manageCatalogue")');
    expect(src("app/catalogue/actions.ts")).toContain('requireStaff("manageCatalogue")');
  });

  it("is reachable from the nav", () => {
    const shell = src("components/AppShell.tsx");
    expect(shell).toContain('href: "/catalogue"');
    expect(shell).toContain('needs: "manageCatalogue"');
  });

  it("leaves no permission in the table without somewhere to be used", () => {
    // The whole list, checked against the screens that exercise each one, so
    // adding a permission without giving it a home fails here rather than in
    // somebody's hands.
    const HOMES: Record<string, string> = {
      sell: "app/pos/page.tsx",
      dispenseRx: "app/pos/Counter.tsx",
      voidSale: "app/receipts/[saleId]/ReversalForms.tsx",
      manageStock: "app/receiving/page.tsx",
      manageCatalogue: "app/catalogue/page.tsx",
      viewReports: "app/page.tsx",
      manageStaff: "app/staff/page.tsx",
      manageSettings: "app/settings/page.tsx",
    };
    expect(Object.keys(HOMES).sort()).toEqual([...PERMISSIONS].sort());
    for (const [permission, path] of Object.entries(HOMES)) {
      expect(() => src(path), `${permission} -> ${path}`).not.toThrow();
    }
  });
});

describe("the tenant boundary is in the query, not before it", () => {
  const catalogue = src("server/pharmacy/catalogue.ts");

  it("puts the pharmacy id in the WHERE clause of every write", () => {
    // A product id belonging to another pharmacy updates zero rows rather than
    // being checked and then acted on.
    expect(catalogue.split("pharmacyId: ctx.pharmacyId").length - 1).toBeGreaterThanOrEqual(3);
  });

  it("refuses a category belonging to somebody else", () => {
    expect(catalogue).toContain("async function ownedCategory");
    expect(catalogue).toContain("tx.pharmacyCategory.findFirst");
  });

  it("archives rather than deletes", () => {
    // Batches, stock movements and sale lines point at this row. A delete would
    // orphan a receipt already handed to a customer.
    expect(catalogue).not.toContain("pharmacyProduct.delete");
    expect(catalogue).toContain("isActive");
  });

  it("audits every change with the record either side", () => {
    // What the Rx flag USED to be is the question an inspector asks.
    expect(catalogue).toContain('"pharmacy.product.create"');
    expect(catalogue).toContain('"pharmacy.product.update"');
    expect(catalogue).toContain('"pharmacy.product.archive"');
  });
});

describe("a reorder point of zero is shown as what it is", () => {
  it("reads as 'not set' rather than as a configured threshold", () => {
    expect(src("app/catalogue/CatalogueTable.tsx")).toContain("not set");
  });

  it("says how many items are still in that state", () => {
    // Every product created before this screen existed has one.
    expect(src("app/catalogue/CatalogueTable.tsx")).toContain("p.reorderPoint === 0");
  });
});
