import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import {
  canVoid,
  checkReturn,
  proratedRefund,
  type ReturnRequestLine,
  type SaleLineForReversal,
} from "@/lib/pharmacy/reversal";

/**
 * Voiding a sale and recording a return.
 *
 * Both are ONE transaction, and both write a movement for every unit that
 * changes hands. The batch quantity is the balance; the movement ledger is the
 * statement that explains it, and a reversal that adjusts one without the other
 * is a discrepancy nobody can account for later.
 *
 * NEITHER EVER EDITS THE SALE'S FIGURES. A void flips a status; a return is its
 * own document pointing at the sale. The receipt keeps saying what it said when
 * it was printed, which is the only version of this that reconciles.
 */

export type VoidOutcome =
  | { ok: true; unitsRestored: number }
  | { ok: false; reason: string; message: string };

export async function voidSale(input: {
  pharmacyId: string;
  saleId: string;
  actorStaffId: string;
  reason?: string;
  asOf?: Date;
}): Promise<VoidOutcome> {
  const asOf = input.asOf ?? new Date();

  return pharmacyDb(input.pharmacyId, async (tx) => {
    const sale = await tx.pharmacySale.findUnique({
      where: { id: input.saleId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        receiptNumber: true,
        _count: { select: { returns: true } },
        items: {
          select: { id: true, productId: true, batchId: true, quantity: true },
        },
      },
    });
    // Under RLS this is also what another pharmacy's sale id looks like, which
    // is the answer we want: not found, not forbidden.
    if (!sale) return { ok: false, reason: "not_found", message: "Receipt not found." };

    const allowed = canVoid(
      {
        status: sale.status as "completed" | "voided",
        createdAt: sale.createdAt,
        returnCount: sale._count.returns,
      },
      asOf,
    );
    if (!allowed.ok) return { ok: false, reason: allowed.reason, message: allowed.message };

    let unitsRestored = 0;
    for (const item of sale.items) {
      // Back to the EXACT batch it left. The sale line recorded which one, so
      // there is nothing to guess and no lot to lose.
      if (item.batchId) {
        await tx.pharmacyBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.quantity } },
        });
      }
      if (item.productId) {
        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            batchId: item.batchId,
            type: "void",
            quantityDelta: item.quantity,
            referenceId: sale.id,
            reason: `Void ${sale.receiptNumber}${input.reason ? ` — ${input.reason}` : ""}`,
            actorStaffId: input.actorStaffId,
          },
        });
      }
      unitsRestored += item.quantity;
    }

    await tx.pharmacySale.update({
      where: { id: sale.id },
      data: { status: "voided", voidedAt: asOf, voidedByStaffId: input.actorStaffId },
    });

    return { ok: true, unitsRestored };
  });
}

export type ReturnOutcome =
  | {
      ok: true;
      returnId: string;
      returnNumber: string;
      refundCentavos: number;
      unitsRestocked: number;
      unitsDestroyed: number;
    }
  | { ok: false; reason: string; message: string; issues?: { saleItemId: string; message: string }[] };

