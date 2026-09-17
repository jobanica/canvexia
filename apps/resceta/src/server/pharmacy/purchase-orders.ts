import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { poStatusFor, type PoInputValues } from "@/lib/pharmacy/po-input";

/**
 * PURCHASE ORDERS — what was ordered, against what arrived.
 *
 * Receiving already existed and wrote batches directly. That records what came
 * in and answers nothing about what was supposed to: a pharmacy could not tell
 * a short delivery from a complete one, could not chase the distributor for the
 * missing forty boxes, and had no document to put a price against before the
 * goods showed up.
 *
 * RECEIVING AGAINST A PO CREATES REAL BATCHES. It is not a second, parallel
 * stock path — it does exactly what the receiving screen does (a batch, a stock
 * movement) and additionally advances `quantityReceived` on the line. One
 * transaction, so a crash cannot leave stock on the shelf that the order says
 * never arrived, or the reverse.
 *
 * THE STATUS IS DERIVED, never stored by hand. See `poStatusFor`.
 */

export interface PoRow {
  id: string;
  poNumber: string;
  status: string;
  supplierName: string | null;
  expectedDate: Date | null;
  notes: string | null;
  createdAt: Date;
  lines: number;
  unitsOrdered: number;
  unitsReceived: number;
  totalCentavos: number;
}

export async function listPurchaseOrders(pharmacyId: string, take = 100): Promise<PoRow[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyPurchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        poNumber: true,
        status: true,
        expectedDate: true,
        notes: true,
        createdAt: true,
        supplier: { select: { name: true } },
        items: {
          select: { quantityOrdered: true, quantityReceived: true, unitCostCentavos: true },
        },
      },
    }),
  );

  return rows.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    supplierName: po.supplier?.name ?? null,
    expectedDate: po.expectedDate,
    notes: po.notes,
    createdAt: po.createdAt,
    lines: po.items.length,
    unitsOrdered: po.items.reduce((t, i) => t + i.quantityOrdered, 0),
    unitsReceived: po.items.reduce((t, i) => t + i.quantityReceived, 0),
    totalCentavos: po.items.reduce((t, i) => t + i.quantityOrdered * i.unitCostCentavos, 0),
  }));
}

export async function getPurchaseOrder(pharmacyId: string, poId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyPurchaseOrder.findFirst({
      where: { id: poId },
      select: {
        id: true,
        poNumber: true,
        status: true,
        expectedDate: true,
        notes: true,
        createdAt: true,
        supplierId: true,
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            quantityOrdered: true,
            quantityReceived: true,
            unitCostCentavos: true,
            product: { select: { name: true, genericName: true, unit: true } },
          },
        },
      },
    }),
  );
}

export async function createPurchaseOrder(input: {
  pharmacyId: string;
  values: PoInputValues;
  actorStaffId: string;
}): Promise<{ ok: true; id: string; poNumber: string } | { ok: false; error: string }> {
  const { pharmacyId, values } = input;

  try {
    return await systemDb(async (tx) => {
      // Every product must belong to THIS pharmacy. Without this a forged id
      // files a line against another pharmacy's product — harmless on its own,
      // and exactly the cross-tenant reference that makes a later join leak.
      const ids = [...new Set(values.lines.map((l) => l.productId))];
      const found = await tx.pharmacyProduct.findMany({
        where: { id: { in: ids }, pharmacyId },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        return { ok: false as const, error: "One of those products isn't in your catalogue." };
      }

      if (values.supplierId) {
        const supplier = await tx.pharmacySupplier.findFirst({
          where: { id: values.supplierId, pharmacyId },
          select: { id: true },
        });
        if (!supplier) return { ok: false as const, error: "That supplier was not found." };
      }

      // Allocate the number by incrementing the counter, not by counting rows.
      // Counting reissues a number after a cancellation, and two people raising
      // an order at once race to the same one.
      const bumped = await tx.pharmacy.update({
        where: { id: pharmacyId },
        data: { nextPoNo: { increment: 1 } },
        select: { nextPoNo: true },
      });
      const poNumber = `PO-${String(bumped.nextPoNo - 1).padStart(5, "0")}`;

      const po = await tx.pharmacyPurchaseOrder.create({
        data: {
          pharmacyId,
          supplierId: values.supplierId,
          poNumber,
          status: "draft",
          expectedDate: values.expectedDate
            ? new Date(`${values.expectedDate.slice(0, 10)}T00:00:00Z`)
            : null,
          notes: values.notes,
          actorStaffId: input.actorStaffId,
          items: {
            create: values.lines.map((l) => ({
              pharmacyId,
              productId: l.productId,
              quantityOrdered: l.quantityOrdered,
              unitCostCentavos: l.unitCostCentavos,
            })),
          },
        },
        select: { id: true },
      });

      await audit(tx, input.actorStaffId, "pharmacy.po_created", po.id, {
        poNumber,
        lines: values.lines.length,
      });
      return { ok: true as const, id: po.id, poNumber };
    });
  } catch {
    return { ok: false, error: "Couldn't raise that order. Try again." };
  }
}

/** Mark a draft as sent to the supplier. */
export async function markPoSent(
  pharmacyId: string,
  poId: string,
  actorStaffId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const count = await systemDb(async (tx) => {
      const res = await tx.pharmacyPurchaseOrder.updateMany({
        // Only from draft. Re-sending a received order would walk its status
        // backwards and lose the fact that the goods are already here.
        where: { id: poId, pharmacyId, status: "draft" },
        data: { status: "sent" },
      });
      if (res.count > 0) await audit(tx, actorStaffId, "pharmacy.po_sent", poId, {});
      return res.count;
    });
    if (count === 0) return { ok: false, error: "Only a draft order can be sent." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't update that order. Try again." };
  }
}

/**
 * Cancel an order.
 *
 * Refused once anything has arrived: goods on the shelf against a cancelled
 * order is a stock record nobody can explain. Cancel is for an order that was
 * raised and never filled.
 */
export async function cancelPurchaseOrder(
  pharmacyId: string,
  poId: string,
  actorStaffId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const po = await tx.pharmacyPurchaseOrder.findFirst({
        where: { id: poId, pharmacyId },
        select: { id: true, status: true, items: { select: { quantityReceived: true } } },
      });
      if (!po) return { ok: false as const, error: "That order was not found." };
      if (po.items.some((i) => i.quantityReceived > 0)) {
        return {
          ok: false as const,
          error: "Some of this order has already arrived, so it cannot be cancelled.",
        };
      }
      await tx.pharmacyPurchaseOrder.update({ where: { id: poId }, data: { status: "cancelled" } });
      await audit(tx, actorStaffId, "pharmacy.po_cancelled", poId, {});
      return { ok: true as const };
    });
  } catch {
    return { ok: false, error: "Couldn't cancel that order. Try again." };
  }
}

