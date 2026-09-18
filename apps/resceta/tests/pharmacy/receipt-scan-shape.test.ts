import { describe, it, expect } from "vitest";
import { ReceiptExtraction, parseDataUrl, receiptScanEnabled } from "@/server/pharmacy/receipt-scan";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

describe("the scanner's contract with the model", () => {
  it("accepts the shape the JSON schema asks for", () => {
    const reply = JSON.stringify({
      supplierName: "Zuellig Pharma",
      lines: [
        {
          productName: "Biogesic 500mg",
          genericName: "Paracetamol",
          quantity: 100,
          unitCostCentavos: 500,
          expiryDate: "2028-01-31",
          lotNumber: "LOT-A",
        },
        {
          productName: "Amoxicillin 500mg",
          genericName: null,
          quantity: 0,
          unitCostCentavos: 0,
          expiryDate: null,
          lotNumber: null,
        },
      ],
    });
    const parsed = ReceiptExtraction.safeParse(JSON.parse(reply));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.lines[0]!.unitCostCentavos).toBe(500);
    expect(parsed.data.lines[1]!.expiryDate).toBeNull();
  });

  it("rejects a reply missing a field rather than letting undefined through", () => {
    const bad = { supplierName: null, lines: [{ productName: "X" }] };
    expect(ReceiptExtraction.safeParse(bad).success).toBe(false);
  });

  it("reads a data URL and refuses anything else", () => {
    expect(parseDataUrl("data:image/jpeg;base64,AAAA")).toEqual({
      mediaType: "image/jpeg",
      data: "AAAA",
    });
    expect(parseDataUrl("https://example.test/a.jpg")).toBeNull();
    expect(parseDataUrl("data:application/pdf;base64,AAAA")).toBeNull();
  });

  it("flips with the key", () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(receiptScanEnabled()).toBe(false);
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(receiptScanEnabled()).toBe(true);
    if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = before;
  });
});

describe("the JSON schema actually sent to the model", () => {
  /**
   * REPORTED — "i tried to read the receipt in receive stock, its not
   * working."
   *
   * There were TWO schemas: the zod object, and a JSON Schema written out by
   * hand beside it. The hand-written one spelled a nullable field
   * `type: ["string", "null"]`. Structured outputs take a restricted subset of
   * JSON Schema in which a nullable is an `anyOf` — so the API rejected the
   * request before it ever looked at the photo.
   *
   * These assert against the schema the SDK GENERATES from the zod object, so
   * the thing being tested is the thing going on the wire.
   */
  const format = zodOutputFormat(ReceiptExtraction) as unknown as {
    type: string;
    schema: Record<string, any>;
  };

  it("is a json_schema format", () => {
    expect(format.type).toBe("json_schema");
  });

  it("spells a nullable as anyOf, never as a type array", () => {
    const supplier = format.schema.properties.supplierName;
    expect(supplier.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
    // The exact spelling that was rejected.
    expect(Array.isArray(supplier.type)).toBe(false);
  });

  it("spells every nullable line field the same way", () => {
    const line = format.schema.properties.lines.items.properties;
    for (const field of ["genericName", "expiryDate", "lotNumber"]) {
      expect(Array.isArray(line[field].type)).toBe(false);
      expect(line[field].anyOf).toBeDefined();
    }
  });

  it("carries no hand-written JSON schema alongside it any more", async () => {
    // One shape. Two copies is how they drift apart, and the drift is what
    // broke this.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/server/pharmacy/receipt-scan.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/const SCHEMA =/);
    expect(src).toMatch(/format: zodOutputFormat\(ReceiptExtraction\)/);
  });

  it("asks for the fields the receiving form needs", () => {
    const line = format.schema.properties.lines.items;
    expect(line.required).toEqual(
      expect.arrayContaining([
        "productName",
        "quantity",
        "unitCostCentavos",
        "expiryDate",
        "lotNumber",
      ]),
    );
  });
});

describe("what the scanner says when it fails", () => {
  const src = () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    return readFileSync(join(process.cwd(), "src/server/pharmacy/receipt-scan.ts"), "utf8");
  };

  it("no longer answers every failure with one sentence", () => {
    // A rejected request, an expired key and a dead connection read
    // identically before — so the one fault that was really here could not be
    // told apart from a bad photo.
    const s = src();
    expect(s).toMatch(/BadRequestError/);
    expect(s).toMatch(/APIConnectionError/);
    expect(s).toMatch(/Scanning failed \(\$\{e\.status\}\)/);
  });

  it("says plainly when the key is the problem", () => {
    expect(src()).toMatch(/The Anthropic API key is missing or not valid/);
  });
});
