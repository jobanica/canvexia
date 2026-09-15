import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvGrid, csvCell, toCsv } from "@/lib/hq/csv";

/**
 * The territory import is the one place in this console where a person hands us
 * a file and we write 143 rows from it. Every case below is one a spreadsheet
 * actually produces.
 */
describe("parsing", () => {
  it("reads a plain file", () => {
    const { headers, rows } = parseCsv("name,province\nCebu City,Cebu\nDavao,Davao del Sur\n");
    expect(headers).toEqual(["name", "province"]);
    expect(rows).toEqual([
      { name: "Cebu City", province: "Cebu" },
      { name: "Davao", province: "Davao del Sur" },
    ]);
  });

  it("keeps a comma inside quotes", () => {
    // The case a split(',') cannot see, and the reason this is a scanner.
    // "Santa Cruz, Laguna" is not exotic.
    const { rows } = parseCsv('name,province\n"Santa Cruz, Laguna",Laguna\n');
    expect(rows[0].name).toBe("Santa Cruz, Laguna");
    expect(rows[0].province).toBe("Laguna");
  });

  it("reads a doubled quote as one literal quote", () => {
    const { rows } = parseCsv('name\n"The ""Old"" Market"\n');
    expect(rows[0].name).toBe('The "Old" Market');
  });

  it("keeps a newline inside quotes", () => {
    const { rows } = parseCsv('name,note\nCebu,"line one\nline two"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("line one\nline two");
  });

  it("handles CRLF without inventing blank rows", () => {
    // A Windows file otherwise produces an empty record between every real one.
    const { rows } = parseCsv("name,province\r\nCebu City,Cebu\r\nDavao,Davao del Sur\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe("Davao");
  });

  it("strips Excel's byte-order mark", () => {
    // Left in place the BOM becomes part of the first header name, which then
    // matches no column and the import silently drops a field.
    const { headers, rows } = parseCsv("﻿name,province\nCebu City,Cebu\n");
    expect(headers[0]).toBe("name");
    expect(rows[0].name).toBe("Cebu City");
  });

  it("does not produce a phantom row from a trailing newline", () => {
    expect(parseCsv("name\nCebu\n").rows).toHaveLength(1);
    expect(parseCsv("name\nCebu").rows).toHaveLength(1);
  });

  it("pads a short row rather than losing the columns", () => {
    // Spreadsheets omit trailing empties. A missing key would make every
    // consumer null-check; an empty string is what the cell means.
    const { rows } = parseCsv("name,province,region\nCebu City\n");
    expect(rows[0]).toEqual({ name: "Cebu City", province: "", region: "" });
  });

  it("returns nothing for an empty file rather than throwing", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
    expect(parseCsv("\n")).toEqual({ headers: [], rows: [] });
  });

  it("keeps an empty quoted field distinct from a missing one", () => {
    const grid = parseCsvGrid('a,"",c\n');
    expect(grid[0]).toEqual(["a", "", "c"]);
  });
});

describe("writing", () => {
  it("quotes only what needs it", () => {
    // Quoting everything is valid and makes the file unpleasant to read and to
    // diff — which matters, because the workflow is export, edit, re-import.
    expect(csvCell("Cebu City")).toBe("Cebu City");
    expect(csvCell("Santa Cruz, Laguna")).toBe('"Santa Cruz, Laguna"');
    expect(csvCell('The "Old" Market')).toBe('"The ""Old"" Market"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(29000)).toBe("29000");
  });

  it("writes CRLF and a trailing newline, because Excel expects both", () => {
    const out = toCsv(["name", "fee"], [{ name: "Cebu City", fee: 79000 }]);
    expect(out).toBe("name,fee\r\nCebu City,79000\r\n");
  });

  it("round-trips everything parsing handles", () => {
    // The assertion that makes the two halves each other's test.
    const rows = [
      { name: "Santa Cruz, Laguna", province: "Laguna", note: 'a "quoted" thing' },
      { name: "Cebu City", province: "Cebu", note: "two\nlines" },
      { name: "Davao", province: "", note: "" },
    ];
    const back = parseCsv(toCsv(["name", "province", "note"], rows)).rows;
    expect(back).toEqual(rows);
  });
});