export interface ReceiptLine {
  itemId: string;
  quantity: number;
  /** What it actually cost, which need not be what was ordered at. */
  unitCostCentavos: number;
  lotNumber: string | null;
  expiryDate: string | null;
}

/**
 * Receive a delivery against an order.
 *
 * ONE TRANSACTION for the batches, the stock movements, the line counters and
 * the status. Splitting them is how stock ends up on the shelf against an order
 * that still says nothing arrived.
 *
 * THE COST COMES FROM THE DELIVERY, not the order. A distributor who invoices
 * at a different price than quoted is ordinary, and the batch has to carry what
 * was actually paid — every margin figure in this app reads that number.
 */
export async function receiveAgainstPo(input: {
  pharmacyId: string;
  poId: string;
  lines: ReceiptLine[];
  actorStaffId: string;
}): Promise<
  { ok: true; batches: number; units: number; status: string } | { ok: false; error: string }
> {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Enter a quantity for at least one line." };

  try {
    return await systemDb(async (tx) => {
      const po = await tx.pharmacyPurchaseOrder.findFirst({
        where: { id: input.poId, pharmacyId: input.pharmacyId },
        select: {
          id: true,
          status: true,
          supplierId: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantityOrdered: true,
              quantityReceived: true,
            },
          },
        },
      });
      if (!po) return { ok: false as const, error: "That order was not found." };
      if (po.status === "cancelled") {
        return { ok: false as const, error: "That order was cancelled." };
      }

      const byId = new Map(po.items.map((i) => [i.id, i]));
      // A line id that is not on this order is a forged form, not a typo.
      if (lines.some((l) => !byId.has(l.itemId))) {
        return { ok: false as const, error: "One of those lines isn't on this order." };
      }

      let batches = 0;
      let units = 0;

      for (const line of lines) {
        const item = byId.get(line.itemId)!;

        const batch = await tx.pharmacyBatch.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            supplierId: po.supplierId,
            lotNumber: line.lotNumber?.trim() || null,
            expiryDate: line.expiryDate
              ? new Date(`${line.expiryDate.slice(0, 10)}T00:00:00Z`)
              : null,
            quantity: line.quantity,
            costCentavos: line.unitCostCentavos,
          },
          select: { id: true },
        });

        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            batchId: batch.id,
            type: "receive",
            quantityDelta: line.quantity,
            // The PO is the reference, so the ledger reads back as "this
            // delivery, against this order" rather than as loose movements.
            referenceId: po.id,
            reason: "Received against purchase order",
            actorStaffId: input.actorStaffId,
          },
        });

        await tx.pharmacyPurchaseOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: { increment: line.quantity } },
        });

        batches += 1;
        units += line.quantity;
      }

      // Re-read the lines rather than adding up in memory: the increments above
      // are what the database now holds, and the status has to agree with it.
      const after = await tx.pharmacyPurchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
        select: { quantityOrdered: true, quantityReceived: true },
      });
      const status = poStatusFor(after, po.status !== "draft");
      await tx.pharmacyPurchaseOrder.update({ where: { id: po.id }, data: { status } });

      await audit(tx, input.actorStaffId, "pharmacy.po_received", po.id, {
        batches,
        units,
        status,
      });
      return { ok: true as const, batches, units, status };
    });
  } catch {
    return { ok: false, error: "Couldn't record that delivery. Try again." };
  }
}

async function audit(
  tx: Prisma.TransactionClient,
  actorStaffId: string,
  action: string,
  entityId: string,
  after: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "merchant",
      actorStaffId,
      action,
      entityType: "pharmacy_purchase_order",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
