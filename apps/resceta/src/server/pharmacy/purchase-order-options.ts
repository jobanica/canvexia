import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { branchWhere, type BranchContext } from "@/server/pharmacy/branches";
import { onHand, type AllocatableBatch } from "@/lib/pharmacy/fefo";

/**
 * The products the order form offers, with what they last cost.
 *
 * THE LAST COST IS THE DEFAULT PRICE. Typing a unit cost for every line of a
 * forty-line order is how a pharmacy stops raising orders at all; the most
 * recent delivery's cost is nearly always right and is always visible to
 * correct. It comes from the newest batch, not an average, because what matters
 * is what the supplier is charging now.
 */
export interface PoProductOption {
  id: string;
  name: string;
  /** The buyer searches and scans on these, exactly as the counter does. */
  sku: string | null;
  barcode: string | null;
  genericName: string | null;
  unit: string;
  lastCostCentavos: number;
  onHand: number;
  reorderPoint: number;
}

export async function poProducts(
  pharmacyId: string,
  /** Ordering for Toril should read Toril's shelf, not the company's. */
  branch?: BranchContext,
): Promise<PoProductOption[]> {
  const scope = branch ? branchWhere(branch) : {};
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        genericName: true,
        unit: true,
        reorderPoint: true,
        batches: {
          where: scope,
          orderBy: { receivedAt: "desc" },
          select: {
            id: true,
            expiryDate: true,
            receivedAt: true,
            quantity: true,
            costCentavos: true,
            lotNumber: true,
          },
        },
      },
    }),
  );

  const now = new Date();
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    genericName: p.genericName,
    unit: p.unit,
    // The newest delivery, whether or not any of it is left: a product that has
    // run out completely is exactly the one being re-ordered.
    lastCostCentavos: p.batches[0]?.costCentavos ?? 0,
    onHand: onHand(p.batches as AllocatableBatch[], now),
    reorderPoint: p.reorderPoint,
  }));
}
