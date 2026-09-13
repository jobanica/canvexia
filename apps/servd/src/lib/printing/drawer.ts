/**
 * When the cash drawer should pop open.
 *
 * The drawer plugs into the printer, so opening it is a print command — but
 * WHETHER to open it is a business rule, and the two shouldn't be tangled
 * together. A card or e-wallet sale puts nothing in the drawer and nothing
 * comes out of it, so kicking it every time is a security habit worth avoiding.
 * A till that hands back change for GCash disagrees, hence the choice.
 *
 * Pure so the rule is testable without a printer attached.
 */

export type DrawerPolicy = "never" | "cash" | "any";

const POLICIES: DrawerPolicy[] = ["never", "cash", "any"];

/** Read a stored setting, defaulting to cash-only for anything unrecognised. */
export function drawerPolicy(raw: string | null | undefined): DrawerPolicy {
  return POLICIES.includes(raw as DrawerPolicy) ? (raw as DrawerPolicy) : "cash";
}

/**
 * `method` is the payment method that just settled, or null when there isn't
 * one (a bill, a kitchen ticket, a reprint) — those never open the drawer, and
 * "any" doesn't mean "any document".
 */
export function shouldOpenDrawer(policy: DrawerPolicy, method: string | null | undefined): boolean {
  if (policy === "never" || !method) return false;
  // A Grab/Foodpanda ticket is closed at the counter but nothing crossed it —
  // the platform remits later. Popping the drawer on one is an open till for no
  // reason, and "any" was never meant to include money that never arrived.
  if (method === "third_party") return false;
  if (policy === "any") return true;
  return method === "cash";
}

export const DRAWER_POLICY_LABEL: Record<DrawerPolicy, string> = {
  never: "Never — I open it myself",
  cash: "On cash payments",
  any: "On every payment",
};
