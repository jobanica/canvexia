import { describe, it, expect } from "vitest";
import { ReceiptExtraction, parseDataUrl, receiptScanEnabled } from "@/server/pharmacy/receipt-scan";

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
