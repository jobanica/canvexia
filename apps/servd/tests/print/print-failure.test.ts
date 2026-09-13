import { describe, it, expect } from "vitest";
import { printFailureMessage } from "@/lib/print/print-failure";

/**
 * The reported bug: a shop set to "Print kitchen tickets" pressed Send to
 * kitchen and nothing came out — and nothing on screen said so, because every
 * browser-side print sat inside an empty catch marked "non-blocking".
 *
 * Non-blocking has to mean "doesn't stop the order", not "doesn't tell anyone".
 */

describe("printFailureMessage", () => {
  it("names the document that failed", () => {
    expect(printFailureMessage("kitchen", new Error("boom"))).toContain("kitchen ticket");
    expect(printFailureMessage("receipt", new Error("boom"))).toContain("receipt");
    expect(printFailureMessage("bill", new Error("boom"))).toContain("bill");
  });

  it("stays quiet when the cashier cancelled the printer chooser", () => {
    // They pressed Cancel one second ago. Telling them they cancelled is noise.
    expect(printFailureMessage("kitchen", new Error("User cancelled the requestDevice() chooser."))).toBeNull();
  });

  it("explains an in-app browser rather than repeating the browser's wording", () => {
    const msg = printFailureMessage(
      "kitchen",
      new Error("Web Bluetooth API globally disabled"),
      "Mozilla/5.0 (iPhone) FBAN/FBIOS",
    );
    expect(msg).toContain("Facebook");
    expect(msg).not.toContain("globally disabled");
  });

  it("gives Chrome-specific advice when the browser disabled Bluetooth", () => {
    const msg = printFailureMessage("kitchen", new Error("Web Bluetooth API globally disabled"), "Chrome/120");
    expect(msg).toContain("chrome://flags");
  });

  it("survives a thrown non-Error", () => {
    expect(printFailureMessage("kitchen", "something odd")).toContain("kitchen ticket");
    expect(printFailureMessage("kitchen", null)).toContain("kitchen ticket");
    expect(printFailureMessage("kitchen", undefined)).toContain("kitchen ticket");
  });
});
