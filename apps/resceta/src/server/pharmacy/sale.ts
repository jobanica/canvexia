import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { allocateFefo, type AllocatableBatch } from "@/lib/pharmacy/fefo";
import { totalSale, type DiscountType } from "@/lib/pharmacy/discount";

/**
 * Complete a sale.
 *
 * ONE transaction, and everything in it has to hold together or none of it
 * happens: stock comes off the right batches, the movement ledger explains it,
 * the receipt number is allocated without a gap, and the Rx gate is enforced.
 * Splitting any of those out would let a counter charge for a medicine it did
 * not have, or hand out a receipt number twice.
 *
 * Scoped through pharmacyDb, not systemDb. A sale is the most ordinary tenant
 * operation there is, and it is exactly the path where a forgotten `where`
 * clause would be most expensive — so it runs under the policies, which means
 * a query that names another pharmacy's batch returns nothing and the sale
 * fails rather than succeeding against the wrong stock.
 */

export interface SaleLineRequest {
  productId: string;
  quantity: number;
}

export interface CompleteSaleRequest {
  pharmacyId: string;
  lines: SaleLineRequest[];
  discountType?: DiscountType;
  manualDiscountCentavos?: number;
  beneficiaryIdNo?: string;
  beneficiaryName?: string;
  paymentMethod?: string;
  tenderedCentavos?: number;
  /** Required if any line is an Rx product. */
  prescriptionRef?: string;
  soldByStaffId?: string;
  /**
   * Which branch's till. Resolved by the caller from the session, never from
   * the browser — a branch id in a request body is one somebody can change, and
   * a sale filed at the wrong branch takes its stock movement with it. Falls
   * back to the open shift's branch, then to null (read as the main branch).
   */
  branchId?: string | null;
  /** Test seam. Defaults to now; expiry comparisons are date-based. */
  asOf?: Date;
}

export type CompleteSaleFailure =
  | "empty_cart"
  | "unknown_product"
  | "insufficient_stock"
  | "prescription_required"
  | "underpaid";

export type CompleteSaleOutcome =
  | { ok: true; saleId: string; receiptNumber: string; totalCentavos: number; changeCentavos: number }
  | { ok: false; reason: CompleteSaleFailure; message: string };

