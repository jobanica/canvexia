import "server-only";
import { randomUUID } from "node:crypto";
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
 *
 * ── WHY THIS IS WRITTEN IN BULK ───────────────────────────────────────────
 *
 * REPORTED — a real 1,886-row import failed with "The import could not be
 * completed. Nothing was changed." and no way to find out why.
 *
 * The first version did roughly three sequential round trips per row inside
 * ONE interactive transaction: create the product, create the batch, create the
 * movement. That is ~5,600 round trips, and Prisma's default transaction
 * timeout is FIVE SECONDS. It was never going to finish. Postgres rolled it
 * back, Prisma raised P2028, and a bare `catch {}` flattened that into a
 * sentence that told nobody anything.
 *
 * So the writes are now SET-SHAPED: the ids are generated here, which means
 * products, batches and movements each go in with one statement per chunk
 * instead of one per row. 1,886 rows is about a dozen statements.
 *
 * AND IT COMMITS IN CHUNKS, which is a real trade and worth naming. A single
 * transaction over two thousand rows is not achievable at any timeout worth
 * setting, so an interrupted import can now leave some rows in. That is safe
 * ONLY because of the matching rule above: run it again and the rows that
 * landed are matched, not duplicated. The failure message says so, because a
 * half-finished import that looks total is how somebody ends up with two
 * catalogues.
 */

export interface ImportOutcome {
  created: number;
  updated: number;
  batches: number;
  units: number;
  skipped: number;
  /** Row-level failures, so nothing disappears silently. */
  failures: { line: number; name: string; reason: string }[];
  /**
   * Set when a chunk failed and the import stopped early. The counts above are
   * what actually COMMITTED, never what was attempted.
   */
  stoppedEarly?: { afterRows: number; ofRows: number; reason: string };
}

/**
 * Rows per committed transaction. Small enough that a chunk is a few
 * statements and finishes well inside the timeout; large enough that a
 * two-thousand-row file is a handful of round trips.
 */
const CHUNK = 400;

/** Generous, because a chunk is doing a few set-shaped statements, not 1,200. */
const CHUNK_TIMEOUT_MS = 20_000;

/** One row, on the fallback path. Short: if a single row needs longer, it is broken. */
const ROW_TIMEOUT_MS = 10_000;

