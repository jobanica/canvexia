import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImportRow } from "@/lib/pharmacy/csv";

/**
 * IMPORTING A REAL PRICE LIST.
 *
 * REPORTED — a 1,886-row import came back "The import could not be completed.
 * Nothing was changed."
 *
 * The cause was arithmetic, not logic: ~3 sequential round trips per row inside
 * ONE transaction, against Prisma's 5-second default timeout. It could not have
 * succeeded at that size, and the bare `catch {}` hid which of a dozen things
 * had gone wrong.
 *
 * So these tests count STATEMENTS, not just outcomes. A version that is correct
 * row by row and still issues one insert per row is the bug we already shipped.
 */

const calls: { model: string; op: string; count: number }[] = [];
let failOnProductCreateManyCall: number | null = null;
let productCreateManyCalls = 0;

function fakeTx() {
  const rec = (model: string, op: string) => (args: { data?: unknown }) => {
    const data = args?.data;
    const count = Array.isArray(data) ? data.length : 1;
    calls.push({ model, op, count });
    if (model === "pharmacyProduct" && op === "createMany") {
      productCreateManyCalls += 1;
      if (failOnProductCreateManyCall === productCreateManyCalls) {
        const e = new Error("Transaction already closed") as Error & { code?: string };
        e.code = "P2028";
        throw e;
      }
    }
    return Promise.resolve({ count });
  };
  return {
    pharmacyProduct: {
      findMany: () => {
        calls.push({ model: "pharmacyProduct", op: "findMany", count: 1 });
        return Promise.resolve([]);
      },
      createMany: rec("pharmacyProduct", "createMany"),
      updateMany: rec("pharmacyProduct", "updateMany"),
    },
    pharmacyCategory: {
      findMany: () => {
        calls.push({ model: "pharmacyCategory", op: "findMany", count: 1 });
        return Promise.resolve([]);
      },
      createMany: rec("pharmacyCategory", "createMany"),
    },
    pharmacyBatch: { createMany: rec("pharmacyBatch", "createMany") },
    pharmacyStockMovement: { createMany: rec("pharmacyStockMovement", "createMany") },
    auditLog: { create: rec("auditLog", "create") },
  };
}

const timeouts: (number | undefined)[] = [];

vi.mock("@/server/tenancy/scoped-db", () => ({
  systemDb: (fn: (tx: unknown) => Promise<unknown>, opts?: { timeout?: number }) => {
    timeouts.push(opts?.timeout);
    return fn(fakeTx());
  },
}));

const { importCatalogue } = await import("@/server/pharmacy/catalogue-import");

const PHARMACY = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";

function row(i: number, over: Partial<ImportRow> = {}): ImportRow {
  return {
    line: i + 2,
    name: `Product ${i}`,
    genericName: null,
    form: null,
    strength: null,
    sku: `SKU-${i}`,
    barcode: null,
    unit: "piece",
    category: null,
    priceCentavos: 1000,
    costCentavos: 500,
    quantity: 0,
    expiry: null,
    lotNumber: null,
    reorderPoint: 0,
    requiresPrescription: false,
    problems: [],
    ...over,
  };
}

const run = (rows: ImportRow[], updateExisting = true) =>
  importCatalogue({
    pharmacyId: PHARMACY,
    branchId: null,
    rows,
    updateExisting,
    actorStaffId: STAFF,
  });

beforeEach(() => {
  calls.length = 0;
  timeouts.length = 0;
  productCreateManyCalls = 0;
  failOnProductCreateManyCall = null;
});

describe("a 1,886-row import — the one that failed", () => {
  const rows = Array.from({ length: 1886 }, (_, i) => row(i));

  it("imports every row", async () => {
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.created).toBe(1886);
    expect(res.outcome.stoppedEarly).toBeUndefined();
  });

  it("writes them in a handful of statements, not one per row", async () => {
    await run(rows);
    const writes = calls.filter((c) => c.op !== "findMany");
    // THE ACTUAL BUG. The old version issued ~1,886 product inserts; at three
    // round trips a row that is ~5,600 against a 5-second budget. If this ever
    // climbs back into the hundreds the import has gone row-at-a-time again,
    // whatever the outcome counts say.
    expect(writes.length).toBeLessThan(20);
  });

  it("covers all 1,886 rows across those inserts", async () => {
    await run(rows);
    const inserted = calls
      .filter((c) => c.model === "pharmacyProduct" && c.op === "createMany")
      .reduce((s, c) => s + c.count, 0);
    expect(inserted).toBe(1886);
  });

  it("asks for more than Prisma's five seconds on every transaction it opens", async () => {
    await run(rows);
    // The default killed the original import. An explicit timeout is the only
    // reason a chunk of four hundred rows is allowed to finish.
    expect(timeouts.length).toBeGreaterThan(0);
    expect(timeouts.every((t) => t !== undefined && t > 5_000)).toBe(true);
  });
});

