import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { csvField, toCsv } from "@/lib/pharmacy/alerts";

/**
 * THE SC/PWD LOGBOOK, and the purchase order as a document.
 *
 * REPORTED — "i dont see the senior citizen and pwd logbook, add it and also
 * add export option" / "in the purchase order, add a print button to
 * print/export the purchase order."
 *
 * The logbook is the more serious of the two: every field it needs has been
 * written on the sale since the discount existed, and the ONLY thing that ever
 * read them back was the receipt. The data was complete and the record was
 * unobtainable.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("what the logbook counts", () => {
  const server = src("server/pharmacy/discount-log.ts");

  it("takes only sc and pwd sales", () => {
    expect(server).toMatch(/discountType: \{ in: \["sc", "pwd"\] \}/);
  });

  it("excludes voided sales", () => {
    // A voided sale granted no discount. Listing it overstates what was given
    // away — the direction that matters when somebody is checking the claim.
    expect(server).toMatch(/status: "completed"/);
    expect(server).toMatch(/Voided sales granted nothing/);
  });

  it("records the item name AS SOLD, not the product's name today", () => {
    // A product renamed since is a different string, and the logbook has to
    // match the receipt it is evidence for.
    expect(server).toMatch(/name: i\.nameAtTime/);
  });

  it("counts discounts granted with no ID recorded", () => {
    // That row cannot be defended if anybody asks about it.
    expect(server).toMatch(/missingId: rows\.filter\(\(r\) => !r\.beneficiaryIdNo\?\.trim\(\)\)\.length/);
  });

  it("carries the VAT exempted, which is reported separately", () => {
    expect(server).toMatch(/vatExemptCentavos/);
  });
});

describe("who may read the logbook", () => {
  const page = src("app/discount-log/page.tsx");

  it("is gated on viewReports", () => {
    // A list of named people with their ID numbers is the most personal data
    // this system holds, and the owner and manager answer for it — not
    // whoever is at the till.
    expect(page).toMatch(/if \(!can\(staff\.role, "viewReports"\)\)/);
  });

  it("is in the nav behind the same permission", () => {
    expect(src("components/AppShell.tsx")).toMatch(
      /href: "\/discount-log",[\s\S]{0,160}needs: "viewReports"/,
    );
  });
});

describe("getting the logbook out", () => {
  const page = src("app/discount-log/page.tsx");
  const tools = src("app/discount-log/DiscountLogTools.tsx");

  it("offers both print and CSV", () => {
    expect(tools).toMatch(/window\.print\(\)/);
    // The filename arrives as a prop, so what is pinned here is the download
    // itself rather than a string that happens to sit in this file.
    expect(tools).toMatch(/a\.download = filename/);
    expect(tools).toMatch(/text\/csv;charset=utf-8/);
  });

  it("exports the columns the record is asked for", () => {
    for (const col of ["Date", "Receipt no.", "Type", "Name", "ID number", "Discount"]) {
      expect(page).toContain(`"${col}"`);
    }
  });

  it("exports the rows on screen, filtered as the reader filtered them", () => {
    expect(page).toMatch(/const csvRows = rows\.map/);
  });

  it("writes a BOM so Excel reads the peso sign", () => {
    // As an ESCAPE, never the character itself: written literally it is
    // invisible in the source and a tidy editor eats it, and nobody finds out
    // until the export opens with a column of mojibake.
    expect(tools).toMatch(/const BOM = "\\uFEFF"/);
    expect(tools).toMatch(/new Blob\(\[BOM \+ toCsv/);
  });

  it("prints a letterhead that only appears on paper", () => {
    // On screen the app shell already says whose pharmacy this is.
    expect(page).toMatch(/hidden print:mb-4 print:block/);
  });
});

describe("the purchase order as a document", () => {
  const print = src("app/purchase-orders/[id]/print/page.tsx");
  const detail = src("app/purchase-orders/[id]/page.tsx");

  it("prints on its own page, with no app shell", () => {
    // A nav bar down the side of an order faxed to a distributor is wasted
    // paper, and display:none is one stylesheet change from not working.
    expect(print).not.toMatch(/<AppShell/);
  });

  it("prints on white, not on the app's dark theme", () => {
    expect(print).toMatch(/print:bg-white/);
    expect(print).toMatch(/text-black/);
  });

  it("says so when the order has no supplier yet", () => {
    // Printing it as though it were addressed hides that it is a draft.
    expect(print).toMatch(/No supplier chosen yet — this is a draft/);
  });

  it("hides costs from somebody who may not see margin", () => {
    expect(print).toMatch(/const showCost = can\(staff\.role, "viewReports"\)/);
  });

  it("is scoped, so another pharmacy's order is simply not found", () => {
    expect(print).toMatch(/getPurchaseOrder\(staff\.pharmacyId, id\)/);
    expect(print).toMatch(/if \(!po\) notFound\(\)/);
  });

  it("only auto-prints when the button asked it to", () => {
    // A dialog that appears unbidden gets dismissed by reflex, including the
    // time it mattered.
    expect(print).toMatch(/auto === "1"/);
    expect(src("app/purchase-orders/[id]/print/PrintNow.tsx")).toMatch(/if \(!auto \|\| fired\.current\) return;/);
  });

  it("is reachable from the order, with a CSV beside it", () => {
    expect(detail).toMatch(/\/purchase-orders\/\$\{po\.id\}\/print\?auto=1/);
    expect(detail).toMatch(/<PoExport/);
  });
});

describe("the CSV both of them write", () => {
  it("quotes an item name containing a comma", () => {
    expect(csvField("Amoxicillin 500mg, 100s")).toBe('"Amoxicillin 500mg, 100s"');
  });

  it("defuses a name Excel would run as a formula", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("writes a header row", () => {
    expect(toCsv(["Date", "Discount"], [["2026-09-18", "160.00"]])).toBe(
      "Date,Discount\r\n2026-09-18,160.00",
    );
  });
});
