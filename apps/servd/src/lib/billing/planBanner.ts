import { capFor } from "./planLimits";

/**
 * Pure plan-banner state machine — no UI, no server. Feed it the restaurant's
 * plan state and it returns which banner (if any) to show. All day math is in
 * Asia/Manila so "days left" matches what a Manila-time owner sees.
 */

export type BannerPlan = "trial" | "starter" | "lite" | "growth" | "legacy" | null;

export type BannerState =
  | "hidden"
  | "trial_quiet" // start screen only
  | "trial_receipt" // ~7 days left (day 23)
  | "trial_warning" // ≤3 days
  | "trial_final" // last day
  | "downgrade_confirm" // first login after downgrade
  | "cap_normal" // <70%
  | "cap_amber" // ≥70%
  | "cap_red" // ≥90%
  | "cap_paused"; // 100%

export interface PlanBannerData {
  plan: BannerPlan; // null → graceful degradation (cap-strip-only, cap 100)
  trialEndsAt: string | null; // ISO
  ordersThisMonth: number;
  monthValue: number; // centavos of online orders this month
  cap: number | null; // null = unlimited
  orderingPaused: boolean; // cap hit → website paused
  capEnabled?: boolean; // global master switch — when false, no cap states show
  justDowngraded?: boolean; // set right after a downgrade (drives the confirm banner)
}

const MANILA = "Asia/Manila";

/** "YYYY-MM-DD" for a date in Manila. */
export function manilaYmd(d: Date): string {
  // en-CA gives ISO-ish YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Whole calendar days from `a` to `b`, counted in Manila (b − a). */
export function manilaDaysBetween(a: Date, b: Date): number {
  const ax = Date.parse(`${manilaYmd(a)}T00:00:00Z`);
  const bx = Date.parse(`${manilaYmd(b)}T00:00:00Z`);
  return Math.round((bx - ax) / 86_400_000);
}

/** Trial days remaining (Manila calendar days), or null if no trial end. */
export function trialDaysLeft(trialEndsAt: string | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  return manilaDaysBetween(now, end);
}

/**
 * The banner state for a restaurant at `now`. Surface filtering (some states
 * show on one surface only) is applied by the component, not here.
 */
export function getBannerState(data: PlanBannerData, now: Date = new Date()): BannerState {
  const plan = data.plan;

  // Grandfathered / legacy accounts never see a banner.
  if (plan === "legacy") return "hidden";

  // Master order-cap switch OFF → hide the WHOLE plan banner (trial countdown +
  // cap strips) until the platform owner turns capping on.
  if (data.capEnabled === false) return "hidden";

  // Just downgraded → reassure first (what they still have), regardless of usage.
  if (data.justDowngraded) return "downgrade_confirm";

  // Trial countdown.
  if (plan === "trial") {
    const left = trialDaysLeft(data.trialEndsAt, now);
    if (left == null) return "hidden";
    if (left > 7) return "trial_quiet";
    if (left > 3) return "trial_receipt";
    if (left > 1) return "trial_warning";
    return "trial_final"; // final day (and just-past, until a job downgrades)
  }

  // Paid & unlimited → nothing to nag about.
  if (plan === "growth") return "hidden";

  // starter / lite / (null → degrade to cap-strip using default cap 100).
  const cap = data.cap ?? capFor(plan ?? "starter");
  if (!Number.isFinite(cap)) return "hidden"; // unlimited plan, no strip
  if (data.orderingPaused || data.ordersThisMonth >= cap) return "cap_paused";
  const pct = cap > 0 ? data.ordersThisMonth / cap : 0;
  if (pct >= 0.9) return "cap_red";
  if (pct >= 0.7) return "cap_amber";
  return "cap_normal";
}

/** States that render only on the merchant start screen (not the dashboard). */
export const START_ONLY: ReadonlySet<BannerState> = new Set<BannerState>(["trial_quiet"]);

/** Non-dismissible states. */
export const NOT_DISMISSIBLE: ReadonlySet<BannerState> = new Set<BannerState>(["trial_final", "cap_paused", "cap_normal", "cap_amber", "cap_red"]);
