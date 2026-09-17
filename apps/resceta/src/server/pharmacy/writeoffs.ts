import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { movementTypeFor, type WriteoffInputValues } from "@/lib/pharmacy/writeoff-input";

/**
 * STOCK THAT LEFT WITHOUT BEING SOLD.
 *
 * Until this existed the only way stock could go down was a sale. Expired
 * batches sat on the shelf in the system forever — counted in the valuation,
 * counted as sellable by nothing (the FEFO helper excludes them) but never
 * actually removed, so "what did we lose to expiry this year" had no answer
 * and the shelf and the screen drifted apart permanently.
 *
 * THREE WRITES, ONE TRANSACTION: the batch comes down, the ledger records the
 * movement, and the write-off row records WHY and at what cost. Any two
 * without the third is a stock level nobody can explain.
 */

export interface WriteoffRow {
  id: string;
  productName: string;
  lotNumber: string | null;
  quantity: number;
  unitCostCentavos: number;
  totalCostCentavos: number;
  reason: string;
  recipient: string | null;
  notes: string | null;
  createdAt: Date;
}

export async function listWriteoffs(
  pharmacyId: string,
  filter?: { reason?: string; from?: Date; to?: Date },
): Promise<WriteoffRow[]> {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyWriteoff.findMany({
      where: {
        ...(filter?.reason ? { reason: filter.reason as never } : {}),
        ...(filter?.from || filter?.to
          ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        productName: true,
        lotNumber: true,
        quantity: true,
        unitCostCentavos: true,
        totalCostCentavos: true,
        reason: true,
        recipient: true,
        notes: true,
        createdAt: true,
      },
    }),
  );
}

/** Batches with stock left, for the form to pick from. Expiring first. */
export async function writeoffCandidates(pharmacyId: string) {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyBatch.findMany({
      where: { quantity: { gt: 0 } },
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        quantity: true,
        costCentavos: true,
        product: { select: { name: true, unit: true } },
      },
    }),
  );

  // Soonest expiry first, undated last: the batch somebody is writing off is
  // nearly always the one about to go, and making them hunt for it in a
  // name-sorted list is how the screen goes unused.
  return rows.sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return a.product.name.localeCompare(b.product.name);
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate.getTime() - b.expiryDate.getTime();
  });
}

export async function writeOffStock(input: {
  pharmacyId: string;
  values: WriteoffInputValues;
  actorStaffId: string;
}): Promise<
  { ok: true; productName: string; quantity: number; costCentavos: number } | { ok: false; error: string }
> {
  const { pharmacyId, values } = input;

  try {
    return await systemDb(async (tx) => {
      const batch = await tx.pharmacyBatch.findFirst({
        // The pharmacy is in the WHERE clause, so a batch id from another
        // pharmacy is simply not found rather than checked and then acted on.
        where: { id: values.batchId, pharmacyId },
        select: {
          id: true,
          quantity: true,
          costCentavos: true,
          lotNumber: true,
          productId: true,
          branchId: true,
          product: { select: { name: true } },
        },
      });
      if (!batch) return { ok: false as const, error: "That batch was not found." };

      if (values.quantity > batch.quantity) {
        // Refused, never clamped. Clamping writes a record saying forty units
        // left when thirty-one did, which is a worse lie than the discrepancy.
        return {
          ok: false as const,
          error: `There are only ${batch.quantity} left in that batch.`,
        };
      }

      const total = values.quantity * batch.costCentavos;

      await tx.pharmacyBatch.update({
        where: { id: batch.id },
        data: { quantity: { decrement: values.quantity } },
      });

      const writeoff = await tx.pharmacyWriteoff.create({
        data: {
          pharmacyId,
          productId: batch.productId,
          batchId: batch.id,
          // Snapshotted: the product may be archived later and this still has
          // to read.
          productName: batch.product.name,
          lotNumber: batch.lotNumber,
          quantity: values.quantity,
          unitCostCentavos: batch.costCentavos,
          totalCostCentavos: total,
          reason: values.reason,
          recipient: values.recipient,
          notes: values.notes,
          actorStaffId: input.actorStaffId,
        },
        select: { id: true },
      });

      await tx.pharmacyStockMovement.create({
        data: {
          pharmacyId,
          productId: batch.productId,
          batchId: batch.id,
          type: movementTypeFor(values.reason),
          // NEGATIVE. The ledger is signed, and a positive here would make the
          // statement disagree with the balance it is supposed to explain.
          quantityDelta: -values.quantity,
          referenceId: writeoff.id,
          // FROM THE BATCH, not from the session: the stock left the shelf it
          // was actually on, whichever branch the person recording it is at.
          branchId: batch.branchId,
          reason: values.recipient
            ? `${values.reason}: ${values.recipient}`
            : values.reason,
          actorStaffId: input.actorStaffId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: "merchant",
          actorStaffId: input.actorStaffId,
          action: "pharmacy.stock_written_off",
          entityType: "pharmacy_writeoff",
          entityId: writeoff.id,
          after: {
            product: batch.product.name,
            quantity: values.quantity,
            reason: values.reason,
            recipient: values.recipient,
            costCentavos: total,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        ok: true as const,
        productName: batch.product.name,
        quantity: values.quantity,
        costCentavos: total,
      };
    });
  } catch {
    return { ok: false, error: "Couldn't record that. Try again." };
  }
}

/** Totals by reason, for the year-end question and the donations return. */
export async function writeoffSummary(pharmacyId: string, from: Date, to: Date) {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyWriteoff.groupBy({
      by: ["reason"],
      where: { createdAt: { gte: from, lt: to } },
      _sum: { quantity: true, totalCostCentavos: true },
    }),
  );
  return rows.map((r) => ({
    reason: r.reason,
    units: r._sum.quantity ?? 0,
    costCentavos: r._sum.totalCostCentavos ?? 0,
  }));
}
