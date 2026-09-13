import { describe, it, expect } from "vitest";
import {
  DORMANT_DAYS,
  SEGMENT_LABEL,
  segmentOf,
  upsellsFor,
  type Segment,
  type SegmentInput,
} from "@/lib/bizops/segments";

/**
 * One restaurant belongs to exactly ONE segment, so the counts on the screen
 * add up to the customer count. Overlapping buckets look richer and then
 * quietly double-count every decision taken from them — which is why the order
 * of the checks is what most of this file is testing.
 */

const NOW = new Date("2026-08-25T12:00:00+08:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const shop = (over: Partial<SegmentInput> = {}): SegmentInput => ({
  status: "active",
  createdAt: daysAgo(90),
  ordersThisMonth: 20,
  cap: 100,
  lastOrderAt: daysAgo(1),
  ...over,
});

describe("segmentOf", () => {
  it("calls an unpaid preview a preview, however old", () => {
    expect(segmentOf(shop({ status: "preview", createdAt: daysAgo(400) }), NOW)).toBe("preview");
  });

  it("puts a shop at its cap above everything else", () => {
    // At the cap is at the cap even in its first week — that's the one
    // conversation that can't wait.
    expect(segmentOf(shop({ ordersThisMonth: 100, createdAt: daysAgo(2) }), NOW)).toBe("at_cap");
    expect(segmentOf(shop({ ordersThisMonth: 95 }), NOW)).toBe("at_cap");
  });

  it("calls a first-week shop new", () => {
    expect(segmentOf(shop({ createdAt: daysAgo(3) }), NOW)).toBe("new");
  });

  it("doesn't call a brand-new shop dormant for not having ordered yet", () => {
    // Signed up yesterday, no orders. That's normal, not a lapse.
    expect(segmentOf(shop({ createdAt: daysAgo(1), lastOrderAt: null }), NOW)).toBe("new");
  });

  it("calls an old shop with no orders dormant", () => {
    expect(segmentOf(shop({ lastOrderAt: null }), NOW)).toBe("dormant");
    expect(segmentOf(shop({ lastOrderAt: daysAgo(DORMANT_DAYS) }), NOW)).toBe("dormant");
  });

  it("leaves a shop that ordered recently alone", () => {
    expect(segmentOf(shop({ lastOrderAt: daysAgo(DORMANT_DAYS - 1) }), NOW)).not.toBe("dormant");
  });

  it("separates growing from power from quiet", () => {
    expect(segmentOf(shop({ ordersThisMonth: 10, cap: null }), NOW)).toBe("quiet");
    expect(segmentOf(shop({ ordersThisMonth: 50, cap: null }), NOW)).toBe("growing");
    expect(segmentOf(shop({ ordersThisMonth: 80, cap: null }), NOW)).toBe("power");
  });

  it("doesn't call an uncapped power shop 'at cap'", () => {
    // 4000 orders on an unlimited plan is a power user, not a ceiling.
    expect(segmentOf(shop({ ordersThisMonth: 4000, cap: null }), NOW)).toBe("power");
  });

  it("has a label for every segment it can return", () => {
    const all: Segment[] = ["new", "dormant", "quiet", "growing", "power", "at_cap", "preview"];
    for (const s of all) expect(SEGMENT_LABEL[s]).toBeTruthy();
  });
});

describe("upsellsFor", () => {
  const base = {
    band: "ok" as const,
    ordersThisMonth: 10,
    hasCustomDomain: false,
    hasInventory: false,
    menuItems: 10,
  };

  it("offers nothing to a small quiet shop", () => {
    // A shop with nothing worth offering shouldn't appear on a call list.
    expect(upsellsFor(base)).toEqual([]);
  });

  it("leads with the plan when they're at the ceiling", () => {
    const out = upsellsFor({ ...base, band: "capped", ordersThisMonth: 100 });
    expect(out[0].product).toBe("plan");
    expect(out[0].reason).toContain("turning away");
  });

  it("offers a domain only once they're busy enough to want one", () => {
    expect(upsellsFor({ ...base, ordersThisMonth: 29 }).some((u) => u.product === "custom_domain")).toBe(false);
    expect(upsellsFor({ ...base, ordersThisMonth: 30 }).some((u) => u.product === "custom_domain")).toBe(true);
  });

  it("never offers what they already own", () => {
    const out = upsellsFor({
      ...base,
      ordersThisMonth: 60,
      menuItems: 80,
      hasCustomDomain: true,
      hasInventory: true,
    });
    expect(out.some((u) => u.product === "custom_domain")).toBe(false);
    expect(out.some((u) => u.product === "inventory")).toBe(false);
  });

  it("gives a reason with every offer", () => {
    const out = upsellsFor({ ...base, band: "notify", ordersThisMonth: 85, menuItems: 50 });
    expect(out.length).toBeGreaterThan(0);
    for (const u of out) expect(u.reason.length).toBeGreaterThan(10);
  });
});
