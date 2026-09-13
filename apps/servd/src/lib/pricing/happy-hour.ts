/**
 * Happy-hour / scheduled-pricing math. Pure + tiny so the diner menu preview
 * and the server-authoritative order pricing always agree (the server is the
 * source of truth). Times are evaluated in Asia/Manila (UTC+8, no DST).
 */

export interface HappyHourRule {
  id: string;
  discountType: string; // "percent" | "amount"
  value: number; // percent (1-100) or centavos off the base price
  scope: string; // "all" | "category" | "item"
  targetIds: string[];
  days: number[]; // 0=Sun..6=Sat; empty = every day
  startMinute: number; // minutes from midnight
  endMinute: number;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Minutes-from-midnight + day-of-week (0=Sun) for `date` in Manila time. */
export function manilaClock(date: Date = new Date()): { minute: number; day: number } {
  const d = new Date(date.getTime() + MANILA_OFFSET_MS);
  return { minute: d.getUTCHours() * 60 + d.getUTCMinutes(), day: d.getUTCDay() };
}

/** Whether a rule's day + time window is active right now. */
export function isRuleActive(rule: HappyHourRule, date: Date = new Date()): boolean {
  const { minute, day } = manilaClock(date);
  if (rule.days.length > 0 && !rule.days.includes(day)) return false;
  if (rule.startMinute === rule.endMinute) return false; // empty window
  // Overnight window (e.g. 22:00–02:00) when end <= start.
  return rule.startMinute < rule.endMinute
    ? minute >= rule.startMinute && minute < rule.endMinute
    : minute >= rule.startMinute || minute < rule.endMinute;
}

/** Whether a rule targets a given item. */
export function ruleAppliesToItem(
  rule: HappyHourRule,
  item: { id: string; categoryId: string },
): boolean {
  if (rule.scope === "all") return true;
  if (rule.scope === "category") return rule.targetIds.includes(item.categoryId);
  return rule.targetIds.includes(item.id);
}

/** Centavos off a base price for one rule (capped at the base price). */
export function discountFor(rule: HappyHourRule, basePrice: number): number {
  if (rule.discountType === "amount") return Math.min(basePrice, Math.max(0, Math.round(rule.value)));
  const pct = Math.min(100, Math.max(0, Math.round(rule.value)));
  return Math.round((basePrice * pct) / 100);
}

export interface PricedItem {
  price: number; // effective (discounted) base price
  originalPrice: number; // base price before discount
  discount: number; // centavos off (0 = no active happy hour)
  ruleId: string | null;
}

/** Best active happy-hour price for an item (largest discount wins). */
export function effectivePrice(
  basePrice: number,
  item: { id: string; categoryId: string },
  rules: HappyHourRule[],
  date: Date = new Date(),
): PricedItem {
  let best = 0;
  let bestId: string | null = null;
  for (const r of rules) {
    if (!isRuleActive(r, date) || !ruleAppliesToItem(r, item)) continue;
    const d = discountFor(r, basePrice);
    if (d > best) {
      best = d;
      bestId = r.id;
    }
  }
  return { price: Math.max(0, basePrice - best), originalPrice: basePrice, discount: best, ruleId: bestId };
}

/** "07:30" ⇄ minutes helpers for the admin form. */
export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return ((h % 24) * 60 + (m % 60)) | 0;
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
