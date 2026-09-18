import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUCKET_LABEL,
  csvField,
  daysOfSupply,
  daysUntil,
  expiryBucket,
  suggestedOrder,
  toCsv,
} from "@/lib/pharmacy/alerts";

/**
 * THE ALERTS SCREEN — low stock, expiring, dead stock, slow-moving.
 *
 * Every number here is one a pharmacist spends money on: how much to order,
 * what to take off the shelf, which capital is sitting still. All of it is
 * pinned, because the failure mode is not a crash — it is a plausible wrong
 * number that somebody orders against.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("which pile a batch belongs in", () => {
  const today = day("2026-09-18");

  it("counts a batch expiring TODAY as expired", () => {
    // It may not be dispensed tomorrow. Filing it under "≤30 days" is how it
    // stays on the shelf.
    expect(expiryBucket(day("2026-09-18"), today)).toBe("expired");
  });

  it("counts a date already past as expired", () => {
    expect(expiryBucket(day("2026-06-15"), today)).toBe("expired");
  });

  it("puts tomorrow in the thirty-day pile", () => {
    expect(expiryBucket(day("2026-09-19"), today)).toBe("d30");
  });

  it("splits at 30, 60 and 90 days exactly", () => {
    expect(expiryBucket(day("2026-10-18"), today)).toBe("d30"); // 30
    expect(expiryBucket(day("2026-10-19"), today)).toBe("d60"); // 31
    expect(expiryBucket(day("2026-11-17"), today)).toBe("d60"); // 60
    expect(expiryBucket(day("2026-11-18"), today)).toBe("d90"); // 61
    expect(expiryBucket(day("2026-12-17"), today)).toBe("d90"); // 90
    expect(expiryBucket(day("2026-12-18"), today)).toBe("later"); // 91
  });

  it("counts whole days, not hours", () => {
    // A batch expiring at midnight tonight and one expiring at 11pm are the
    // same day's problem.
    expect(daysUntil(new Date("2026-09-19T23:00:00Z"), new Date("2026-09-18T01:00:00Z"))).toBe(1);
  });

  it("labels every bucket", () => {
    expect(BUCKET_LABEL.expired).toBe("Expired");
    expect(BUCKET_LABEL.d30).toBe("≤30 days");
  });
});

describe("how much to order", () => {
  it("orders the gap back to the reorder point", () => {
    expect(suggestedOrder(13, 100)).toBe(87);
  });

  it("never suggests a negative order", () => {
    expect(suggestedOrder(200, 100)).toBe(0);
  });

  it("never suggests zero for something that has run out", () => {
    // A product at zero with no reorder point set still needs ordering, and
    // "0" is the one suggestion nobody can act on.
    expect(suggestedOrder(0, 0)).toBe(1);
    expect(suggestedOrder(0, 100)).toBe(100);
  });

  it("treats sitting exactly on the reorder point as needing stock", () => {
    // That is the moment the reorder point was set to catch.
    expect(suggestedOrder(100, 100)).toBe(0);
    expect(suggestedOrder(99, 100)).toBe(1);
  });
});

describe("days of supply", () => {
  it("divides the shelf by the rate it has been selling", () => {
    // 90 sold in 90 days is one a day; 180 on hand is 180 days.
    expect(daysOfSupply(180, 90, 90)).toBe(180);
  });

  it("returns null for something that did not sell at all", () => {
    // NOT Infinity and not a huge number: "never sold" is a different fact
    // from "will last 9,999 days", and showing the second is how a pharmacist
    // concludes the maths is broken.
    expect(daysOfSupply(500, 0, 90)).toBeNull();
  });

  it("is zero when the shelf is empty", () => {
    expect(daysOfSupply(0, 30, 90)).toBe(0);
  });

  it("gets very large for something barely moving, without breaking", () => {
    // 1 sold in 90 days against 62 on hand — the real row that prompted this.
    expect(daysOfSupply(62, 1, 90)).toBe(5580);
  });
});

describe("the CSV people open in Excel", () => {
  it("quotes a product name containing a comma", () => {
    // Otherwise every column after it shifts, and nobody notices until they
    // have ordered against it.
    expect(csvField("Amoxicillin 500mg, 100s")).toBe('"Amoxicillin 500mg, 100s"');
  });

  it("doubles an embedded quote", () => {
    expect(csvField('Biogesic "forte"')).toBe('"Biogesic ""forte"""');
  });

  it("defuses a cell Excel would run as a formula", () => {
    // Standard CSV injection, and nothing in a stock list is a formula.
    expect(csvField("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
    expect(csvField("+44 917")).toBe("'+44 917");
    expect(csvField("-50")).toBe("'-50");
    expect(csvField("@name")).toBe("'@name");
  });

  it("leaves an ordinary value alone", () => {
    expect(csvField("Biogesic 500mg")).toBe("Biogesic 500mg");
    expect(csvField(87)).toBe("87");
    expect(csvField(null)).toBe("");
  });

  it("writes a header and CRLF line endings", () => {
    expect(toCsv(["Product", "Qty"], [["Biogesic", 3]])).toBe("Product,Qty\r\nBiogesic,3");
  });
});

describe("what the four tabs are built from", () => {
  const server = src("server/pharmacy/alerts.ts");

  it("excludes expired batches from on-hand everywhere", () => {
    // Counting them tells a pharmacist they have 200 they may not dispense,
    // and the reorder that did not happen is the one that empties the shelf.
    expect(server).toMatch(/expiryBucket\(b\.expiryDate, asOf\) !== "expired"/);
  });

  it("never lists the same product as both dead and slow-moving", () => {
    // It is the same money, and counting it twice overstates what is stuck.
    expect(server).toMatch(/continue; \/\/ dead already/);
  });

  it("values stock at what was paid for it, not at its price", () => {
    expect(server).toMatch(/b\.quantity \* b\.costCentavos/);
  });

  it("reads all four reports from one pass over the shelf", () => {
    expect(server).toMatch(/ONE QUERY FOR ALL FOUR REPORTS/);
  });

  it("sorts every list worst-first", () => {
    expect(server).toMatch(/low\.sort/);
    expect(server).toMatch(/expiring\.sort/);
    expect(server).toMatch(/dead\.sort\(\(a, b\) => b\.valueCentavos - a\.valueCentavos\)/);
  });
});

describe("the alerts screen", () => {
  const page = src("app/alerts/page.tsx");
  const client = src("app/alerts/AlertsClient.tsx");

  it("keeps the tab in the URL, so it can be sent to whoever orders", () => {
    expect(page).toMatch(/searchParams/);
    expect(page).toMatch(/href=\{`\/alerts\?tab=\$\{t\}`\}/);
  });

  it("falls back to a real tab when the URL names one that does not exist", () => {
    expect(page).toMatch(/TABS as readonly string\[\]\)\.includes/);
  });

  it("gates money but not dates or counts", () => {
    // A cashier who can see the Amoxicillin expired last week does not sell it.
    expect(page).toMatch(/const showMoney = can\(staff\.role, "viewReports"\)/);
    expect(page).not.toMatch(/if \(!can\(staff\.role, "viewReports"\)\) redirect/);
  });

  it("asks before writing off, because it cannot be undone from here", () => {
    expect(client).toMatch(/window\.confirm\(/);
    expect(client).toMatch(/cannot be undone here/);
  });

  it("exports the rows on screen rather than re-querying", () => {
    // A second query can disagree with the table above it, and somebody orders
    // from the file.
    expect(client).toMatch(/EXPORT WHAT IS ON SCREEN/);
  });

  it("writes a BOM so Excel reads the peso sign", () => {
    // As an ESCAPE, not the character. Written literally it is invisible in the
    // source and a tidy editor eats it, and nobody finds out until the export
    // opens with a column of mojibake.
    expect(client).toMatch(/const BOM = "\\uFEFF"/);
    expect(client).toMatch(/new Blob\(\[BOM \+ toCsv/);
  });

  it("sends Create PO into the existing purchase-order form", () => {
    // A second way to raise a PO is a second place for the numbering and the
    // supplier rules to drift.
    expect(page).toMatch(/\/purchase-orders\/new\?prefill=low/);
  });
});
