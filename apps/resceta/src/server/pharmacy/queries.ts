import "server-only";
import { systemDb, pharmacyDb } from "@/server/tenancy/scoped-db";
import { expiringWithin, onHand, type AllocatableBatch } from "@/lib/pharmacy/fefo";
import type { BranchContext } from "@/server/pharmacy/branches";
import { branchWhere } from "@/server/pharmacy/branches";

/**
 * Reads for the pharmacy screens.
 *
 * Every one of these goes through pharmacyDb, so the policies are what decide
 * which rows come back. The `where` clauses below narrow WITHIN a pharmacy;
 * none of them names the pharmacy, because none of them has to.
 *
 * The one exception is resolveSlug, which runs as the system — it has to, since
 * resolving a slug is what produces the id that everything else scopes to. It
 * selects an id and a name and nothing else, which is the whole of what a route
 * needs to know before a session exists.
 */

export async function resolveSlug(slug: string) {
  return systemDb((tx) =>
    tx.pharmacy.findUnique({
      where: { slug },
      select: { id: true, name: true, displayName: true, slug: true, status: true, vatRatePct: true },
    }),
  );
}

/** Dev/HQ listing. System-scoped on purpose: it spans merchants. */
export async function listPharmacies() {
  return systemDb((tx) =>
    tx.pharmacy.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, slug: true, status: true, partnerId: true },
    }),
  );
}

export interface CatalogueRow {
  id: string;
  name: string;
  /**
   * The counter searches and SCANS on these, so they travel with the row. A
   * barcode the till cannot match is a barcode the cashier types by hand.
   */
  sku: string | null;
  barcode: string | null;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  unit: string;
  priceCentavos: number;
  requiresPrescription: boolean;
  reorderPoint: number;
  onHand: number;
  soonestExpiry: Date | null;
}

/**
 * The catalogue with live stock.
 *
 * On-hand is computed from the batches rather than stored on the product, and
 * that is not a performance oversight — a stored count and a batch list are two
 * numbers that drift, and the one that matters for dispensing is the batch
 * list. See fefo.ts.
 */
export async function catalogue(
  pharmacyId: string,
  asOf = new Date(),
  /**
   * Which branch's shelf. Omitted means every branch, which is what a
   * single-branch pharmacy always gets and what an owner looking at the whole
   * business asks for.
   */
  branch?: BranchContext,
): Promise<CatalogueRow[]> {
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
        form: true,
        strength: true,
        unit: true,
        priceCentavos: true,
        requiresPrescription: true,
        reorderPoint: true,
        batches: {
          where: { quantity: { gt: 0 }, ...scope },
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

  return rows.map((p) => {
    const batches = p.batches as AllocatableBatch[];
    const dated = batches
      .filter((b) => b.expiryDate !== null)
      .sort((a, b) => (a.expiryDate as Date).getTime() - (b.expiryDate as Date).getTime());
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      genericName: p.genericName,
      form: p.form,
      strength: p.strength,
      unit: p.unit,
      priceCentavos: p.priceCentavos,
      requiresPrescription: p.requiresPrescription,
      reorderPoint: p.reorderPoint,
      onHand: onHand(batches, asOf),
      soonestExpiry: dated[0]?.expiryDate ?? null,
    };
  });
}

export interface ExpiryRow {
  batchId: string;
  productName: string;
  lotNumber: string | null;
  expiryDate: Date;
  quantity: number;
  valueCentavos: number;
  expired: boolean;
}

/**
 * The expiry report — the reason the batch model exists.
 *
 * `days` is a window, not a filter on "soon": already-expired batches are at
 * the top because they are the urgent ones. A pharmacy that cannot see these
 * discovers them when a customer does.
 */
export async function expiryReport(
  pharmacyId: string,
  days = 90,
  asOf = new Date(),
  branch?: BranchContext,
): Promise<ExpiryRow[]> {
  const batches = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyBatch.findMany({
      where: { quantity: { gt: 0 }, ...(branch ? branchWhere(branch) : {}) },
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        receivedAt: true,
        quantity: true,
        costCentavos: true,
        product: { select: { name: true } },
      },
    }),
  );

  const today = asOf;
  return expiringWithin(batches as unknown as AllocatableBatch[], days, today).map((b) => {
    const row = b as unknown as (typeof batches)[number];
    return {
      batchId: row.id,
      productName: row.product.name,
      lotNumber: row.lotNumber,
      expiryDate: row.expiryDate as Date,
      quantity: row.quantity,
      valueCentavos: row.quantity * row.costCentavos,
      expired: (row.expiryDate as Date).getTime() < today.getTime(),
    };
  });
}

export async function recentSales(pharmacyId: string, take = 20, branch?: BranchContext) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacySale.findMany({
      where: branch ? branchWhere(branch) : undefined,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        receiptNumber: true,
        totalCentavos: true,
        discountType: true,
        vatExemptCentavos: true,
        status: true,
        createdAt: true,
      },
    }),
  );
}
