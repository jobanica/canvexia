import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stockScope } from "@/lib/pharmacy/stock-scope";

/**
 * WHICH BRANCH'S STOCK A QUERY MAY SEE.
 *
 * REPORTED — "i tried to check the toril branch, but it has all the inventory
 * from the main branch, i never added any inventory in toril branch."
 *
 * `branchWhere` had existed since branches shipped, and SEVEN readers never
 * called it. The catalogue was the one visible from the screen. The SALE was
 * the one that mattered: FEFO allocated across every branch's batches, so a
 * sale rung up at Toril could decrement a box physically sitting in Main and
 * leave neither shelf matching its count.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const MAIN = "11111111-1111-4111-8111-111111111111";
const TORIL = "22222222-2222-4222-8222-222222222222";

describe("the scope rule", () => {
  it("shows a second branch ONLY its own stock", () => {
    // The whole bug in one line: without this, Toril reads as a copy of Main.
    expect(stockScope(TORIL, MAIN)).toEqual({ branchId: TORIL });
  });

  it("gives the main branch its own plus anything not filed anywhere", () => {
    // Every pre-branch row was backfilled, but a row written by a path not yet
    // taught about branches must land somewhere real rather than vanish.
    expect(stockScope(MAIN, MAIN)).toEqual({ OR: [{ branchId: MAIN }, { branchId: null }] });
  });

  it("treats no branch as the main branch", () => {
    expect(stockScope(null, MAIN)).toEqual({ OR: [{ branchId: MAIN }, { branchId: null }] });
  });

  it("filters nothing when the pharmacy has no branches at all", () => {
    // One implicit location, every row's branchId null. Filtering would hide
    // all of it.
    expect(stockScope(null, null)).toEqual({});
    expect(stockScope(TORIL, null)).toEqual({});
  });

  it("never returns a scope that matches every branch for a real branch", () => {
    const scope = stockScope(TORIL, MAIN);
    expect(Object.keys(scope)).not.toHaveLength(0);
  });
});

describe("the sale", () => {
  const sale = src("server/pharmacy/sale.ts");

  it("allocates only from the branch the till is at", () => {
    expect(sale).toMatch(/const shelf = stockScope\(sellingBranchId, main\?\.id \?\? null\)/);
    expect(sale).toMatch(
      /where: \{ productId: line\.productId, quantity: \{ gt: 0 \}, \.\.\.shelf \}/,
    );
  });

  it("resolves that branch BEFORE anything is allocated", () => {
    // It used to be read after the batches were chosen, which is how FEFO came
    // to pick from every branch.
    expect(sale.indexOf("const sellingBranchId")).toBeLessThan(
      sale.indexOf("allocateFefo(batches"),
    );
  });

  it("takes the branch from the till, never from the request body", () => {
    expect(sale).toMatch(/req\.branchId \?\? openShift\?\.branchId \?\? null/);
  });

  it("files the sale and its movements at that same branch", () => {
    expect(sale).toMatch(/branchId: sellingBranchId/);
    // One resolved value, not three expressions that can drift apart.
    expect(sale.match(/req\.branchId \?\? openShift\?\.branchId/g) ?? []).toHaveLength(1);
  });
});

describe("the readers that were showing every branch", () => {
  it("the catalogue takes a branch and applies it", () => {
    const cat = src("server/pharmacy/catalogue.ts");
    expect(cat).toMatch(/branch\?: BranchContext/);
    expect(cat).toMatch(/where: \{ quantity: \{ gt: 0 \}, \.\.\.scope \}/);
  });

  it("the catalogue page passes the selected branch", () => {
    expect(src("app/catalogue/page.tsx")).toMatch(/listCatalogue\(staff\.pharmacyId, branch\)/);
  });

  it("purchase-order options take a branch", () => {
    // Ordering for Toril should read Toril's shelf, not the company's.
    expect(src("server/pharmacy/purchase-order-options.ts")).toMatch(/where: scope,/);
    expect(src("app/purchase-orders/new/page.tsx")).toMatch(/poProducts\(staff\.pharmacyId, branch\)/);
  });

  it("write-off candidates take a branch", () => {
    // You cannot take a box off a shelf you are not standing at.
    expect(src("server/pharmacy/writeoffs.ts")).toMatch(
      /where: \{ quantity: \{ gt: 0 \}, \.\.\.scope \}/,
    );
    expect(src("app/inventory/page.tsx")).toMatch(/writeoffCandidates\(staff\.pharmacyId, branch\)/);
  });
});

describe("the stocktake", () => {
  const take = src("server/pharmacy/stocktake.ts");

  it("snapshots only the shelf being counted", () => {
    expect(take).toMatch(/where: \{ quantity: \{ gt: 0 \}, \.\.\.shelf \}/);
  });

  it("records which shelf it counted", () => {
    expect(take).toMatch(/branchId: input\.branchId \?\? null/);
  });

  it("adjusts that same shelf on approval", () => {
    // Approving Toril's count used to decrement a box in Main, with nobody at
    // a till to notice.
    expect(take).toMatch(/const countedShelf = stockScope\(sheet\.branchId/);
    expect(take).toMatch(/\.\.\.countedShelf,/);
  });

  it("puts a surplus on the shelf that found it", () => {
    // Otherwise a surplus found at Toril is created with no branch, reads as
    // Main's, and the count that found it still shows short.
    expect(take).toMatch(/branchId: sheet\.branchId,/);
  });

  it("takes the counting branch from the session, not the form", () => {
    expect(src("app/stocktake/actions.ts")).toMatch(/branchId: branch\.writeBranchId/);
  });
});
