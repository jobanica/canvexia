import { describe, it, expect } from "vitest";
import { matchesSegment, type Segment } from "@/server/hq/announcements";

/**
 * Who sees an announcement.
 *
 * Worth testing without a database because the failure modes are both silent
 * and both bad: a segment that matches nobody means an incident notice goes
 * nowhere, and a segment that matches everybody means a message meant for one
 * tier reaches partners it was not written for.
 */
const partner = (over: Partial<Parameters<typeof matchesSegment>[0]> = {}) => ({
  tier: "operator",
  status: "approved",
  enabledProducts: null as string[] | null,
  ...over,
});

describe("segment matching", () => {
  it("sends to everybody when there is no segment", () => {
    expect(matchesSegment(partner(), null)).toBe(true);
  });

  it("treats an empty segment as everybody, not nobody", () => {
    // A UI with no checkboxes ticked reads as "no filter on this axis". The
    // other reading turns a send-to-all into a send-to-nobody, silently.
    expect(matchesSegment(partner(), {})).toBe(true);
    expect(matchesSegment(partner(), { tier: [], status: [] })).toBe(true);
  });

  it("filters by tier", () => {
    const seg: Segment = { tier: ["operator"] };
    expect(matchesSegment(partner({ tier: "operator" }), seg)).toBe(true);
    expect(matchesSegment(partner({ tier: "reseller" }), seg)).toBe(false);
  });

  it("filters by status", () => {
    const seg: Segment = { status: ["suspended"] };
    expect(matchesSegment(partner({ status: "suspended" }), seg)).toBe(true);
    expect(matchesSegment(partner({ status: "approved" }), seg)).toBe(false);
  });

  it("ANDs the axes together", () => {
    // Not OR. "Operators who are suspended" is one group; the union of the two
    // is a much larger and quite different one.
    const seg: Segment = { tier: ["operator"], status: ["suspended"] };
    expect(matchesSegment(partner({ tier: "operator", status: "suspended" }), seg)).toBe(true);
    expect(matchesSegment(partner({ tier: "operator", status: "approved" }), seg)).toBe(false);
    expect(matchesSegment(partner({ tier: "reseller", status: "suspended" }), seg)).toBe(false);
  });

  it("includes a partner with NULL enabledProducts in a product segment", () => {
    // NULL means "every live product", which is what every existing partner
    // has. Reading it as "no products" would exclude everybody from a
    // product-targeted announcement — on this database, all of them.
    const seg: Segment = { productId: ["pharmacy"] };
    expect(matchesSegment(partner({ enabledProducts: null }), seg)).toBe(true);
  });

  it("filters a partner who has an explicit product list", () => {
    const seg: Segment = { productId: ["pharmacy"] };
    expect(matchesSegment(partner({ enabledProducts: ["pharmacy"] }), seg)).toBe(true);
    expect(matchesSegment(partner({ enabledProducts: ["servd"] }), seg)).toBe(false);
    expect(matchesSegment(partner({ enabledProducts: ["servd", "pharmacy"] }), seg)).toBe(true);
  });

  it("matches on ANY of the listed products, not all of them", () => {
    const seg: Segment = { productId: ["servd", "pharmacy"] };
    expect(matchesSegment(partner({ enabledProducts: ["servd"] }), seg)).toBe(true);
  });

  it("excludes a partner with an explicitly empty product list", () => {
    // Distinct from NULL, and the distinction is load-bearing: somebody was
    // deliberately switched off everything.
    expect(matchesSegment(partner({ enabledProducts: [] }), { productId: ["servd"] })).toBe(false);
  });
});