export async function processReturn(input: {
  pharmacyId: string;
  saleId: string;
  actorStaffId: string;
  lines: ReturnRequestLine[];
  reason?: string;
  refundMethod?: string;
  /** Whether this caller may put returned goods back on the shelf. */
  canRestock: boolean;
}): Promise<ReturnOutcome> {
  return pharmacyDb(input.pharmacyId, async (tx) => {
    const sale = await tx.pharmacySale.findUnique({
      where: { id: input.saleId },
      select: {
        id: true,
        status: true,
        receiptNumber: true,
        subtotalCentavos: true,
        totalCentavos: true,
        items: {
          select: {
            id: true,
            productId: true,
            batchId: true,
            nameAtTime: true,
            lotNumberAtTime: true,
            quantity: true,
            unitPriceCentavos: true,
            returnItems: { select: { quantity: true } },
          },
        },
      },
    });
    if (!sale) return { ok: false, reason: "not_found", message: "Receipt not found." };
    if (sale.status === "voided") {
      // The whole sale has already been reversed; there is nothing to give back.
      return {
        ok: false,
        reason: "sale_voided",
        message: "That sale was voided, so there is nothing to return against it.",
      };
    }

    const saleLines: SaleLineForReversal[] = sale.items.map((i) => ({
      saleItemId: i.id,
      productName: i.nameAtTime,
      lotNumber: i.lotNumberAtTime,
      quantity: i.quantity,
      unitPriceCentavos: i.unitPriceCentavos,
      alreadyReturned: i.returnItems.reduce((s, r) => s + r.quantity, 0),
    }));

    const checked = checkReturn(saleLines, input.lines);
    if (!checked.ok) {
      return {
        ok: false,
        reason: "invalid",
        message: checked.issues[0]?.message ?? "That return doesn't look right.",
        issues: checked.issues,
      };
    }

    // Restocking is a permission, checked here rather than trusted from the
    // form: a cashier ticking "put it back" must not be able to return an
    // opened box of antibiotics to the shelf.
    if (!input.canRestock && checked.lines.some((l) => l.restock)) {
      return {
        ok: false,
        reason: "cannot_restock",
        message: "This account can't put returned stock back on the shelf.",
      };
    }

    // Prorated by what the customer actually paid. Refunding list price on a
    // discounted sale — and every SC/PWD sale is discounted — hands back money
    // nobody took.
    const refund = proratedRefund(checked.totalCentavos, sale);

    const bumped = await tx.pharmacy.update({
      where: { id: input.pharmacyId },
      data: { nextReturnNo: { increment: 1 } },
      select: { nextReturnNo: true },
    });
    const returnNumber = `CN${String(bumped.nextReturnNo - 1).padStart(8, "0")}`;

    const created = await tx.pharmacyReturn.create({
      data: {
        pharmacyId: input.pharmacyId,
        saleId: sale.id,
        returnNumber,
        reason: input.reason?.trim() || null,
        totalCentavos: refund,
        refundMethod: input.refundMethod ?? "cash",
        processedByStaffId: input.actorStaffId,
      },
      select: { id: true },
    });

    const byItemId = new Map(sale.items.map((i) => [i.id, i]));
    let unitsRestocked = 0;
    let unitsDestroyed = 0;

    for (const line of checked.lines) {
      const original = byItemId.get(line.saleItemId)!;

      await tx.pharmacyReturnItem.create({
        data: {
          pharmacyId: input.pharmacyId,
          returnId: created.id,
          saleItemId: original.id,
          productId: original.productId,
          // Copied from the sale line: the lot is the recall trail, and it is
          // the reason a return points at a LINE rather than at a product.
          batchId: original.batchId,
          quantity: line.quantity,
          unitPriceCentavos: line.unitPriceCentavos,
          lineTotalCentavos: line.lineTotalCentavos,
          disposition: line.restock ? "restocked" : "destroyed",
        },
      });

      if (line.restock && original.batchId) {
        // Back to the batch it CAME from, never to the newest one. Putting a
        // unit from one lot back into another makes both counts wrong, and a
        // recall names a lot.
        await tx.pharmacyBatch.update({
          where: { id: original.batchId },
          data: { quantity: { increment: line.quantity } },
        });
        unitsRestocked += line.quantity;
      } else {
        unitsDestroyed += line.quantity;
      }

      if (original.productId) {
        // A movement either way. Destroyed stock still moved — it left the
        // customer and did not come back to the shelf — and a ledger that only
        // records the units it kept cannot explain the ones it did not.
        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: original.productId,
            batchId: original.batchId,
            type: "return",
            quantityDelta: line.restock ? line.quantity : 0,
            referenceId: created.id,
            reason: line.restock
              ? `Return ${returnNumber} — restocked to lot ${original.lotNumberAtTime ?? "?"}`
              : `Return ${returnNumber} — destroyed, not resaleable`,
            actorStaffId: input.actorStaffId,
          },
        });
      }
    }

    return {
      ok: true,
      returnId: created.id,
      returnNumber,
      refundCentavos: refund,
      unitsRestocked,
      unitsDestroyed,
    };
  });
}

/** One receipt with everything the reversal screens need. */
export async function saleForReversal(pharmacyId: string, saleId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacySale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        createdAt: true,
        subtotalCentavos: true,
        discountCentavos: true,
        totalCentavos: true,
        discountType: true,
        vatExemptCentavos: true,
        _count: { select: { returns: true } },
        items: {
          select: {
            id: true,
            nameAtTime: true,
            genericAtTime: true,
            lotNumberAtTime: true,
            expiryAtTime: true,
            quantity: true,
            unitPriceCentavos: true,
            returnItems: { select: { quantity: true } },
          },
        },
        returns: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            returnNumber: true,
            totalCentavos: true,
            reason: true,
            createdAt: true,
            items: { select: { quantity: true, disposition: true } },
          },
        },
      },
    }),
  );
}
