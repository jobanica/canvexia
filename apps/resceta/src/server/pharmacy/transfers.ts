import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";

/**
 * TRANSFERS BETWEEN BRANCHES.
 *
 * TWO STEPS, and the gap between them is the point. Stock leaves the source
 * when the transfer is created; it arrives at the destination when somebody
 * there confirms it. In between it is "in transit" and belongs to neither
 * shelf, which is true — the boxes are in a van.
 *
 * A one-step transfer makes stock teleport. It also means a shortfall is
 * invisible: the destination is credited with forty boxes whether forty arrive
 * or thirty-one do, and nobody finds out until a stocktake months later.
 *
 * THE LOT AND EXPIRY TRAVEL WITH THE GOODS. A transfer that loses them turns
 * traceable stock into anonymous stock, and the recall trail — the reason this
 * app has batches at all — stops at the branch boundary.
 */

export interface TransferRow {
  id: string;
  status: string;
  fromBranchName: string;
  toBranchName: string;
  notes: string | null;
  createdAt: Date;
  receivedAt: Date | null;
  lines: number;
  units: number;
  valueCentavos: number;
}

export async function listTransfers(pharmacyId: string, take = 60): Promise<TransferRow[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyStockTransfer.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        status: true,
        notes: true,
        createdAt: true,
        receivedAt: true,
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        items: { select: { quantity: true, unitCostCentavos: true } },
      },
    }),
  );

  return rows.map((t) => ({
    id: t.id,
    status: t.status,
    fromBranchName: t.fromBranch.name,
    toBranchName: t.toBranch.name,
    notes: t.notes,
    createdAt: t.createdAt,
    receivedAt: t.receivedAt,
    lines: t.items.length,
    units: t.items.reduce((s, i) => s + i.quantity, 0),
    valueCentavos: t.items.reduce((s, i) => s + i.quantity * i.unitCostCentavos, 0),
  }));
}

export async function getTransfer(pharmacyId: string, transferId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyStockTransfer.findFirst({
      where: { id: transferId },
      select: {
        id: true,
        status: true,
        notes: true,
        createdAt: true,
        receivedAt: true,
        fromBranchId: true,
        toBranchId: true,
        fromBranch: { select: { name: true } },
        toBranch: { select: { name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitCostCentavos: true,
            lotNumber: true,
            expiryDate: true,
            product: { select: { name: true, genericName: true, unit: true } },
          },
        },
      },
    }),
  );
}

/** Batches with stock at one branch, for the transfer form. */
export async function transferableBatches(pharmacyId: string, branchId: string, isMain: boolean) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyBatch.findMany({
      where: {
        quantity: { gt: 0 },
        // The null-is-main rule again: pre-branch stock sits at the main branch
        // and has to be transferable out of it.
        ...(isMain ? { OR: [{ branchId }, { branchId: null }] } : { branchId }),
      },
      orderBy: [{ expiryDate: "asc" }],
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        quantity: true,
        costCentavos: true,
        productId: true,
        product: { select: { name: true, unit: true } },
      },
    }),
  );
}

export interface TransferLine {
  batchId: string;
  quantity: number;
}

export async function createTransfer(input: {
  pharmacyId: string;
  fromBranchId: string;
  toBranchId: string;
  lines: TransferLine[];
  notes: string | null;
  actorStaffId: string;
}): Promise<{ ok: true; id: string; units: number } | { ok: false; error: string }> {
  if (input.fromBranchId === input.toBranchId) {
    // Would double the stock at that branch: out of it and then back into it.
    return { ok: false, error: "Pick two different branches." };
  }
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Enter a quantity for at least one line." };

  try {
    return await systemDb(async (tx) => {
      const branches = await tx.pharmacyBranch.findMany({
        where: { pharmacyId: input.pharmacyId, id: { in: [input.fromBranchId, input.toBranchId] } },
        select: { id: true },
      });
      if (branches.length !== 2) {
        return { ok: false as const, error: "One of those branches was not found." };
      }

      const transfer = await tx.pharmacyStockTransfer.create({
        data: {
          pharmacyId: input.pharmacyId,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          status: "in_transit",
          notes: input.notes,
          actorStaffId: input.actorStaffId,
        },
        select: { id: true },
      });

      let units = 0;
      for (const line of lines) {
        const batch = await tx.pharmacyBatch.findFirst({
          where: { id: line.batchId, pharmacyId: input.pharmacyId },
          select: {
            id: true,
            productId: true,
            quantity: true,
            costCentavos: true,
            lotNumber: true,
            expiryDate: true,
            branchId: true,
          },
        });
        if (!batch) return { ok: false as const, error: "One of those batches was not found." };
        if (line.quantity > batch.quantity) {
          // Refused, never clamped: sending forty when thirty-one exist would
          // record a transfer that the source shelf cannot honour.
          return {
            ok: false as const,
            error: `Only ${batch.quantity} left in one of those batches.`,
          };
        }

        await tx.pharmacyBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: line.quantity } },
        });

        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: batch.productId,
            batchId: batch.id,
            branchId: input.fromBranchId,
            type: "adjustment",
            quantityDelta: -line.quantity,
            referenceId: transfer.id,
            reason: "Transferred out",
            actorStaffId: input.actorStaffId,
          },
        });

        await tx.pharmacyStockTransferItem.create({
          data: {
            pharmacyId: input.pharmacyId,
            transferId: transfer.id,
            productId: batch.productId,
            sourceBatchId: batch.id,
            // COPIED, not just referenced: the source batch may be emptied and
            // tidied away, and the goods in the van still have a lot number.
            lotNumber: batch.lotNumber,
            expiryDate: batch.expiryDate,
            quantity: line.quantity,
            unitCostCentavos: batch.costCentavos,
          },
        });

        units += line.quantity;
      }

      await audit(tx, input.actorStaffId, "pharmacy.transfer_created", transfer.id, { units });
      return { ok: true as const, id: transfer.id, units };
    });
  } catch {
    return { ok: false, error: "Couldn't create that transfer. Try again." };
  }
}

