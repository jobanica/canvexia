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
    expect(panel).toMatch(/Expiry belongs to the delivery, not the product/);
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
    expect(panel).toMatch(/Dates only/);
  });
});

describe("correcting a batch", () => {
  const action = src("app/catalogue/batch-actions.ts");

  it("changes dates and NOTHING else", () => {
    // Quantity is moved by receiving, selling, transferring, counting and
    // writing off — each of which leaves a movement row explaining itself. A
    // quantity edited here would be stock appearing with no ledger behind it.
    expect(action).toMatch(/data: \{\s*\n\s*\/\/ Dates only\./);
    expect(action).not.toMatch(/quantity: \{/);
    expect(action).not.toMatch(/data:[\s\S]{0,200}quantity:/);
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
