import { describe, it, expect } from "vitest";
import { planImport, TIER_FEE } from "@/server/hq/territories";
import { parseCsv } from "@/lib/hq/csv";

/**
 * The import planner decides what gets rewritten in the table that says who
 * owns a city. An import that silently changed 143 rows because a column was
 * misspelled is not recoverable from a screen — which is why it produces a plan
 * first, and why the plan is tested rather than trusted.
 */
const EXISTING = [
  { slug: "cebu-city", name: "Cebu City", province: "Cebu", region: "Region VII", tier: "large", licenseFee: 79000 },
  { slug: "tagum", name: "Tagum City", province: "Davao del Norte", region: "Region XI", tier: "small", licenseFee: 29000 },
];

const plan = (csv: string) => planImport(parseCsv(csv).rows, EXISTING);

describe("what an import would do", () => {
  it("adds a row it has never seen", () => {
    const p = plan("slug,name,province,region,tier,licenseFee\niloilo,Iloilo City,Iloilo,Region VI,mid,49000\n");
    expect(p.create).toEqual([
      { slug: "iloilo", name: "Iloilo City", province: "Iloilo", region: "Region VI", tier: "mid", licenseFee: 49000 },
    ]);
    expect(p.update).toEqual([]);
  });

  it("reports only the fields that actually changed", () => {
    // A plan listing every column would be unreadable and would hide the one
    // edit somebody meant to make.
    const p = plan("slug,name,tier,licenseFee\ntagum,Tagum City,mid,49000\n");
    expect(p.update).toEqual([{ slug: "tagum", changes: { tier: "mid", licenseFee: 49000 } }]);
  });

  it("does nothing when the file matches the database", () => {
    const p = plan("slug,name,province,region,tier,licenseFee\ncebu-city,Cebu City,Cebu,Region VII,large,79000\n");
    expect(p.create).toEqual([]);
    expect(p.update).toEqual([]);
  });

  it("NEVER deletes a row the file does not mention", () => {
    // A partial file is the normal case: export, edit three lines, re-import.
    // Treating absence as deletion would wipe 140 cities on a routine edit.
    const p = plan("slug,name\ntagum,Tagum City\n");
    expect(p.untouched).toBe(1);
    expect(Object.keys(p)).not.toContain("delete");
  });

  it("falls back to the tier's own fee when the column is blank", () => {
    // The seed's rule. Defaulting to 0 would silently make a city free.
    const p = plan("slug,name,tier\ndavao,Davao City,large\n");
    expect(p.create[0].licenseFee).toBe(TIER_FEE.large);
  });

  it("accepts a fee a spreadsheet formatted with commas and a peso sign", () => {
    const p = plan("slug,name,tier,licenseFee\ndavao,Davao City,large,\"₱79,000\"\n");
    expect(p.errors).toEqual([]);
    expect(p.create[0].licenseFee).toBe(79000);
  });

  it("refuses a row with no slug, because the slug is the key", () => {
    const p = plan("slug,name\n,Nowhere\n");
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0].message).toContain("no slug");
    expect(p.create).toEqual([]);
  });

  it("refuses the same slug twice in one file", () => {
    const p = plan("slug,name\ntagum,Tagum City\ntagum,Tagum\n");
    expect(p.errors[0].message).toContain("twice");
  });

  it("refuses a tier that is not a tier, and a fee that is not a number", () => {
    const bad = plan("slug,name,tier\ndavao,Davao City,enormous\n");
    expect(bad.errors[0].message).toContain("not a tier");

    const fee = plan("slug,name,tier,licenseFee\ndavao,Davao City,large,soon\n");
    expect(fee.errors[0].message).toContain("not a fee");
  });

  it("refuses a new row with no name", () => {
    const p = plan("slug,name\nbrand-new,\n");
    expect(p.errors[0].message).toContain("needs a name");
  });

  it("counts line numbers the way a person reading a spreadsheet does", () => {
    // Header is line 1, so the first data row is line 2. Reporting "row 0" sends
    // somebody to the wrong line in a 143-row file.
    const p = plan("slug,name\ncebu-city,Cebu City\n,Nowhere\n");
    expect(p.errors[0].line).toBe(3);
  });

  it("skips a blank line rather than calling it an error", () => {
    const p = plan("slug,name\ntagum,Tagum City\n\n");
    expect(p.errors).toEqual([]);
  });

  it("survives a file with only the columns it cares about", () => {
    // Somebody exports, deletes every column but two, edits, re-imports.
    // Missing columns mean "unchanged", not "blank it".
    const p = plan("slug,name\ncebu-city,Cebu\n");
    expect(p.errors).toEqual([]);
    expect(p.update).toEqual([{ slug: "cebu-city", changes: { name: "Cebu" } }]);
  });
});
