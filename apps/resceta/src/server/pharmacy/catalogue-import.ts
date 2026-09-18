import "server-only";
import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import type { ImportRow } from "@/lib/pharmacy/csv";

/**
 * BULK IMPORT.
 *
 * A pharmacy switching from a notebook or another system has four hundred
 * products. Typing them into the catalogue form one at a time is the reason
 * they do not switch — so this takes the list they already have.
 *
 * MATCHED ON IDENTIFIERS FIRST, NAME LAST: barcode, then SKU, then the exact
 * name. Re-importing a corrected price list has to update the products it
 * matched rather than doubling the catalogue, and a barcode is a much stronger
 * claim to "this is the same product" than a string somebody typed.
 *
 * OPENING STOCK IS A REAL BATCH, with a real movement behind it. A quantity
 * written straight onto a product would be a number no ledger explains — and
 * this app has no such number anywhere else.
 */

export interface ImportOutcome {
  created: number;
  updated: number;
  batches: number;
  units: number;
  skipped: number;
  /** Row-level failures, so nothing disappears silently. */
  failures: { line: number; name: string; reason: string }[];
}

export async function importCatalogue(input: {
  pharmacyId: string;
  branchId: string | null;
  rows: ImportRow[];
  /** false leaves prices and details alone on products that already exist. */
  updateExisting: boolean;
  actorStaffId: string;
}): Promise<{ ok: true; outcome: ImportOutcome } | { ok: false; error: string }> {
  const usable = input.rows.filter((r) => r.problems.length === 0);
  if (usable.length === 0) return { ok: false, error: "No usable rows in that file." };

  const outcome: ImportOutcome = {
    created: 0,
    updated: 0,
    batches: 0,
    units: 0,
    skipped: input.rows.length - usable.length,
    failures: [],
  };

  try {
    await systemDb(async (tx) => {
      // The whole catalogue once, rather than a query per row. Four hundred
      // rows against a four-hundred-product catalogue is 400 lookups otherwise,
      // and this runs inside one transaction.
      const existing = await tx.pharmacyProduct.findMany({
        where: { pharmacyId: input.pharmacyId },
        select: { id: true, name: true, sku: true, barcode: true },
      });
      const byBarcode = new Map<string, string>();
      const bySku = new Map<string, string>();
      const byName = new Map<string, string>();
      for (const p of existing) {
        if (p.barcode) byBarcode.set(p.barcode.trim().toLowerCase(), p.id);
        if (p.sku) bySku.set(p.sku.trim().toLowerCase(), p.id);
        byName.set(p.name.trim().toLowerCase(), p.id);
      }

      const categories = await tx.pharmacyCategory.findMany({
        where: { pharmacyId: input.pharmacyId },
        select: { id: true, name: true },
      });
      const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

      for (const row of usable) {
        try {
          let categoryId: string | null = null;
          if (row.category) {
            const key = row.category.trim().toLowerCase();
            categoryId = categoryByName.get(key) ?? null;
            if (!categoryId) {
              // Created rather than dropped: a category column the importer
              // ignores is a column people stop filling in.
              const made = await tx.pharmacyCategory.create({
                data: { pharmacyId: input.pharmacyId, name: row.category.trim() },
                select: { id: true },
              });
              categoryId = made.id;
              categoryByName.set(key, made.id);
            }
          }

          const match =
            (row.barcode && byBarcode.get(row.barcode.trim().toLowerCase())) ||
            (row.sku && bySku.get(row.sku.trim().toLowerCase())) ||
            byName.get(row.name.trim().toLowerCase()) ||
            null;

          let productId: string;
          if (match) {
            productId = match;
            if (input.updateExisting) {
              await tx.pharmacyProduct.updateMany({
                where: { id: match, pharmacyId: input.pharmacyId },
                data: {
                  genericName: row.genericName,
                  form: row.form,
                  strength: row.strength,
                  unit: row.unit,
                  // A price of zero in the file means "not given", not "free".
                  ...(row.priceCentavos > 0 ? { priceCentavos: row.priceCentavos } : {}),
                  ...(row.reorderPoint > 0 ? { reorderPoint: row.reorderPoint } : {}),
                  requiresPrescription: row.requiresPrescription,
                  ...(categoryId ? { categoryId } : {}),
                },
              });
              outcome.updated += 1;
            }
          } else {
            const made = await tx.pharmacyProduct.create({
              data: {
                pharmacyId: input.pharmacyId,
                name: row.name,
                genericName: row.genericName,
                form: row.form,
                strength: row.strength,
                sku: row.sku,
                barcode: row.barcode,
                unit: row.unit,
                categoryId,
                priceCentavos: row.priceCentavos,
                reorderPoint: row.reorderPoint,
                requiresPrescription: row.requiresPrescription,
              },
              select: { id: true },
            });
            productId = made.id;
            outcome.created += 1;
            // So a file that lists the same product twice matches itself on
            // the second pass rather than creating it again.
            byName.set(row.name.trim().toLowerCase(), made.id);
            if (row.sku) bySku.set(row.sku.trim().toLowerCase(), made.id);
            if (row.barcode) byBarcode.set(row.barcode.trim().toLowerCase(), made.id);
          }

          if (row.quantity > 0) {
            const batch = await tx.pharmacyBatch.create({
              data: {
                pharmacyId: input.pharmacyId,
                productId,
                branchId: input.branchId,
                lotNumber: row.lotNumber,
                expiryDate: row.expiry ? new Date(`${row.expiry}T00:00:00Z`) : null,
                quantity: row.quantity,
                costCentavos: row.costCentavos,
              },
              select: { id: true },
            });
            await tx.pharmacyStockMovement.create({
              data: {
                pharmacyId: input.pharmacyId,
                productId,
                batchId: batch.id,
                branchId: input.branchId,
                type: "receive",
                quantityDelta: row.quantity,
                reason: "Opening stock, imported",
                actorStaffId: input.actorStaffId,
              },
            });
            outcome.batches += 1;
            outcome.units += row.quantity;
          }
        } catch (e) {
          // One bad row does not lose the other 399. A unique-constraint clash
          // on a duplicated SKU inside the file is the common case.
          outcome.failures.push({
            line: row.line,
            name: row.name,
            reason:
              e instanceof Error && /unique/i.test(e.message)
                ? "that SKU or barcode is already used by another product"
                : "could not be saved",
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorType: "merchant",
          actorStaffId: input.actorStaffId,
          action: "pharmacy.catalogue_imported",
          entityType: "pharmacy_product",
          entityId: input.pharmacyId,
          after: {
            created: outcome.created,
            updated: outcome.updated,
            batches: outcome.batches,
            units: outcome.units,
          } as Prisma.InputJsonValue,
        },
      });
    });

    return { ok: true, outcome };
  } catch {
    return { ok: false, error: "The import could not be completed. Nothing was changed." };
  }
}
