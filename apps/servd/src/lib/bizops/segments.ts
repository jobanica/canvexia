import { capBand, type CapBand } from "./metrics";

/**
 * Automatic customer segments, and the upsell rules that hang off them.
 *
 * One restaurant belongs to exactly ONE segment, so the numbers on the screen
 * add up to the customer count. Overlapping buckets look richer and then
 * quietly double-count every decision made from them.
 *
 * Pure: the thresholds are the whole content of this file, so they live where
 * they can be read and changed in one place rather than being scattered across
 * three queries that drift apart.
 */

export type Segment =
  | "new" //        joined in the last 7 days
  | "dormant" //    was live, hasn't taken an order in a while
  | "quiet" //      live, ordering, but nowhere near a cap
  | "growing" //    50+ orders this month
  | "power" //      80+ — the ones to talk to about the next tier
  | "at_cap" //     hitting the ceiling
  | "preview"; //   built something, never paid

export interface SegmentInput {
  status: string;
  createdAt: string | Date;
  ordersThisMonth: number;
  /** Null = unlimited. */
  cap: number | null;
  lastOrderAt: string | Date | null;
}

/** How many days without an order before a live shop counts as dormant. */
export const DORMANT_DAYS = 21;
export const NEW_DAYS = 7;

function daysAgo(v: string | Date | null, now: Date): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/**
 * Order matters here, most-specific first.
 *
 * A shop at its cap is at its cap whether or not it joined this week, and a
 * preview is a preview however old — those two win over everything, because
 * they are the two that need a different conversation.
 */
export function segmentOf(r: SegmentInput, now: Date = new Date()): Segment {
  if (r.status === "preview") return "preview";

  const band = capBand(r.ordersThisMonth, r.cap);
  if (band === "capped" || band === "prompt") return "at_cap";

  const sinceOrder = daysAgo(r.lastOrderAt, now);
  // No order ever, or none for weeks, and not brand new — that's a shop going
  // quiet, and it's cheaper to save than to replace.
  const age = daysAgo(r.createdAt, now) ?? 0;
  if (age > NEW_DAYS && (sinceOrder == null || sinceOrder >= DORMANT_DAYS)) return "dormant";
  if (age <= NEW_DAYS) return "new";

  if (r.ordersThisMonth >= 80) return "power";
  if (r.ordersThisMonth >= 50) return "growing";
  return "quiet";
}

export const SEGMENT_LABEL: Record<Segment, string> = {
  new: "New (first week)",
  dormant: "Dormant",
  quiet: "Quiet",
  growing: "Growing (50+)",
  power: "Power (80+)",
  at_cap: "At the cap",
  preview: "Preview, never paid",
};

/** Which segments are worth someone's time today, and in what order. */
export const SEGMENT_PRIORITY: Segment[] = ["at_cap", "preview", "dormant", "power", "growing"];

export interface UpsellRule {
  product: string;
  reason: string;
}

/**
 * What to offer a given restaurant, and why.
 *
 * The reason is half the output on purpose: a list of names with no reason
 * becomes a script somebody reads out, and the reason is what makes the
 * conversation land. Empty means leave them alone — a shop with nothing worth
 * offering should not appear on a call list.
 */
export function upsellsFor(r: {
  band: CapBand;
  ordersThisMonth: number;
  hasCustomDomain: boolean;
  hasInventory: boolean;
  menuItems: number;
}): UpsellRule[] {
  const out: UpsellRule[] = [];

  if (r.band === "capped") {
    out.push({
      product: "plan",
      reason: `At the cap with ${r.ordersThisMonth} orders — they are turning away online orders right now.`,
    });
  } else if (r.band === "prompt" || r.band === "notify") {
    out.push({
      product: "plan",
      reason: `${r.ordersThisMonth} orders and climbing — they will hit the ceiling this month.`,
    });
  }

  if (!r.hasCustomDomain && r.ordersThisMonth >= 30) {
    out.push({
      product: "custom_domain",
      reason: "Busy enough that their own web address starts paying for itself.",
    });
  }

  if (!r.hasInventory && r.menuItems >= 40) {
    out.push({
      product: "inventory",
      reason: `${r.menuItems} menu items — counting stock by hand at that size is where margin leaks.`,
    });
  }

  return out;
}
