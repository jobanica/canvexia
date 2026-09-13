import { describe, it, expect } from "vitest";
import { dinerOrderUrl, qrSvg } from "@/lib/qr";

describe("qr", () => {
  it("builds the diner order URL from slug + token", () => {
    const url = dinerOrderUrl("mango-grill", "abc123");
    expect(url).toMatch(/\/order\/mango-grill\/abc123$/);
  });

  it("does not produce a double slash when APP_URL has a trailing slash", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://servd.app/";
    expect(dinerOrderUrl("x", "y")).toBe("https://servd.app/order/x/y");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("renders an SVG QR code", async () => {
    const svg = await qrSvg("https://example.com");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