describe("opening stock still becomes a real batch with a real movement", () => {
  it("writes one movement per batch, never a bare quantity", async () => {
    const rows = [row(0, { quantity: 10 }), row(1, { quantity: 5 }), row(2)];
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.batches).toBe(2);
    expect(res.outcome.units).toBe(15);

    const batched = calls
      .filter((c) => c.model === "pharmacyBatch")
      .reduce((s, c) => s + c.count, 0);
    const moved = calls
      .filter((c) => c.model === "pharmacyStockMovement")
      .reduce((s, c) => s + c.count, 0);
    // A batch without its movement is stock no ledger explains.
    expect(batched).toBe(2);
    expect(moved).toBe(2);
  });

  it("writes no batch for a row with no quantity", async () => {
    await run([row(0)]);
    expect(calls.some((c) => c.model === "pharmacyBatch")).toBe(false);
  });
});

describe("categories named by the file", () => {
  it("creates each distinct one once, in a single insert", async () => {
    const rows = [
      row(0, { category: "Antibiotics" }),
      row(1, { category: "antibiotics" }),
      row(2, { category: "Vitamins" }),
    ];
    await run(rows);
    const catInserts = calls.filter((c) => c.model === "pharmacyCategory" && c.op === "createMany");
    expect(catInserts).toHaveLength(1);
    // "Antibiotics" and "antibiotics" are one category, not two.
    expect(catInserts[0]!.count).toBe(2);
  });
});

describe("a file that names the same product twice", () => {
  it("creates it once rather than colliding on its own SKU", async () => {
    const res = await run([row(0), row(0), row(0)]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The second and third occurrences match the first IN MEMORY, before any
    // insert — which is what keeps a set-shaped insert safe from a unique clash
    // the file brought with it.
    expect(res.outcome.created).toBe(1);
    expect(res.outcome.updated).toBe(2);
  });
});

describe("when a chunk fails half way", () => {
  const rows = Array.from({ length: 900 }, (_, i) => row(i));

  it("never claims nothing was changed once a chunk has committed", async () => {
    failOnProductCreateManyCall = 2;
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.created).toBe(400);
    expect(res.outcome.stoppedEarly).toBeDefined();
    expect(res.outcome.stoppedEarly!.afterRows).toBe(400);
    expect(res.outcome.stoppedEarly!.ofRows).toBe(900);
  });

  it("names the timeout in words rather than printing P2028", async () => {
    failOnProductCreateManyCall = 2;
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.stoppedEarly!.reason).toMatch(/ran out of time/);
  });

  it("still records what landed in the audit log", async () => {
    failOnProductCreateManyCall = 2;
    await run(rows);
    // The products are in. An import with no audit row is stock nobody can
    // trace back to a decision.
    expect(calls.some((c) => c.model === "auditLog")).toBe(true);
  });

  it("reports a true failure as a failure when nothing committed", async () => {
    failOnProductCreateManyCall = 1;
    const res = await run(rows);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/Nothing was changed/);
  });
});

describe("rows the parser rejected", () => {
  it("are counted as skipped and never written", async () => {
    const rows = [row(0), row(1, { problems: ["no name"] })];
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.skipped).toBe(1);
    expect(res.outcome.created).toBe(1);
  });

  it("refuses a file where every row is unusable", async () => {
    const res = await run([row(0, { problems: ["no name"] })]);
    expect(res.ok).toBe(false);
  });
});

describe("leaving existing products alone", () => {
  it("writes no update when the box is unticked", async () => {
    const rows = [row(0), row(0)];
    const res = await run(rows, false);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.created).toBe(1);
    expect(res.outcome.updated).toBe(0);
    expect(calls.some((c) => c.model === "pharmacyProduct" && c.op === "updateMany")).toBe(false);
  });
});