export async function completeSale(
  req: CompleteSaleRequest,
): Promise<CompleteSaleOutcome> {
  const lines = req.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) {
    return { ok: false, reason: "empty_cart", message: "There is nothing in the cart." };
  }
  const asOf = req.asOf ?? new Date();
  const discountType: DiscountType = req.discountType ?? "none";

  return pharmacyDb(req.pharmacyId, async (tx) => {
    const pharmacy = await tx.pharmacy.findUnique({
      where: { id: req.pharmacyId },
      select: { vatRatePct: true, nextReceiptNo: true },
    });
    if (!pharmacy) {
      // Under RLS this is also what a pharmacy id belonging to someone else
      // looks like, which is the intended answer: not found, not forbidden.
      return { ok: false, reason: "unknown_product", message: "Pharmacy not found." };
    }

    const products = await tx.pharmacyProduct.findMany({
      where: { id: { in: lines.map((l) => l.productId) } },
      select: {
        id: true,
        name: true,
        genericName: true,
        priceCentavos: true,
        requiresPrescription: true,
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const line of lines) {
      if (!byId.has(line.productId)) {
        return {
          ok: false,
          reason: "unknown_product",
          message: "One of those items is not in this pharmacy's catalogue.",
        };
      }
    }

    // The Rx gate, checked for the WHOLE cart before anything is written.
    // Dispensing a prescription-only medicine without a prescription is an
    // offence, so this fails the sale rather than dropping the line.
    const needsRx = lines.some((l) => byId.get(l.productId)!.requiresPrescription);
    if (needsRx && !req.prescriptionRef?.trim()) {
      return {
        ok: false,
        reason: "prescription_required",
        message: "One or more items are prescription-only. Record the prescription first.",
      };
    }

    // Allocate every line before writing any of it. A cart that is short on its
    // last line must not leave the first four already deducted.
    const plan: {
      productId: string;
      name: string;
      genericName: string | null;
      unitPriceCentavos: number;
      allocations: ReturnType<typeof allocateFefo>;
    }[] = [];

    for (const line of lines) {
      const product = byId.get(line.productId)!;
      const batches = await tx.pharmacyBatch.findMany({
        where: { productId: line.productId, quantity: { gt: 0 } },
        select: {
          id: true,
          expiryDate: true,
          receivedAt: true,
          quantity: true,
          costCentavos: true,
          lotNumber: true,
        },
      });
      const result = allocateFefo(batches as AllocatableBatch[], line.quantity, asOf);
      if (!result.ok) {
        return {
          ok: false,
          reason: "insufficient_stock",
          message: `Not enough unexpired stock of ${product.name}: ${result.available} available, ${result.needed} needed.`,
        };
      }
      plan.push({
        productId: line.productId,
        name: product.name,
        genericName: product.genericName,
        unitPriceCentavos: product.priceCentavos,
        allocations: result,
      });
    }

    const totals = totalSale(
      lines.map((l) => ({
        unitPriceCentavos: byId.get(l.productId)!.priceCentavos,
        quantity: l.quantity,
      })),
      {
        discountType,
        vatRatePct: pharmacy.vatRatePct,
        manualDiscountCentavos: req.manualDiscountCentavos,
      },
    );

    const tendered = req.tenderedCentavos ?? totals.totalCentavos;
    if (tendered < totals.totalCentavos) {
      return {
        ok: false,
        reason: "underpaid",
        message: "The amount tendered is less than the total due.",
      };
    }

    // Allocate the receipt number by incrementing the counter, not by counting
    // rows. BIR wants the sequence gapless and non-repeating; counting would
    // reissue a number after a void, and two tills would race to the same one.
    const bumped = await tx.pharmacy.update({
      where: { id: req.pharmacyId },
      data: { nextReceiptNo: { increment: 1 } },
      select: { nextReceiptNo: true },
    });
    const receiptNumber = String(bumped.nextReceiptNo - 1).padStart(8, "0");

    // Read INSIDE the same transaction as the sale, so a shift closed between
    // the lookup and the insert cannot capture this receipt.
    const openShift = await tx.pharmacyShift.findFirst({
      where: { pharmacyId: req.pharmacyId, status: "open" },
      orderBy: { openedAt: "desc" },
      select: { id: true, branchId: true },
    });

    const sale = await tx.pharmacySale.create({
      data: {
        pharmacyId: req.pharmacyId,
        receiptNumber,
        subtotalCentavos: totals.subtotalCentavos,
        discountCentavos: totals.discountCentavos,
        totalCentavos: totals.totalCentavos,
        vatExemptCentavos: totals.vatExemptCentavos,
        discountType,
        beneficiaryIdNo: req.beneficiaryIdNo ?? null,
        beneficiaryName: req.beneficiaryName ?? null,
        paymentMethod: req.paymentMethod ?? "cash",
        tenderedCentavos: tendered,
        changeCentavos: tendered - totals.totalCentavos,
        prescriptionRef: req.prescriptionRef?.trim() || null,
        soldByStaffId: req.soldByStaffId ?? null,
        /*
          THE OPEN SHIFT, RESOLVED HERE AND NOT PASSED IN.
          A till id travelling through the browser is a till id somebody can
          change, and a sale filed against yesterday's closed shift would
          silently fall outside the Z-reading that has already been cut. Null
          when no shift is open, which is a valid sale — a pharmacy that has
          not adopted shifts still sells.
        */
        shiftId: openShift?.id ?? null,
        /*
          The branch the till is at, resolved the same way as the shift: from
          the server, never from the form. A branch id in a request body is a
          branch id somebody can change, and a sale filed at the wrong branch
          takes its stock movement with it.
        */
        branchId: req.branchId ?? openShift?.branchId ?? null,
      },
      select: { id: true },
    });

    for (const entry of plan) {
      if (!entry.allocations.ok) continue; // unreachable: checked above
      for (const alloc of entry.allocations.allocations) {
        // One line PER BATCH, not per product. Which batch a unit came from is
        // the recall trail, and a recall names a lot.
        await tx.pharmacySaleItem.create({
          data: {
            pharmacyId: req.pharmacyId,
            saleId: sale.id,
            productId: entry.productId,
            batchId: alloc.batchId,
            nameAtTime: entry.name,
            genericAtTime: entry.genericName,
            lotNumberAtTime: alloc.lotNumber,
            expiryAtTime: alloc.expiryDate,
            quantity: alloc.quantity,
            unitPriceCentavos: entry.unitPriceCentavos,
            lineTotalCentavos: entry.unitPriceCentavos * alloc.quantity,
            unitCostCentavos: alloc.costCentavos,
          },
        });

        await tx.pharmacyBatch.update({
          where: { id: alloc.batchId },
          data: { quantity: { decrement: alloc.quantity } },
        });

        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: req.pharmacyId,
            productId: entry.productId,
            batchId: alloc.batchId,
            type: "sale",
            quantityDelta: -alloc.quantity,
            referenceId: sale.id,
            reason: `Sale ${receiptNumber}`,
            actorStaffId: req.soldByStaffId ?? null,
            branchId: req.branchId ?? openShift?.branchId ?? null,
          },
        });
      }
    }

    return {
      ok: true,
      saleId: sale.id,
      receiptNumber,
      totalCentavos: totals.totalCentavos,
      changeCentavos: tendered - totals.totalCentavos,
    };
  });
}
