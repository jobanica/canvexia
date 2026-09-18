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
/** Row names whose INDIVIDUAL create should fail, as a genuinely bad row would. */
let poisonNames = new Set<string>();
/** Make every createMany fail, so the per-row fallback is what does the work. */
let failEveryCreateMany = false;

function fakeTx() {
  const rec = (model: string, op: string) => (args: { data?: unknown }) => {
    const data = args?.data;
    const count = Array.isArray(data) ? data.length : 1;
    calls.push({ model, op, count });
    if (model === "pharmacyProduct" && op === "createMany") {
      productCreateManyCalls += 1;
      if (failEveryCreateMany || failOnProductCreateManyCall === productCreateManyCalls) {
        const e = new Error("Transaction already closed") as Error & { code?: string };
        e.code = "P2028";
        throw e;
      }
    }
    if (model === "pharmacyProduct" && op === "create") {
      const name = (data as { name?: string } | undefined)?.name ?? "";
      if (poisonNames.has(name)) {
        // Prisma error messages START with a newline. That is the whole reason
        // the reported reason came back as an empty string.
        throw new Error("\nInvalid `prisma.pharmacyProduct.create()` invocation:\n\nvalue too long for type character varying(120)");
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
      create: rec("pharmacyProduct", "create"),
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
  poisonNames = new Set();
  failEveryCreateMany = false;
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
  const rows = Array.from({ length: 1886 }, (_, i) => row(i));

  it("retries the chunk row by row and still imports everything else", async () => {
    // REPORTED — "400 added … then it stopped after 400 of 1886 rows". The
    // other 1,486 rows were fine and never got a chance. A chunk is a unit of
    // SPEED, never a unit of blame.
    failOnProductCreateManyCall = 2;
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.created).toBe(1886);
    expect(res.outcome.failures).toHaveLength(0);
    expect(res.outcome.stoppedEarly).toBeUndefined();
  });

  it("costs only the rows that are genuinely bad", async () => {
    failOnProductCreateManyCall = 2;
    poisonNames = new Set(["Product 500", "Product 501"]);
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.created).toBe(1884);
    expect(res.outcome.failures.map((f) => f.name).sort()).toEqual([
      "Product 500",
      "Product 501",
    ]);
  });

  it("names the bad rows by line number", async () => {
    failOnProductCreateManyCall = 2;
    poisonNames = new Set(["Product 500"]);
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.failures[0]!.line).toBe(502);
  });

  it("reports the database's reason instead of an empty string", async () => {
    failOnProductCreateManyCall = 2;
    poisonNames = new Set(["Product 500"]);
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // A Prisma message begins with a newline, so the first LINE is empty and
    // the old code rendered "because ." — a diagnostic that looks like the
    // code knows and will not say.
    const reason = res.outcome.failures[0]!.reason;
    expect(reason).not.toBe("");
    expect(reason).toMatch(/value too long/);
  });

  it("still records what landed in the audit log", async () => {
    failOnProductCreateManyCall = 2;
    await run(rows);
    expect(calls.some((c) => c.model === "auditLog")).toBe(true);
  });
});

describe("a database that has gone away", () => {
  it("gives up rather than failing two thousand rows one at a time", async () => {
    failEveryCreateMany = true;
    const rows = Array.from({ length: 1886 }, (_, i) => row(i, { name: `Bad ${i}` }));
    poisonNames = new Set(rows.map((r) => r.name));
    const res = await run(rows);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/Nothing was changed/);
    // Fifty consecutive failures, not 1,886 attempts.
    const attempts = calls.filter(
      (c) => c.model === "pharmacyProduct" && c.op === "create",
    ).length;
    expect(attempts).toBeLessThanOrEqual(50);
  });

  it("does not give up on a file with bad rows scattered through it", async () => {
    failEveryCreateMany = true;
    const rows = Array.from({ length: 600 }, (_, i) => row(i));
    // 120 bad rows, never 50 in a row — the counter resets on every good one.
    poisonNames = new Set(rows.filter((_, i) => i % 5 === 0).map((r) => r.name));
    const res = await run(rows);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome.created).toBe(480);
    expect(res.outcome.failures).toHaveLength(120);
    expect(res.outcome.stoppedEarly).toBeUndefined();
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
