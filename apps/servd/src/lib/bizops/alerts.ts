/**
 * The things worth interrupting somebody for.
 *
 * Computed from data already on the page, not a background system — the brief
 * is explicit about that, and it is the right call: an alert engine that runs
 * on a schedule needs its own storage, its own dedupe, and its own "why did
 * this fire" debugging, for a business where the founder opens the dashboard
 * every morning anyway.
 *
 * Pure, so the thresholds are readable in one place and the wording is testable
 * without a database.
 */

export type AlertLevel = "urgent" | "attention" | "good";

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
  href?: string;
}

export interface AlertInput {
  /** Chases due or never sent. */
  followUpsDue: number;
  /** Of those, ones nobody has ever chased. */
  neverChased: number;
  /** Restaurants at or past their cap right now. */
  atCap: number;
  /** Restaurants 80–99% of the way there. */
  nearCap: number;
  /** Unpaid previews with a menu built — warm leads sitting still. */
  warmPreviews: number;
  /** Live shops that have gone quiet. */
  dormant: number;
  /** Activations in the window. */
  activations: number;
  /** Whether ad spend has been entered for the window. */
  hasAdSpend: boolean;
}

/**
 * Ordered by what costs the most to ignore.
 *
 * A shop at its cap is turning away orders right now, so it outranks a lead
 * that has been waiting a fortnight — the lead is a maybe, the cap is a
 * customer actively losing money while paying you.
 */
export function buildAlerts(i: AlertInput): Alert[] {
  const out: Alert[] = [];

  if (i.atCap > 0) {
    out.push({
      level: "urgent",
      title: `${i.atCap} restaurant${i.atCap === 1 ? " is" : "s are"} at the order cap`,
      detail:
        "They are turning away online orders right now. This is the most expensive thing on the list to leave alone.",
      href: "/super-admin/bizops/usage",
    });
  }

  if (i.neverChased > 0) {
    out.push({
      level: "urgent",
      title: `${i.neverChased} lead${i.neverChased === 1 ? " has" : "s have"} never been followed up`,
      detail: "They built something and nobody has messaged them once.",
      href: "/super-admin/bizops/follow-ups",
    });
  }

  if (i.followUpsDue > i.neverChased) {
    const due = i.followUpsDue - i.neverChased;
    out.push({
      level: "attention",
      title: `${due} follow-up${due === 1 ? "" : "s"} due`,
      detail: "Already in a sequence and waiting on the next message.",
      href: "/super-admin/bizops/follow-ups",
    });
  }

  if (i.nearCap > 0) {
    out.push({
      level: "attention",
      title: `${i.nearCap} approaching the cap`,
      detail: "Past 80% with the month still running — worth the conversation before they hit it.",
      href: "/super-admin/bizops/usage",
    });
  }

  if (i.dormant > 0) {
    out.push({
      level: "attention",
      title: `${i.dormant} gone quiet`,
      detail: "Live accounts with no orders for weeks. Cheaper to save than to replace.",
      href: "/super-admin/bizops/usage",
    });
  }

  if (!i.hasAdSpend) {
    out.push({
      level: "attention",
      title: "No ad spend entered",
      detail: "Cost per lead and CAC stay blank until there's a number to divide by.",
      href: "/super-admin/bizops/analytics",
    });
  }

  if (out.length === 0) {
    out.push({
      level: "good",
      title: "Nothing needs you right now",
      detail:
        i.activations > 0
          ? `${i.activations} activation${i.activations === 1 ? "" : "s"} in this window, nobody waiting on a reply.`
          : "No overdue follow-ups, nobody at a cap.",
    });
  }

  return out;
}
