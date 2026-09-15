import { describe, it, expect } from "vitest";
import { SettingsInput, VatRate } from "@/lib/pharmacy/settings-input";

function form(over: Record<string, string> = {}) {
  return {
    displayName: "",
    address: "",
    phone: "",
    email: "",
    tin: "",
    fdaLtoNumber: "",
    prcLicenseNo: "",
    vatRatePct: "12",
    ...over,
  };
}

describe("the licence fields save blank", () => {
  it("accepts a form with every optional field empty", () => {
    // A pharmacy still chasing its FDA LTO has to be able to record its
    // address today. The receipt says NOT AN OFFICIAL RECEIPT until the
    // numbers arrive; the form does not need to say it a second time.
    const r = SettingsInput.safeParse(form());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      tin: null,
      address: null,
      fdaLtoNumber: null,
      prcLicenseNo: null,
    });
  });

  it("stores an empty box as null, never as an empty string", () => {
    // receiptGaps treats whitespace as missing, which only works if "" never
    // reaches the column.
    const r = SettingsInput.parse(form({ tin: "   ", fdaLtoNumber: "" }));
    expect(r.tin).toBeNull();
    expect(r.fdaLtoNumber).toBeNull();
  });

  it("still trims and keeps a real value", () => {
    const r = SettingsInput.parse(form({ tin: "  123-456-789-00000  " }));
    expect(r.tin).toBe("123-456-789-00000");
  });

  it("rejects an absurdly long value rather than truncating it", () => {
    expect(SettingsInput.safeParse(form({ tin: "x".repeat(41) })).success).toBe(false);
  });
});

describe("the VAT rate is the one blank that cannot be allowed", () => {
  it("REFUSES an empty rate instead of reading it as zero", () => {
    // z.coerce.number() parses "" as 0, and an HTML form submits an empty text
    // box as "" rather than omitting it. Coercing would turn "I left it alone"
    // into "not VAT-registered" — dropping the VAT box off every future
    // receipt and changing the SC/PWD arithmetic (D33).
    const r = VatRate.safeParse("");
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0].message).toMatch(/enter the vat rate/i);
  });

  it("refuses whitespace for the same reason", () => {
    expect(VatRate.safeParse("   ").success).toBe(false);
  });

  it("accepts 0 when it is typed on purpose", () => {
    // 0 is legitimate — it is how a non-VAT-registered pharmacy is recorded.
    // The objection is to arriving at 0 by leaving the box alone.
    expect(VatRate.parse("0")).toBe(0);
  });

  it("accepts the Philippine rate", () => {
    expect(VatRate.parse("12")).toBe(12);
    expect(VatRate.parse(" 12 ")).toBe(12);
  });

  it("refuses a rate no tax authority has ever charged", () => {
    expect(VatRate.safeParse("900").success).toBe(false);
    expect(VatRate.safeParse("-1").success).toBe(false);
  });

  it("refuses a fractional rate", () => {
    expect(VatRate.safeParse("12.5").success).toBe(false);
  });

  it("carries the refusal through the whole form", () => {
    const r = SettingsInput.safeParse(form({ vatRatePct: "" }));
    expect(r.success).toBe(false);
  });
});
