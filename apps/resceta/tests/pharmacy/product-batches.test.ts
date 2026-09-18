import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WHERE THE EXPIRY DATE LIVES.
 *
 * REPORTED — "when i check the details of the item, there is no expiration
 * date."
 *
 * There is not one, and adding one would be the wrong fix. A product does not
 * expire; a DELIVERY does. Two boxes of the same drug bought a month apart
 * expire on different days and cost different money — which is why stock is
 * held in batches, why FEFO can pick the right box, and why a recall names a
 * lot rather than condemning everything with that name on it.
 *
 * These tests pin BOTH halves: the dates are shown where somebody looked for
 * them, and the product still has no expiry of its own.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("the product form", () => {
  const form = src("app/catalogue/ProductForm.tsx");

  it("still has no expiry field on the product itself", () => {
    // One date on the product means either overwriting it on every delivery —
    // so the oldest box on the shelf becomes invisible — or picking one and
    // calling it the truth. Both end with expired stock being dispensed.
    expect(form).not.toMatch(/name="expiry/);
    expect(form).not.toMatch(/name="expiryDate"/);
  });
});

describe("the batch panel", () => {
  const panel = src("app/catalogue/BatchPanel.tsx");
  const table = src("app/catalogue/CatalogueTable.tsx");

  it("is shown under the product being edited", () => {
    expect(table).toMatch(/<BatchPanel/);
    expect(table).toMatch(/batches=\{p\.batches\}/);
  });

  it("says why the date is on the batch and not the product", () => {
    // Somebody who came looking for a field that does not exist deserves the
    // reason, not an empty screen.
    expect(panel).toMatch(/Expiry and cost belong to the delivery, not the product/);
  });

  it("warns about stock with no expiry at all", () => {
    // A CSV import with no expiry column creates real stock with no date, and
    // undated stock can never appear in the expiry alerts — there is nothing
    // to compare it against.
    expect(panel).toMatch(/no expiry date, so/);
    expect(panel).toMatch(/never appear in the expiry alerts/);
  });

  it("sends somebody wanting to change a COUNT to the ledger screens", () => {
    expect(panel).toMatch(/\/inventory/);
    expect(panel).toMatch(/\/stocktake/);
    expect(panel).toMatch(/Dates and cost only/);
  });
});

describe("correcting a batch", () => {
  const action = src("app/catalogue/batch-actions.ts");

  it("changes dates and cost, and NOTHING else", () => {
    // Quantity is moved by receiving, selling, transferring, counting and
    // writing off — each of which leaves a movement row explaining itself. A
    // quantity edited here would be stock appearing with no ledger behind it.
    expect(action).toMatch(/\/\/ Dates and cost\. Quantity is not in this object and must never be\./);
    expect(action).not.toMatch(/quantity: \{/);
    expect(action).not.toMatch(/data:[\s\S]{0,300}quantity:/);
  });

  it("requires manageStock", () => {
    expect(action).toMatch(/requireStaff\("manageStock"\)/);
  });

  it("finds the batch through the pharmacy, so another tenant's is not found", () => {
    expect(action).toMatch(/where: \{ id: batchId, pharmacyId: staff\.pharmacyId \}/);
  });

  it("audits the change, because the date decides whether stock may be sold", () => {
    // Moving an expiry forward makes unsellable stock sellable. That is exactly
    // the change somebody has to be able to look up afterwards.
    expect(action).toMatch(/action: "pharmacy\.batch_corrected"/);
    expect(action).toMatch(/before: \{/);
  });

  it("lets a date be cleared rather than forcing a guess", () => {
    // A product with no printed expiry should say so.
    expect(action).toMatch(/expiryDate: expiryDate \? new Date\(.+\) : null/);
  });

  it("refreshes the alerts, which are computed from these dates", () => {
    expect(action).toMatch(/revalidatePath\("\/alerts"\)/);
  });
});

describe("the batches carried onto the edit row", () => {
  const catalogue = src("server/pharmacy/catalogue.ts");

  it("comes back in FEFO order", () => {
    // The box that has to go first is the one listed first.
    expect(catalogue).toMatch(/orderBy: \[\{ expiryDate: "asc" \}, \{ receivedAt: "asc" \}\]/);
  });

  it("carries only batches with stock in them", () => {
    expect(catalogue).toMatch(/where: \{ quantity: \{ gt: 0 \} \}/);
  });
});


describe("filling expiry and cost in from the CSV", () => {
  const fill = src("server/pharmacy/catalogue-backfill.ts");
  const actions = src("app/catalogue/tools-actions.ts");
  const panel = src("app/catalogue/ImportPanel.tsx");

  /**
   * REPORTED — "yes fill from the csv", about 1,886 products whose batches
   * came in with no expiry date at all. Undated stock can never appear in the
   * expiry alerts: there is nothing to compare against, so the alerts are
   * silent and the pharmacy believes it has been told.
   */
  it("CREATES NOTHING — no products, no batches, no movements", () => {
    // The ordinary importer creates opening stock from a quantity column.
    // Running THAT again is exactly the mistake this mode exists to avoid, so
    // nothing that holds stock is ever created here. The audit row is the one
    // create, and it is named rather than excluded by a loose pattern.
    expect(fill).not.toMatch(/pharmacyProduct\.create/);
    expect(fill).not.toMatch(/pharmacyBatch\.create/);
    expect(fill).not.toMatch(/pharmacyStockMovement\.create/);
    expect(fill).not.toMatch(/createMany/);
    expect(fill.match(/\.create\(/g) ?? []).toHaveLength(1);
    expect(fill).toMatch(/tx\.auditLog\.create/);
  });

  it("never writes a quantity", () => {
    expect(fill).not.toMatch(/data: \{[^}]*quantity:/);
  });

  it("only touches batches that still have stock in them", () => {
    // Filling a date onto an emptied batch rewrites history for no benefit.
    expect(fill).toMatch(/quantity: \{ gt: 0 \}/);
  });

  it("fills blanks and does not overwrite unless asked", () => {
    // A date somebody typed off the box beats a date from a spreadsheet: the
    // person holding the box could read it.
    expect(fill).toMatch(/overwrite \? \{\} : \{ expiryDate: null \}/);
    expect(fill).toMatch(/overwrite \? \{\} : \{ costCentavos: 0 \}/);
  });

  it("refuses when neither expiry nor cost was chosen", () => {
    expect(fill).toMatch(/Choose at least one of expiry or cost/);
  });

  it("keeps the first row's value when a file names a product twice", () => {
    expect(fill).toMatch(/ONE ENTRY PER PRODUCT, not per row/);
  });

  it("is a separate action from the importer, not a flag on it", () => {
    // One checkbox between "fill in the blanks" and "add 1,886 products again"
    // is one checkbox too few.
    expect(actions).toMatch(/export async function backfillBatches/);
    expect(fill).toMatch(/IT CREATES NOTHING/);
  });

  it("says in the panel that it creates nothing", () => {
    expect(panel).toMatch(/It creates nothing/);
    expect(panel).toMatch(/running it twice is safe/);
  });

  it("requires manageStock", () => {
    expect(actions).toMatch(/backfillBatches[\s\S]{0,400}requireStaff\("manageStock"\)/);
  });
});

describe("the unit cost of an item", () => {
  const panel = src("app/catalogue/BatchPanel.tsx");
  const action = src("app/catalogue/batch-actions.ts");

  /**
   * REPORTED — "there is no unit cost in the details of the item."
   *
   * Like the expiry, there is no single one: two deliveries of the same drug
   * cost different money, and the sale line snapshots the cost of the batch it
   * came out of so margin stays right when the next delivery costs something
   * else. So both honest figures are shown instead of one invented one.
   */
  it("shows the weighted average of what is actually on the shelf", () => {
    expect(panel).toMatch(/const averageCost = units > 0 \? Math\.round\(value \/ units\) : 0/);
  });

  it("shows what the last delivery cost, which is what a buyer needs", () => {
    expect(panel).toMatch(/Last delivery cost/);
  });

  it("puts the selling price and the margin beside them", () => {
    // Cost without price is half an answer.
    expect(panel).toMatch(/Selling price/);
    expect(panel).toMatch(/priceCentavos - averageCost/);
  });

  it("warns that a cost of zero reads as a 100% margin", () => {
    // "Nobody said" is not "free", and it is the kind of wrong number somebody
    // makes a pricing decision on.
    expect(panel).toMatch(/no unit cost, so/);
    expect(panel).toMatch(/100% margin/);
  });

  it("keeps the cost figures behind the same gate as every other cost", () => {
    expect(panel).toMatch(/\{showCost && batches\.length > 0 &&/);
  });

  it("treats an empty cost box as untouched, never as free", () => {
    expect(action).toMatch(/cost === null \? \{\} : \{ costCentavos: cost \}/);
  });

  it("still never writes a quantity", () => {
    expect(action).not.toMatch(/data: \{[\s\S]{0,300}quantity:/);
  });
});


describe("opening stock when a product is added", () => {
  const form = src("app/catalogue/ProductForm.tsx");
  const actions = src("app/catalogue/actions.ts");
  const catalogue = src("server/pharmacy/catalogue.ts");

  /**
   * REPORTED — "when i added a new product, there really is no expiration
   * date."
   *
   * Still none ON the product. But a product added with boxes already on the
   * shelf has a delivery behind it, and that delivery has a date, a lot and a
   * cost. Sending somebody to Receive stock to find the product they just made
   * is how the date gets skipped — and undated stock never reaches the expiry
   * alerts at all.
   */
  it("offers expiry, lot, cost and supplier on the add form", () => {
    expect(form).toMatch(/name="openingExpiry"/);
    expect(form).toMatch(/name="openingLot"/);
    expect(form).toMatch(/name="openingCost"/);
    expect(form).toMatch(/name="openingQuantity"/);
    expect(form).toMatch(/name="openingSupplier"/);
  });

  it("shows the section ONLY when adding, never when editing", () => {
    // Changing a price must not be able to conjure a batch. An existing
    // product's stock is corrected on the batch panel, row by row.
    expect(form).toMatch(/\{!product && \(/);
    expect(actions).toMatch(/\/\/ Editing never touches stock\./);
  });

  it("creates a REAL batch with a REAL movement, in the product's transaction", () => {
    // One stock path: opening stock is indistinguishable from a delivery
    // received tomorrow, because a second way to create stock is a second way
    // to be wrong about it.
    expect(catalogue).toMatch(/tx\.pharmacyBatch\.create/);
    expect(catalogue).toMatch(/tx\.pharmacyStockMovement\.create/);
    expect(catalogue).toMatch(/reason: "Opening stock"/);
  });

  it("refuses a quantity with no unit cost", () => {
    // A batch at zero cost reads as a 100% margin on every report it ever
    // touches, and whoever types an opening quantity is holding the delivery
    // note with the cost on it.
    expect(actions).toMatch(/Opening stock needs a unit cost/);
  });

  it("writes no batch at all when no quantity was given", () => {
    expect(actions).toMatch(/if \(v\.quantity <= 0\) return \{ ok: true, opening: null \}/);
    expect(catalogue).toMatch(/if \(opening && opening\.quantity > 0\)/);
  });

  it("takes the branch from the session, never from the form", () => {
    // A branch id in a request body is one somebody can change, and stock
    // filed at the wrong branch takes its movement with it.
    expect(actions).toMatch(/opening\.opening\.branchId = branch\.writeBranchId/);
    expect(form).not.toMatch(/name="openingBranch/);
  });

  it("checks the supplier belongs to this pharmacy", () => {
    expect(catalogue).toMatch(/where: \{ id: opening\.supplierId, pharmacyId: ctx\.pharmacyId \}/);
  });

  it("says undated stock will not reach the alerts", () => {
    expect(form).toMatch(/never appears in the expiry alerts/);
  });

  it("refreshes the alerts, which are computed from that date", () => {
    expect(actions).toMatch(/revalidatePath\("\/alerts"\)/);
  });
});
