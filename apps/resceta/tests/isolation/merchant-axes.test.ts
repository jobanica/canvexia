import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MERCHANT_AXES, merchantAxes, merchantAxis, PRODUCTS } from "@servd/core";

/**
 * MERCHANT_AXES and the array literal in rls.sql are the same list written
 * twice, because SQL cannot import TypeScript. This is the test that stops the
 * two copies drifting.
 *
 * The failure they would otherwise produce is the nastiest kind. A GUC name
 * that disagrees does not raise an error: `current_setting(..., true)` returns
 * NULL for a name nobody set, the policy matches no rows, and the symptom is an
 * empty screen a long way from the cause. A table name that disagrees is worse
 * — the partner arm silently stops matching and a partner sees nothing of their
 * own merchants, or, with the columns swapped, something of somebody else's.
 *
 * No database needed: this reads the SQL as text.
 */
const RLS = readFileSync(
  join(process.cwd(), "../../packages/db/prisma/rls.sql"),
  "utf8",
);

/** Pull the `axes text[][] := array[...]` literal back out of the SQL. */
function axesFromSql(): { table: string; column: string; guc: string }[] {
  const block = RLS.match(/axes\s+text\[\]\[\]\s*:=\s*array\[([\s\S]*?)\n\s*\];/);
  if (!block) throw new Error("rls.sql: could not find the axes array literal");
  return [...block[1].matchAll(/array\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)].map(
    (m) => ({ table: m[1], column: m[2], guc: m[3] }),
  );
}

describe("merchant axes agree between TypeScript and SQL", () => {
  it("defines the same axes, in the same shape", () => {
    const fromSql = axesFromSql();
    const fromTs = merchantAxes().map((a) => ({
      table: a.table,
      column: a.column,
      guc: a.guc,
    }));
    expect([...fromSql].sort(byTable)).toEqual([...fromTs].sort(byTable));
  });

  it("covers both products that exist today", () => {
    expect(axesFromSql().map((a) => a.table).sort()).toEqual(["pharmacies", "restaurants"]);
  });

  it("names a real product for every axis", () => {
    for (const axis of merchantAxes()) {
      expect(Object.keys(PRODUCTS)).toContain(axis.productId);
    }
  });

  it("declares a GUC helper function in rls.sql for every axis", () => {
    for (const axis of merchantAxes()) {
      // e.g. app.current_pharmacy_id — the policies call it by this name.
      const fn = axis.guc.replace(/^app\./, "");
      expect(RLS).toContain(`create or replace function app.${fn}()`);
    }
  });

  it("gives every axis its own table, column and GUC", () => {
    const axes = merchantAxes();
    for (const key of ["table", "column", "guc"] as const) {
      const values = axes.map((a) => a[key]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("resolves an axis by product id, and refuses an unknown one", () => {
    expect(merchantAxis("pharmacy")).toBe(MERCHANT_AXES.pharmacy);
    expect(merchantAxis("servd")).toBe(MERCHANT_AXES.servd);
    expect(merchantAxis("laundry")).toBeNull();
    // Not a prototype lookup: "constructor" is not a product.
    expect(merchantAxis("constructor")).toBeNull();
  });
});

function byTable(a: { table: string }, b: { table: string }) {
  return a.table.localeCompare(b.table);
}
