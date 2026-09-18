import "server-only";
import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import type { ImportRow } from "@/lib/pharmacy/csv";

/**
 * FILL MISSING EXPIRY DATES AND COSTS ON STOCK THAT IS ALREADY HERE.
 *
 * REPORTED — a first import created 1,886 products, and the batches it made
 * carry no expiry date. Undated stock can never appear in the expiry alerts:
 * there is nothing to compare against. A pharmacy whose alerts are silent
 * because the dates are missing is worse off than one with no alerts at all,
 * because it believes it has been told.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 *
 * IT CREATES NOTHING. No products, no batches, no movements. Re-running the
 * same file must never double the stock, and the ordinary importer already
 * creates opening stock from a quantity column — running THAT again is exactly
 * the mistake this mode exists to avoid.
 *
 * IT NEVER CHANGES A QUANTITY. Quantity moves through receiving, selling,
 * transferring, counting and writing off, each of which leaves a movement row
 * explaining itself.
 *
 * IT FILLS BLANKS, IT DOES NOT OVERWRITE — unless asked, explicitly, per field.
 * A date somebody typed off the box beats a date from a spreadsheet: the person
 * holding the box could read it. Defaulting to overwrite would quietly undo
 * every correction the pharmacy has already made.
 */

export interface BackfillOutcome {
  /** Rows whose product was found in the catalogue. */
  matched: number;
  /** Rows naming a product that is not here. Nothing is created for them. */
  unmatched: number;
  /** Rows that carried no expiry and no cost, so there was nothing to apply. */
  empty: number;
  batchesDated: number;
  batchesCosted: number;
  /** Products matched whose stock already had everything the file offered. */
  alreadyComplete: number;
}

export interface BackfillOptions {
  fillExpiry: boolean;
  fillCost: boolean;
  /** Replace dates and costs that are already set. Off unless asked for. */
  overwrite: boolean;
}

const CHUNK = 300;
const CHUNK_TIMEOUT_MS = 20_000;

const lower = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export async function backfillFromCsv(input: {
  pharmacyId: string;
  rows: ImportRow[];
  options: BackfillOptions;
  actorStaffId: string;
}): Promise<{ ok: true; outcome: BackfillOutcome } | { ok: false; error: string }> {
  const { fillExpiry, fillCost, overwrite } = input.options;
  if (!fillExpiry && !fillCost) {
    return { ok: false, error: "Choose at least one of expiry or cost to fill in." };
  }

  const usable = input.rows.filter((r) => r.problems.length === 0);
  if (usable.length === 0) return { ok: false, error: "No usable rows in that file." };

  const outcome: BackfillOutcome = {
    matched: 0,
    unmatched: 0,
    empty: 0,
    batchesDated: 0,
    batchesCosted: 0,
    alreadyComplete: 0,
  };

  // ── Read the catalogue once, and match in memory. Same rule as the importer:
  // barcode, then SKU, then the exact name.
  let byBarcode: Map<string, string>;
  let bySku: Map<string, string>;
  let byName: Map<string, string>;
  try {
    const products = await systemDb(
      (tx) =>
        tx.pharmacyProduct.findMany({
          where: { pharmacyId: input.pharmacyId },
          select: { id: true, name: true, sku: true, barcode: true },
        }),
      { timeout: CHUNK_TIMEOUT_MS },
    );
    byBarcode = new Map();
    bySku = new Map();
    byName = new Map();
    for (const p of products) {
      if (p.barcode) byBarcode.set(lower(p.barcode), p.id);
      if (p.sku) bySku.set(lower(p.sku), p.id);
      byName.set(lower(p.name), p.id);
    }
  } catch {
    return { ok: false, error: "Could not read the catalogue. Nothing was changed." };
  }

  /*
    ONE ENTRY PER PRODUCT, not per row.

    A price list often lists the same product twice. Applying both rows would
    mean the second silently wins, so the FIRST row carrying a value keeps it —
    the same rule the importer uses for a file that names a product twice.
  */
  const plan = new Map<string, { expiry: string | null; cost: number }>();
  for (const row of usable) {
    const id =
      (row.barcode && byBarcode.get(lower(row.barcode))) ||
      (row.sku && bySku.get(lower(row.sku))) ||
      byName.get(lower(row.name)) ||
      null;
    if (!id) {
      outcome.unmatched += 1;
      continue;
    }
    outcome.matched += 1;

    const expiry = fillExpiry ? row.expiry : null;
    const cost = fillCost ? row.costCentavos : 0;
    if (!expiry && cost <= 0) {
      outcome.empty += 1;
      continue;
    }

    const already = plan.get(id);
    if (already) {
      // Fill anything the earlier row left blank, without overwriting it.
      plan.set(id, {
        expiry: already.expiry ?? expiry,
        cost: already.cost > 0 ? already.cost : cost,
      });
    } else {
      plan.set(id, { expiry, cost });
    }
  }

  const entries = [...plan.entries()];

  try {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const results = await systemDb(async (tx) => {
        let dated = 0;
        let costed = 0;
        let untouched = 0;

        for (const [productId, v] of chunk) {
          let changed = false;

          if (v.expiry) {
            const res = await tx.pharmacyBatch.updateMany({
              where: {
                productId,
                pharmacyId: input.pharmacyId,
                // Only batches with stock in them. Filling a date onto an
                // emptied batch changes a historical record for no benefit.
                quantity: { gt: 0 },
                ...(overwrite ? {} : { expiryDate: null }),
              },
              data: { expiryDate: new Date(`${v.expiry}T00:00:00Z`) },
            });
            dated += res.count;
            if (res.count > 0) changed = true;
          }

          if (v.cost > 0) {
            const res = await tx.pharmacyBatch.updateMany({
              where: {
                productId,
                pharmacyId: input.pharmacyId,
                quantity: { gt: 0 },
                // A cost of 0 is "nobody said", which is what makes a 100%
                // margin appear on every report this stock touches.
                ...(overwrite ? {} : { costCentavos: 0 }),
              },
              data: { costCentavos: v.cost },
            });
            costed += res.count;
            if (res.count > 0) changed = true;
          }

          if (!changed) untouched += 1;
        }

        return { dated, costed, untouched };
      }, { timeout: CHUNK_TIMEOUT_MS });

      outcome.batchesDated += results.dated;
      outcome.batchesCosted += results.costed;
      outcome.alreadyComplete += results.untouched;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const line = msg
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !/^invalid `/i.test(l));
    return {
      ok: false,
      error: `Stopped part way — ${line ? line.slice(0, 140) : "an unexpected database error"}. Anything already filled in has been kept; run it again to carry on.`,
    };
  }

  try {
    await systemDb(
      (tx) =>
        tx.auditLog.create({
          data: {
            actorType: "merchant",
            actorStaffId: input.actorStaffId,
            action: "pharmacy.batches_backfilled",
            entityType: "pharmacy_batch",
            entityId: input.pharmacyId,
            after: {
              ...outcome,
              overwrite,
              fillExpiry,
              fillCost,
            } as Prisma.InputJsonValue,
          },
        }),
      { timeout: CHUNK_TIMEOUT_MS },
    );
  } catch {
    /* the dates are in either way; a missing audit row must not undo them */
  }

  return { ok: true, outcome };
}
