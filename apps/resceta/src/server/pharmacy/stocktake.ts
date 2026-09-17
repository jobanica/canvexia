import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { onHand, type AllocatableBatch } from "@/lib/pharmacy/fefo";

/**
 * STOCKTAKES — the count that makes the system agree with the shelf.
 *
 * A stocktake is NOT an edit to the batches. It is a document: what the system
 * believed, what was actually counted, and the difference — approved by
 * somebody before any stock moves. "The system said 40 and the shelf had 31" is
 * a fact worth keeping after the number has been corrected, and it is the only
 * way a pharmacy notices that one product is short every single month.
 *
 * SYSTEM QUANTITIES ARE SNAPSHOTTED WHEN THE SHEET OPENS. Reading them again at
 * approval would compare the count against a number that has moved since —
 * sales happen while people count — and silently write the difference off as a
 * discrepancy that was really just trading.
 *
 * APPROVAL IS WHERE STOCK MOVES, and it moves through the same batch and
 * movement rows as everything else. A shortfall is taken FEFO, soonest-expiring
 * first, for the same reason a sale is: if forty went missing, the ones that
 * went are the ones that were at the front.
 */

export interface StocktakeRow {
  id: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  lines: number;
  counted: number;
  /** Net units of difference, and what that is worth at cost. */
  varianceUnits: number;
  varianceCentavos: number;
}

export async function listStocktakes(pharmacyId: string): Promise<StocktakeRow[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyStocktake.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        notes: true,
        createdAt: true,
        approvedAt: true,
        items: { select: { systemQty: true, countedQty: true, unitCostCentavos: true } },
      },
    }),
  );

  return rows.map((s) => {
    const counted = s.items.filter((i) => i.countedQty !== null);
    return {
      id: s.id,
      status: s.status,
      notes: s.notes,
      createdAt: s.createdAt,
      approvedAt: s.approvedAt,
      lines: s.items.length,
      counted: counted.length,
      varianceUnits: counted.reduce((t, i) => t + (i.countedQty! - i.systemQty), 0),
      varianceCentavos: counted.reduce(
        (t, i) => t + (i.countedQty! - i.systemQty) * i.unitCostCentavos,
        0,
      ),
    };
  });
}

export async function getStocktake(pharmacyId: string, stocktakeId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyStocktake.findFirst({
      where: { id: stocktakeId },
      select: {
        id: true,
        status: true,
        notes: true,
        createdAt: true,
        approvedAt: true,
        items: {
          orderBy: { product: { name: "asc" } },
          select: {
            id: true,
            productId: true,
            systemQty: true,
            countedQty: true,
            unitCostCentavos: true,
            product: { select: { name: true, genericName: true, unit: true } },
          },
        },
      },
    }),
  );
}

/**
 * Open a count sheet over the whole active catalogue.
 *
 * Every product, including the ones the system believes are at zero — those are
 * exactly where a surprise lives. A sheet that only lists what the system
 * thinks is there can never find stock nobody recorded.
 */
export async function openStocktake(input: {
  pharmacyId: string;
  notes: string | null;
  actorStaffId: string;
}): Promise<{ ok: true; id: string; lines: number } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const open = await tx.pharmacyStocktake.findFirst({
        where: { pharmacyId: input.pharmacyId, status: { in: ["draft", "counting"] } },
        select: { id: true },
      });
      if (open) {
        // Two open sheets means two snapshots of the same shelf and two sets
        // of adjustments that each think they are the truth.
        return {
          ok: false as const,
          error: "There is already a count in progress. Finish or cancel it first.",
        };
      }

      const products = await tx.pharmacyProduct.findMany({
        where: { pharmacyId: input.pharmacyId, isActive: true },
        select: {
          id: true,
          batches: {
            where: { quantity: { gt: 0 } },
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
      });
      if (products.length === 0) {
        return { ok: false as const, error: "There is nothing in the catalogue to count." };
      }

      const now = new Date();
      const sheet = await tx.pharmacyStocktake.create({
        data: {
          pharmacyId: input.pharmacyId,
          status: "counting",
          notes: input.notes,
          actorStaffId: input.actorStaffId,
          items: {
            create: products.map((p) => {
              const batches = p.batches as AllocatableBatch[];
              return {
                pharmacyId: input.pharmacyId,
                productId: p.id,
                // The same on-hand the rest of the app shows: expired stock is
                // excluded, because it is not sellable and the shelf count of
                // saleable goods is what is being reconciled.
                systemQty: onHand(batches, now),
                // The newest cost, so a variance can be valued. Not an average:
                // what a missing unit costs to replace is today's price.
                unitCostCentavos:
                  [...batches].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0]
                    ?.costCentavos ?? 0,
                countedQty: null,
              };
            }),
          },
        },
        select: { id: true, _count: { select: { items: true } } },
      });

      await audit(tx, input.actorStaffId, "pharmacy.stocktake_opened", sheet.id, {
        lines: sheet._count.items,
      });
      return { ok: true as const, id: sheet.id, lines: sheet._count.items };
    });
  } catch {
    return { ok: false, error: "Couldn't open a count. Try again." };
  }
}

