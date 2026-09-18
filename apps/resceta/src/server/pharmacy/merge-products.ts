import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { findDuplicates, type DuplicateCandidate, type DuplicateGroup } from "@/lib/pharmacy/duplicates";
import { onHand, type AllocatableBatch } from "@/lib/pharmacy/fefo";

/**
 * MERGING A PRODUCT THAT WAS ENTERED TWICE.
 *
 * Receiving can create a product inline, so two people typing "Biogesic 500mg"
 * and "BIOGESIC 500 MG" on different days produce two products, two sets of
 * batches, and a low-stock alert that never fires because neither half is below
 * the reorder point on its own.
 *
 * MERGING IS NOT DELETING. Every child row moves to the survivor — batches,
 * sale lines, purchase-order lines, stocktake lines, write-offs, transfer lines
 * and the stock ledger — and the loser is then ARCHIVED rather than removed. A
 * deleted product would null the `productId` on years of sale lines (they are
 * SET NULL by design, so the receipts survive) and the recall trail from a lot
 * number back to a product would end there.
 *
 * ONE TRANSACTION. A half-moved product is a product whose batches say one
 * thing and whose sales say another.
 */

export async function duplicateGroups(pharmacyId: string): Promise<DuplicateGroup[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyProduct.findMany({
      select: {
        id: true,
        name: true,
        genericName: true,
        form: true,
        strength: true,
        sku: true,
        barcode: true,
        priceCentavos: true,
        isActive: true,
        createdAt: true,
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
    }),
  );

  const now = new Date();
  const candidates: DuplicateCandidate[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    genericName: p.genericName,
    form: p.form,
    strength: p.strength,
    sku: p.sku,
    barcode: p.barcode,
    priceCentavos: p.priceCentavos,
    isActive: p.isActive,
    createdAt: p.createdAt,
    onHand: onHand(p.batches as AllocatableBatch[], now),
  }));

  return findDuplicates(candidates);
}

export interface MergeOutcome {
  keptName: string;
  mergedProducts: number;
  movedBatches: number;
  movedUnits: number;
  movedSaleLines: number;
}

export async function mergeProducts(input: {
  pharmacyId: string;
  keepId: string;
  mergeIds: string[];
  actorStaffId: string;
}): Promise<{ ok: true; outcome: MergeOutcome } | { ok: false; error: string }> {
  const mergeIds = [...new Set(input.mergeIds)].filter((id) => id !== input.keepId);
  if (mergeIds.length === 0) return { ok: false, error: "Pick at least one product to merge in." };

  try {
    return await systemDb(async (tx) => {
      // Every id must belong to THIS pharmacy. Without this a forged id merges
      // another pharmacy's product into yours, taking its stock with it — the
      // worst thing on this screen.
      const all = await tx.pharmacyProduct.findMany({
        where: { id: { in: [input.keepId, ...mergeIds] }, pharmacyId: input.pharmacyId },
        select: { id: true, name: true, sku: true, barcode: true },
      });
      if (all.length !== mergeIds.length + 1) {
        return { ok: false as const, error: "One of those products was not found." };
      }
      const keeper = all.find((p) => p.id === input.keepId)!;

      const batches = await tx.pharmacyBatch.aggregate({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        _count: { _all: true },
        _sum: { quantity: true },
      });

      // Everything that points at a product. Each is a plain re-point: the
      // rows keep their own snapshots (name at time of sale, lot number on the
      // batch), so nothing is rewritten, only re-filed.
      await tx.pharmacyBatch.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });
      await tx.pharmacyStockMovement.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });
      const saleLines = await tx.pharmacySaleItem.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });
      await tx.pharmacyPurchaseOrderItem.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });
      await tx.pharmacyWriteoff.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });
      await tx.pharmacyStockTransferItem.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });
      await tx.pharmacyOrderItem.updateMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
        data: { productId: input.keepId },
      });

      /*
        STOCKTAKE LINES ARE THE EXCEPTION. `(stocktakeId, productId)` is unique,
        so re-pointing a loser's line onto a sheet that already counted the
        keeper violates it. Those lines are deleted instead: a count sheet is a
        record of one afternoon, the adjustments it produced are already in the
        ledger, and the surviving line for the keeper still shows what was
        counted.
      */
      await tx.pharmacyStocktakeItem.deleteMany({
        where: { pharmacyId: input.pharmacyId, productId: { in: mergeIds } },
      });

      /*
        The losers' SKU and barcode are cleared before archiving. They are
        unique per pharmacy, and leaving them on an archived row means the
        keeper can never take the identifier the archived twin was holding.
      */
      await tx.pharmacyProduct.updateMany({
        where: { id: { in: mergeIds }, pharmacyId: input.pharmacyId },
        data: { isActive: false, sku: null, barcode: null },
      });

      // If the keeper had no identifier and a loser did, the survivor inherits
      // it — otherwise merging loses the barcode the shop actually scans.
      const donor = all.find((p) => p.id !== input.keepId && (p.sku || p.barcode));
      if (donor && (!keeper.sku || !keeper.barcode)) {
        await tx.pharmacyProduct.update({
          where: { id: input.keepId },
          data: {
            ...(keeper.sku ? {} : { sku: donor.sku }),
            ...(keeper.barcode ? {} : { barcode: donor.barcode }),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: "merchant",
          actorStaffId: input.actorStaffId,
          action: "pharmacy.products_merged",
          entityType: "pharmacy_product",
          entityId: input.keepId,
          // The whole list, because "which product did this batch used to be"
          // is the question somebody asks six months later.
          after: {
            kept: keeper.name,
            mergedIds: mergeIds,
            mergedNames: all.filter((p) => p.id !== input.keepId).map((p) => p.name),
          } as Prisma.InputJsonValue,
        },
      });

      return {
        ok: true as const,
        outcome: {
          keptName: keeper.name,
          mergedProducts: mergeIds.length,
          movedBatches: batches._count._all,
          movedUnits: batches._sum.quantity ?? 0,
          movedSaleLines: saleLines.count,
        },
      };
    });
  } catch {
    return { ok: false, error: "Couldn't merge those products. Nothing was changed." };
  }
}
