import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { allocateFefo, type AllocatableBatch } from "@/lib/pharmacy/fefo";
import { totalSale, type DiscountType } from "@/lib/pharmacy/discount";
import { pointsEarned, redeemable } from "@/lib/pharmacy/customer-input";

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
  /**
   * SPLIT TENDERS — ₱500 cash and the rest on GCash, which is an ordinary
   * Tuesday here. When given, these are the truth about what was handed over
   * and `tenderedCentavos` is their sum; `paymentMethod` on the sale becomes
   * the LARGEST of them so every existing report and receipt keeps working.
   */
  payments?: { method: string; amountCentavos: number; reference?: string | null }[];
  /**
   * The loyalty member this sale belongs to. NULLABLE AND STAYING THAT WAY: an
   * anonymous over-the-counter sale is the normal case, and a till that demands
   * a name before it will take money is one the cashier works around.
   */
  customerId?: string | null;
  /** Points the customer wants to spend. Capped at their balance AND the bill. */
  pointsToRedeem?: number;
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

    /*
      LOYALTY, RESOLVED FROM THE DATABASE.

      The points balance and the rates are read here, never taken from the
      form: a browser that says "redeem 5,000 points" must not be able to
      discount a bill the customer has not earned. `redeemable` caps at both
      the balance and the bill, so the answer can never make a total negative —
      a till that hands out cash.
    */
    let customer: { id: string; pointsBalance: number } | null = null;
    if (req.customerId) {
      customer = await tx.pharmacyCustomer.findFirst({
        where: { id: req.customerId, pharmacyId: req.pharmacyId },
        select: { id: true, pointsBalance: true },
      });
      if (!customer) {
        return { ok: false, reason: "unknown_product", message: "That customer was not found." };
      }
    }

    const rates = await tx.pharmacy.findUnique({
      where: { id: req.pharmacyId },
      select: { loyaltyPointsPerPeso: true, loyaltyCentavosPerPoint: true },
    });

    const redemption =
      customer && req.pointsToRedeem && req.pointsToRedeem > 0
        ? redeemable(
            req.pointsToRedeem,
            customer.pointsBalance,
            totals.totalCentavos,
            rates?.loyaltyCentavosPerPoint ?? 0,
          )
        : { points: 0, centavos: 0 };

    // What actually has to be handed over. The sale's own total stays the bill;
    // the redemption is recorded beside it rather than hidden inside it, so a
    // receipt can show both.
    const dueCentavos = totals.totalCentavos - redemption.centavos;

    /*
      TENDERED IS THE SUM OF THE TENDERS when there are any. Trusting a separate
      `tenderedCentavos` alongside a list of payments is two numbers that can
      disagree, and the disagreement would be the change the till hands back.
    */
    const tendered =
      req.payments && req.payments.length > 0
        ? req.payments.reduce((sum, p) => sum + p.amountCentavos, 0)
        : (req.tenderedCentavos ?? dueCentavos);
    if (tendered < dueCentavos) {
      return {
        ok: false,
        reason: "underpaid",
        message: "The amount tendered is less than the total due.",
      };
    }

    /*
      ONE SHAPE FOR "what was this settled with".

      A single cash sale becomes a one-row list rather than a special case, so
      every reader — receipt, Z-reading, report — has one thing to read instead
      of a column and a table that can disagree. Cash is the fallback because a
      sale that reached here was paid for; the question is only with what.
    */
    const tenders =
      req.payments && req.payments.length > 0
        ? req.payments.filter((p) => p.amountCentavos > 0)
        : [{ method: req.paymentMethod ?? "cash", amountCentavos: tendered, reference: null }];

    const largestTender =
      tenders.reduce(
        (best, p) => (p.amountCentavos > best.amountCentavos ? p : best),
        tenders[0] ?? { method: "cash", amountCentavos: 0, reference: null },
      ).method || "cash";

    /*
      EARNED ON THE MONEY, not on the bill. Points are credited against what the
      pharmacy actually received, so a bill settled partly with points does not
      also earn points on the part that was paid for with points — which would
      be a loop that mints value out of itself.
    */
    const earned = customer
      ? pointsEarned(dueCentavos, rates?.loyaltyPointsPerPeso ?? 0)
      : 0;

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
        /*
          THE LARGEST TENDER, not the first. Every existing report groups by
          this column, and a split settled mostly in cash should read as a cash
          sale rather than as whatever the cashier happened to key first.
        */
        paymentMethod: largestTender,
        tenderedCentavos: tendered,
        changeCentavos: tendered - dueCentavos,
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
        customerId: customer?.id ?? null,
        // Snapshotted onto the sale, so a later rate change cannot rewrite what
        // this customer was told they earned.
        pointsEarned: earned,
        pointsRedeemedCentavos: redemption.centavos,
      },
      select: { id: true },
    });

    // One row per tender. Written even for a single payment, so "what was this
    // settled with" has ONE answer everywhere rather than two shapes to read.
    for (const p of tenders) {
      await tx.pharmacySalePayment.create({
        data: {
          pharmacyId: req.pharmacyId,
          saleId: sale.id,
          method: p.method,
          amountCentavos: p.amountCentavos,
          reference: p.reference ?? null,
        },
      });
    }

    /*
      THE LOYALTY LEDGER, in the same transaction as the sale.

      Two rows at most and both signed, so a balance is a SUM and never a CASE
      expression somebody gets backwards. The cached balance moves by exactly
      the same amount — written here rather than recomputed later, because a
      sale that half-credits points is worse than one that credits none.
    */
    if (customer) {
      if (redemption.points > 0) {
        await tx.pharmacyLoyaltyTxn.create({
          data: {
            pharmacyId: req.pharmacyId,
            customerId: customer.id,
            saleId: sale.id,
            kind: "redeem",
            points: -redemption.points,
            note: `Receipt ${receiptNumber}`,
            actorStaffId: req.soldByStaffId ?? null,
          },
        });
      }
      if (earned > 0) {
        await tx.pharmacyLoyaltyTxn.create({
          data: {
            pharmacyId: req.pharmacyId,
            customerId: customer.id,
            saleId: sale.id,
            kind: "earn",
            points: earned,
            note: `Receipt ${receiptNumber}`,
            actorStaffId: req.soldByStaffId ?? null,
          },
        });
      }
      const movement = earned - redemption.points;
      if (movement !== 0) {
        await tx.pharmacyCustomer.update({
          where: { id: customer.id },
          data: { pointsBalance: customer.pointsBalance + movement },
        });
      }
    }

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
      changeCentavos: tendered - dueCentavos,
    };
  });
}