function lower(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/** What Prisma's failure actually was, in words a pharmacist can act on. */
function reasonFor(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  const code = (e as { code?: string })?.code ?? "";
  if (code === "P2028" || /transaction.*(closed|not found)|timeout/i.test(msg)) {
    return "the database ran out of time on a batch of rows";
  }
  if (code === "P2002" || /unique/i.test(msg)) {
    return "two rows claim the same SKU or barcode";
  }
  if (code === "P2003" || /foreign key/i.test(msg)) {
    return "a row pointed at something that no longer exists";
  }
  if (/connection|ECONNRESET|terminat/i.test(msg)) {
    return "the database connection dropped";
  }
  /*
    THE FIRST NON-EMPTY LINE, not the first line.

    Prisma error messages BEGIN with a newline — "\nInvalid `prisma.x()`
    invocation:\n\n…" — so taking `split("\n")[0]` produced an empty string,
    and a real import reported "then it stopped after 400 of 1886 rows,
    because ." A diagnostic that renders as a full stop is worse than none: it
    looks like the code knows and will not say.
  */
  const line = msg
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^invalid `/i.test(l));
  return line ? line.slice(0, 160) : "an unexpected database error";
}

interface PlannedCreate {
  row: ImportRow;
  productId: string;
  categoryId: string | null;
}
interface PlannedUpdate {
  row: ImportRow;
  productId: string;
  categoryId: string | null;
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

  // ── PHASE 1: read the catalogue, and make any categories the file names.
  // One short transaction. Nothing here depends on row count.
  let byBarcode: Map<string, string>;
  let bySku: Map<string, string>;
  let byName: Map<string, string>;
  let categoryByName: Map<string, string>;
  try {
    const prepared = await systemDb(async (tx) => {
      const existing = await tx.pharmacyProduct.findMany({
        where: { pharmacyId: input.pharmacyId },
        select: { id: true, name: true, sku: true, barcode: true },
      });
      const barcodes = new Map<string, string>();
      const skus = new Map<string, string>();
      const names = new Map<string, string>();
      for (const p of existing) {
        if (p.barcode) barcodes.set(lower(p.barcode), p.id);
        if (p.sku) skus.set(lower(p.sku), p.id);
        names.set(lower(p.name), p.id);
      }

      const categories = await tx.pharmacyCategory.findMany({
        where: { pharmacyId: input.pharmacyId },
        select: { id: true, name: true },
      });
      const cats = new Map(categories.map((c) => [lower(c.name), c.id]));

      // Every category the file names, in ONE insert rather than one per row.
      // Created rather than dropped: a category column the importer ignores is
      // a column people stop filling in.
      const wanted = new Map<string, string>();
      for (const row of usable) {
        if (!row.category) continue;
        const key = lower(row.category);
        if (key && !cats.has(key) && !wanted.has(key)) wanted.set(key, row.category.trim());
      }
      if (wanted.size > 0) {
        const made = [...wanted].map(([key, name]) => ({
          key,
          id: randomUUID(),
          name,
        }));
        await tx.pharmacyCategory.createMany({
          data: made.map((m) => ({ id: m.id, pharmacyId: input.pharmacyId, name: m.name })),
        });
        for (const m of made) cats.set(m.key, m.id);
      }

      return { barcodes, skus, names, cats };
    }, { timeout: CHUNK_TIMEOUT_MS });
    byBarcode = prepared.barcodes;
    bySku = prepared.skus;
    byName = prepared.names;
    categoryByName = prepared.cats;
  } catch (e) {
    return {
      ok: false,
      error: `Could not read the catalogue to import against — ${reasonFor(e)}. Nothing was changed.`,
    };
  }

  // ── PHASE 2: decide every row's fate in memory, before writing anything.
  //
  // Ids are generated HERE so the inserts below can be set-shaped: a createMany
  // returns no ids, and relying on the order createManyAndReturn hands them
  // back is a guess. Generating them makes the batch and its movement point at
  // the right product by construction.
  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];

  for (const row of usable) {
    const categoryId = row.category ? (categoryByName.get(lower(row.category)) ?? null) : null;
    const match =
      (row.barcode && byBarcode.get(lower(row.barcode))) ||
      (row.sku && bySku.get(lower(row.sku))) ||
      byName.get(lower(row.name)) ||
      null;

    if (match) {
      updates.push({ row, productId: match, categoryId });
      continue;
    }
    const productId = randomUUID();
    creates.push({ row, productId, categoryId });
    // So a file that lists the same product twice matches itself on the second
    // pass rather than creating it again — and so the second occurrence cannot
    // collide with the first on a unique SKU.
    byName.set(lower(row.name), productId);
    if (row.sku) bySku.set(lower(row.sku), productId);
    if (row.barcode) byBarcode.set(lower(row.barcode), productId);
  }

  // ── PHASE 3: write, in chunks that each commit on their own.
  //
  // A FAILED CHUNK IS RETRIED ROW BY ROW, AND THE IMPORT CARRIES ON.
  //
  // REPORTED — the second chunk of a 1,886-row file failed and the import
  // stopped with 400 in. The other 1,486 rows were fine and never got a chance.
  //
  // That was a regression I introduced: the row-at-a-time version this replaced
  // caught per row, so one unimportable row cost one row. Going set-shaped made
  // a chunk atomic, which is right for speed and wrong for blame — a single bad
  // value took four hundred good rows down with it, and then the rest of the
  // file.
  //
  // So bulk is the FAST PATH, not the only path. When a chunk rolls back, every
  // row in it is retried on its own, the ones that genuinely cannot be written
  // are named with their line number, and the next chunk still runs. A file with
  // three bad rows imports 1,883 products and tells you which three.
  let done = 0;
  const total = creates.length + (input.updateExisting ? updates.length : 0);

  const stockFor = (planned: { row: ImportRow; productId: string }[]) => {
    const batches: Prisma.PharmacyBatchCreateManyInput[] = [];
    const movements: Prisma.PharmacyStockMovementCreateManyInput[] = [];
    for (const p of planned) {
      if (p.row.quantity <= 0) continue;
      const batchId = randomUUID();
      batches.push({
        id: batchId,
        pharmacyId: input.pharmacyId,
        productId: p.productId,
        branchId: input.branchId,
        lotNumber: p.row.lotNumber,
        expiryDate: p.row.expiry ? new Date(`${p.row.expiry}T00:00:00Z`) : null,
        quantity: p.row.quantity,
        costCentavos: p.row.costCentavos,
      });
      movements.push({
        pharmacyId: input.pharmacyId,
        productId: p.productId,
        batchId,
        branchId: input.branchId,
        type: "receive",
        quantityDelta: p.row.quantity,
        reason: "Opening stock, imported",
        actorStaffId: input.actorStaffId,
      });
    }
    return { batches, movements };
  };

  const productData = (c: PlannedCreate) => ({
    id: c.productId,
    pharmacyId: input.pharmacyId,
    name: c.row.name,
    genericName: c.row.genericName,
    form: c.row.form,
    strength: c.row.strength,
    sku: c.row.sku,
    barcode: c.row.barcode,
    unit: c.row.unit,
    categoryId: c.categoryId,
    priceCentavos: c.row.priceCentavos,
    reorderPoint: c.row.reorderPoint,
    requiresPrescription: c.row.requiresPrescription,
  });

  const updateData = (u: PlannedUpdate) => ({
    genericName: u.row.genericName,
    form: u.row.form,
    strength: u.row.strength,
    unit: u.row.unit,
    // A price of zero in the file means "not given", not "free".
    ...(u.row.priceCentavos > 0 ? { priceCentavos: u.row.priceCentavos } : {}),
    ...(u.row.reorderPoint > 0 ? { reorderPoint: u.row.reorderPoint } : {}),
    requiresPrescription: u.row.requiresPrescription,
    ...(u.categoryId ? { categoryId: u.categoryId } : {}),
  });

  /*
    A GUARD AGAINST A DEAD DATABASE, not a cap on the file.

    Without it, a database that has gone away turns into two thousand individual
    failing transactions before anybody is told. Consecutive means consecutive:
    it resets on the first row that works, so a file with hundreds of bad rows
    scattered through it still imports every good one.
  */
  const GIVE_UP_AFTER_CONSECUTIVE_FAILURES = 50;
  let consecutiveFailures = 0;
  let abandoned: string | null = null;

  const noteFailure = (row: ImportRow, e: unknown) => {
    outcome.failures.push({ line: row.line, name: row.name, reason: reasonFor(e) });
    consecutiveFailures += 1;
    if (consecutiveFailures >= GIVE_UP_AFTER_CONSECUTIVE_FAILURES) {
      abandoned = reasonFor(e);
    }
  };

  // Retry a rolled-back chunk one row at a time. Each row is its OWN
  // transaction: Postgres aborts a transaction at the first error, so a failing
  // row inside a shared one would take every row after it with it.
  const perRowCreates = async (chunk: PlannedCreate[]) => {
    for (const c of chunk) {
      if (abandoned) return;
      try {
        await systemDb(async (tx) => {
          await tx.pharmacyProduct.create({ data: productData(c), select: { id: true } });
          const { batches, movements } = stockFor([c]);
          if (batches.length > 0) {
            await tx.pharmacyBatch.createMany({ data: batches });
            await tx.pharmacyStockMovement.createMany({ data: movements });
          }
          return batches;
        }, { timeout: ROW_TIMEOUT_MS }).then((batches) => {
          outcome.created += 1;
          outcome.batches += batches.length;
          outcome.units += batches.reduce((s, b) => s + (b.quantity ?? 0), 0);
          consecutiveFailures = 0;
        });
      } catch (e) {
        noteFailure(c.row, e);
      }
      done += 1;
    }
  };

  const perRowUpdates = async (chunk: PlannedUpdate[]) => {
    for (const u of chunk) {
      if (abandoned) return;
      try {
        await systemDb(async (tx) => {
          await tx.pharmacyProduct.updateMany({
            where: { id: u.productId, pharmacyId: input.pharmacyId },
            data: updateData(u),
          });
          const { batches, movements } = stockFor([u]);
          if (batches.length > 0) {
            await tx.pharmacyBatch.createMany({ data: batches });
            await tx.pharmacyStockMovement.createMany({ data: movements });
          }
          return batches;
        }, { timeout: ROW_TIMEOUT_MS }).then((batches) => {
          outcome.updated += 1;
          outcome.batches += batches.length;
          outcome.units += batches.reduce((s, b) => s + (b.quantity ?? 0), 0);
          consecutiveFailures = 0;
        });
      } catch (e) {
        noteFailure(u.row, e);
      }
      done += 1;
    }
  };

  for (let i = 0; i < creates.length && !abandoned; i += CHUNK) {
    const chunk = creates.slice(i, i + CHUNK);
    try {
      const batches = await systemDb(async (tx) => {
        await tx.pharmacyProduct.createMany({ data: chunk.map(productData) });
        const stock = stockFor(chunk);
        if (stock.batches.length > 0) {
          await tx.pharmacyBatch.createMany({ data: stock.batches });
          await tx.pharmacyStockMovement.createMany({ data: stock.movements });
        }
        return stock.batches;
      }, { timeout: CHUNK_TIMEOUT_MS });
      // Counted AFTER the transaction returns. Incrementing inside the callback
      // would credit rows that a later statement in the same transaction rolled
      // back.
      outcome.created += chunk.length;
      outcome.batches += batches.length;
      outcome.units += batches.reduce((s, b) => s + (b.quantity ?? 0), 0);
      consecutiveFailures = 0;
      done += chunk.length;
    } catch {
      await perRowCreates(chunk);
    }
  }

  if (input.updateExisting) {
    for (let i = 0; i < updates.length && !abandoned; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      try {
        const batches = await systemDb(async (tx) => {
          // Distinct data per row, so these stay individual statements — cheap
          // ones inside one transaction rather than one transaction each.
          for (const u of chunk) {
            await tx.pharmacyProduct.updateMany({
              where: { id: u.productId, pharmacyId: input.pharmacyId },
              data: updateData(u),
            });
          }
          const stock = stockFor(chunk);
          if (stock.batches.length > 0) {
            await tx.pharmacyBatch.createMany({ data: stock.batches });
            await tx.pharmacyStockMovement.createMany({ data: stock.movements });
          }
          return stock.batches;
        }, { timeout: CHUNK_TIMEOUT_MS });
        outcome.updated += chunk.length;
        outcome.batches += batches.length;
        outcome.units += batches.reduce((s, b) => s + (b.quantity ?? 0), 0);
        consecutiveFailures = 0;
        done += chunk.length;
      } catch {
        await perRowUpdates(chunk);
      }
    }
  }

  if (abandoned) {
    outcome.stoppedEarly = { afterRows: done, ofRows: total, reason: abandoned };
  }

  // The audit row records what landed, so it is written even after a stop.
  try {
    await systemDb((tx) =>
      tx.auditLog.create({
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
            stoppedEarly: outcome.stoppedEarly ?? null,
          } as Prisma.InputJsonValue,
        },
      }),
      // One insert, so the default would do — but stated anyway, so the rule
      // here is "every transaction this function opens says its own budget"
      // rather than "every one except the last".
      { timeout: CHUNK_TIMEOUT_MS },
    );
  } catch {
    /* the products are in either way; a missing audit row must not undo them */
  }

  if (outcome.created === 0 && outcome.updated === 0) {
    const why =
      outcome.stoppedEarly?.reason ??
      outcome.failures[0]?.reason ??
      "no row could be written";
    return {
      ok: false,
      error: `Nothing could be imported — ${why}. Nothing was changed.`,
    };
  }
  return { ok: true, outcome };
}