/**
 * Receive it at the destination.
 *
 * A NEW BATCH AT THE DESTINATION, carrying the lot number, expiry and cost that
 * travelled with the goods. Not a move of the source batch row: the source
 * batch is a record of a delivery to THAT branch, and rewriting its branch
 * would rewrite history at both ends.
 */
export async function receiveTransfer(input: {
  pharmacyId: string;
  transferId: string;
  actorStaffId: string;
}): Promise<{ ok: true; units: number } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const transfer = await tx.pharmacyStockTransfer.findFirst({
        where: { id: input.transferId, pharmacyId: input.pharmacyId },
        select: {
          id: true,
          status: true,
          toBranchId: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              unitCostCentavos: true,
              lotNumber: true,
              expiryDate: true,
            },
          },
        },
      });
      if (!transfer) return { ok: false as const, error: "That transfer was not found." };
      if (transfer.status !== "in_transit") {
        return { ok: false as const, error: `That transfer is already ${transfer.status}.` };
      }

      let units = 0;
      for (const item of transfer.items) {
        const batch = await tx.pharmacyBatch.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            branchId: transfer.toBranchId,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            costCentavos: item.unitCostCentavos,
          },
          select: { id: true },
        });

        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            batchId: batch.id,
            branchId: transfer.toBranchId,
            type: "receive",
            quantityDelta: item.quantity,
            referenceId: transfer.id,
            reason: "Transferred in",
            actorStaffId: input.actorStaffId,
          },
        });

        units += item.quantity;
      }

      await tx.pharmacyStockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "received",
          receivedAt: new Date(),
          receivedByStaffId: input.actorStaffId,
        },
      });

      await audit(tx, input.actorStaffId, "pharmacy.transfer_received", transfer.id, { units });
      return { ok: true as const, units };
    });
  } catch {
    return { ok: false, error: "Couldn't receive that transfer. Try again." };
  }
}

/**
 * Cancel one still in the van, putting the stock back where it came from.
 *
 * A NEW BATCH AT THE SOURCE rather than an increment of the original, for the
 * same reason receiving creates one: the original batch row records a delivery,
 * and quietly topping it back up would make the ledger and the balance tell
 * different stories about what happened.
 */
export async function cancelTransfer(input: {
  pharmacyId: string;
  transferId: string;
  actorStaffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const transfer = await tx.pharmacyStockTransfer.findFirst({
        where: { id: input.transferId, pharmacyId: input.pharmacyId },
        select: {
          id: true,
          status: true,
          fromBranchId: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              unitCostCentavos: true,
              lotNumber: true,
              expiryDate: true,
            },
          },
        },
      });
      if (!transfer) return { ok: false as const, error: "That transfer was not found." };
      if (transfer.status !== "in_transit") {
        // Once received, the stock is on the destination shelf; a cancel would
        // delete stock that exists. Send it back as its own transfer instead.
        return {
          ok: false as const,
          error: "That transfer has already arrived. Send it back as a new transfer.",
        };
      }

      for (const item of transfer.items) {
        const batch = await tx.pharmacyBatch.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            branchId: transfer.fromBranchId,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate,
            quantity: item.quantity,
            costCentavos: item.unitCostCentavos,
          },
          select: { id: true },
        });
        await tx.pharmacyStockMovement.create({
          data: {
            pharmacyId: input.pharmacyId,
            productId: item.productId,
            batchId: batch.id,
            branchId: transfer.fromBranchId,
            type: "receive",
            quantityDelta: item.quantity,
            referenceId: transfer.id,
            reason: "Transfer cancelled, stock returned",
            actorStaffId: input.actorStaffId,
          },
        });
      }

      await tx.pharmacyStockTransfer.update({
        where: { id: transfer.id },
        data: { status: "cancelled" },
      });
      await audit(tx, input.actorStaffId, "pharmacy.transfer_cancelled", transfer.id, {});
      return { ok: true as const };
    });
  } catch {
    return { ok: false, error: "Couldn't cancel that transfer. Try again." };
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
      entityType: "pharmacy_transfer",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