/** Save counted quantities. A line left blank stays uncounted. */
export async function saveCounts(input: {
  pharmacyId: string;
  stocktakeId: string;
  counts: { itemId: string; countedQty: number | null }[];
  actorStaffId: string;
}): Promise<{ ok: true; counted: number } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const sheet = await tx.pharmacyStocktake.findFirst({
        where: { id: input.stocktakeId, pharmacyId: input.pharmacyId },
        select: { id: true, status: true, items: { select: { id: true } } },
      });
      if (!sheet) return { ok: false as const, error: "That count was not found." };
      if (sheet.status === "approved" || sheet.status === "cancelled") {
        return { ok: false as const, error: "That count is already closed." };
      }

      const known = new Set(sheet.items.map((i) => i.id));
      for (const c of input.counts) {
        if (!known.has(c.itemId)) continue; // not on this sheet: a forged form
        await tx.pharmacyStocktakeItem.update({
          where: { id: c.itemId },
          data: { countedQty: c.countedQty },
        });
      }

      const counted = await tx.pharmacyStocktakeItem.count({
        where: { stocktakeId: sheet.id, countedQty: { not: null } },
      });
      return { ok: true as const, counted };
    });
  } catch {
    return { ok: false, error: "Couldn't save those counts. Try again." };
  }
}

/**
 * Approve the sheet and move the stock.
 *
 * ONLY COUNTED LINES MOVE. A line still NULL is "not counted yet", not
 * "counted zero" — approving a half-finished sheet must not write every
 * untouched product down to nothing, which is the single most destructive
 * thing this screen could do.
 *
 * A SHORTFALL COMES OFF FEFO. If forty went missing, the ones that went are the
 * ones at the front of the shelf. A surplus goes into a new batch with no
 * expiry, because nobody knows what it is — and an undated batch is dispensed
 * last, which is the conservative answer.
 */
export async function approveStocktake(input: {
  pharmacyId: string;
  stocktakeId: string;
  actorStaffId: string;
}): Promise<
  { ok: true; adjusted: number; varianceCentavos: number } | { ok: false; error: string }
> {
  try {
    return await systemDb(async (tx) => {
      const sheet = await tx.pharmacyStocktake.findFirst({
        where: { id: input.stocktakeId, pharmacyId: input.pharmacyId },
        select: {
          id: true,
          status: true,
          items: {
            select: {
              id: true,
              productId: true,
              systemQty: true,
              countedQty: true,
              unitCostCentavos: true,
            },
          },
        },
      });
      if (!sheet) return { ok: false as const, error: "That count was not found." };
      if (sheet.status !== "counting" && sheet.status !== "draft") {
        return { ok: false as const, error: "That count is already closed." };
      }

      const lines = sheet.items.filter(
        (i) => i.countedQty !== null && i.countedQty !== i.systemQty,
      );

      let adjusted = 0;
      let varianceCentavos = 0;

      for (const line of lines) {
        const delta = line.countedQty! - line.systemQty;
        varianceCentavos += delta * line.unitCostCentavos;

        if (delta < 0) {
          // Short. Take it off the soonest-expiring batches first.
          let remaining = -delta;
          const batches = await tx.pharmacyBatch.findMany({
            where: { pharmacyId: input.pharmacyId, productId: line.productId, quantity: { gt: 0 } },
            orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
            select: { id: true, quantity: true, branchId: true },
          });
          for (const b of batches) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, b.quantity);
            await tx.pharmacyBatch.update({
              where: { id: b.id },
              data: { quantity: { decrement: take } },
            });
            await tx.pharmacyStockMovement.create({
              data: {
                pharmacyId: input.pharmacyId,
                productId: line.productId,
                batchId: b.id,
                type: "adjustment",
                quantityDelta: -take,
                referenceId: sheet.id,
                branchId: b.branchId,
                reason: "Stocktake: counted short",
                actorStaffId: input.actorStaffId,
              },
            });
            remaining -= take;
          }
        } else {
          // Found. A new batch with no expiry — nobody knows what it is, and an
          // undated batch is dispensed last, which is the conservative answer.
          const batch = await tx.pharmacyBatch.create({
            data: {
              pharmacyId: input.pharmacyId,
              productId: line.productId,
              quantity: delta,
              costCentavos: line.unitCostCentavos,
              lotNumber: null,
              expiryDate: null,
            },
            select: { id: true },
          });
          await tx.pharmacyStockMovement.create({
            data: {
              pharmacyId: input.pharmacyId,
              productId: line.productId,
              batchId: batch.id,
              type: "adjustment",
              quantityDelta: delta,
              referenceId: sheet.id,
              reason: "Stocktake: counted over",
              actorStaffId: input.actorStaffId,
            },
          });
        }
        adjusted += 1;
      }

      await tx.pharmacyStocktake.update({
        where: { id: sheet.id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedByStaffId: input.actorStaffId,
        },
      });

      await audit(tx, input.actorStaffId, "pharmacy.stocktake_approved", sheet.id, {
        adjusted,
        varianceCentavos,
      });
      return { ok: true as const, adjusted, varianceCentavos };
    });
  } catch {
    return { ok: false, error: "Couldn't approve that count. Try again." };
  }
}

export async function cancelStocktake(input: {
  pharmacyId: string;
  stocktakeId: string;
  actorStaffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const count = await systemDb(async (tx) => {
      const res = await tx.pharmacyStocktake.updateMany({
        // Never an approved one: the stock has already moved, and walking the
        // status back would leave adjustments with no document behind them.
        where: {
          id: input.stocktakeId,
          pharmacyId: input.pharmacyId,
          status: { in: ["draft", "counting"] },
        },
        data: { status: "cancelled" },
      });
      if (res.count > 0) {
        await audit(tx, input.actorStaffId, "pharmacy.stocktake_cancelled", input.stocktakeId, {});
      }
      return res.count;
    });
    if (count === 0) return { ok: false, error: "Only a count in progress can be cancelled." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't cancel that count. Try again." };
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
      entityType: "pharmacy_stocktake",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
