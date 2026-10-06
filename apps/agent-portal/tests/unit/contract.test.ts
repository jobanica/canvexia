import { describe, it, expect } from "vitest";
import {
  createSigningToken,
  minimumTermEnd,
  renderTemplate,
  signatureBytes,
  verifySigningToken,
  LINK_TTL_MS,
} from "@/lib/contract";

const SECRET = "x".repeat(40);
const now = new Date("2026-10-06T00:00:00Z");

describe("contract templates", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    const vars = {
      business_name: "Mango Grill", owner_name: "Ana", product_name: "Servd", plan: "Standard",
      activation_fee: "₱500.00", monthly_fee: "₱800.00", minimum_term_months: "3", date: "06 Oct 2026",
    };
    expect(renderTemplate("{{business_name}} pays {{ monthly_fee }} for {{minimum_term_months}} months. {{typo}}", vars))
      .toBe("Mango Grill pays ₱800.00 for 3 months. {{typo}}");
  });

  it("ends the minimum term N calendar months after signing", () => {
    expect(minimumTermEnd(now, 3).toISOString()).toBe("2027-01-06T00:00:00.000Z");
  });
});

describe("signing links", () => {
  it("round-trips and names the customer", () => {
    const { token, expiresAt } = createSigningToken("ref-1", SECRET, now);
    expect(expiresAt.getTime() - now.getTime()).toBe(LINK_TTL_MS);
    expect(verifySigningToken(token, SECRET, now)).toEqual({ ok: true, referralId: "ref-1" });
  });

  it("expires", () => {
    const { token } = createSigningToken("ref-1", SECRET, now);
    expect(verifySigningToken(token, SECRET, new Date(now.getTime() + LINK_TTL_MS + 1))).toEqual({ ok: false, reason: "expired" });
  });

  it("cannot be edited to name another customer, or verified with another secret", () => {
    const { token } = createSigningToken("ref-1", SECRET, now);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ r: "ref-2", e: now.getTime() + 1e9 })).toString("base64url");
    expect(verifySigningToken(`${forged}.${sig}`, SECRET, now)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySigningToken(token, "y".repeat(40), now)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySigningToken("garbage", SECRET, now)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("signature images", () => {
  it("accepts a PNG data URL and refuses anything else", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
    expect(signatureBytes(`data:image/png;base64,${png.toString("base64")}`)?.length).toBe(208);
    expect(signatureBytes("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(signatureBytes("data:image/png;base64,AAAA")).toBeNull(); // too small to be a drawing
  });
});
