/**
 * How many table QR codes an account may create.
 *
 * Every account gets one table QR free, so a restaurant can print it, stick it
 * on a table and see the whole thing work before paying anything. Beyond that
 * it's a one-time unlock.
 *
 * THREE RULES, and the order matters:
 *
 *  1. Grandfathered accounts are unlimited. Everyone who existed before this
 *     became a paid unlock keeps what they had. Changing the terms under
 *     someone who has already printed and stuck down forty QR codes is not a
 *     thing we do, and the flag is set once by the migration for exactly those
 *     accounts.
 *  2. A settled one-time purchase is unlimited, for good — it survives a
 *     downgrade, a plan change and a lapsed subscription, because they bought
 *     it rather than rented it.
 *  3. Otherwise: one table QR.
 *
 * THE COUNTER QR IS NOT A TABLE and never counts. It's the single code a stall
 * or takeout counter puts on the wall, and Free plans are sold on being able to
 * run a business that way — gating it would break the promise rather than
 * upsell it.
 *
 * EXISTING TABLES ARE NEVER TOUCHED. The quota only ever refuses a NEW one, so
 * an account that somehow ends up over its limit keeps every code it printed
 * and simply can't add more. A QR that stops working is a customer standing at
 * a table unable to order.
 *
 * Pure so the rule can be read and tested in one place, rather than inferred
 * from an if-statement buried in a server action.
 */

/** Free table QRs per account. The counter QR is separate and always free. */
export const FREE_TABLE_QRS = 1;

/** The addon key a settled purchase is recorded under. */
export const UNLIMITED_TABLES_ADDON_KEY = "unlimitedTables";

/**
 * List price of the unlock, in centavos — the fallback shown where the live
 * price map isn't loaded (the super-admin row). Selling price is editable under
 * Super-admin → Feature pricing; this is only what a manual grant records.
 */
export const UNLIMITED_TABLES_PRICE = 50_000; // ₱500.00

export interface TableQuotaInput {
  /** Non-counter tables the account already has. */
  tableCount: number;
  /** Existed before table QRs became a paid unlock. */
  grandfathered: boolean;
  /** Bought the one-time unlock (or was granted it). */
  unlocked: boolean;
}

export interface TableQuota {
  unlimited: boolean;
  /** How many more may be created. Infinity when unlimited. */
  remaining: number;
  canCreate: boolean;
  /** Why they're allowed everything, for wording the UI honestly. */
  reason: "grandfathered" | "purchased" | "free-tier";
}

export function tableQuota({ tableCount, grandfathered, unlocked }: TableQuotaInput): TableQuota {
  if (grandfathered) {
    return { unlimited: true, remaining: Infinity, canCreate: true, reason: "grandfathered" };
  }
  if (unlocked) {
    return { unlimited: true, remaining: Infinity, canCreate: true, reason: "purchased" };
  }
  // max(0, …): an account already over the limit can't add more, but nothing
  // it already has is taken away.
  const remaining = Math.max(0, FREE_TABLE_QRS - Math.max(0, tableCount));
  return { unlimited: false, remaining, canCreate: remaining > 0, reason: "free-tier" };
}

/** The message shown when someone tries to add one too many. */
export const TABLE_LIMIT_MESSAGE =
  `Your free plan includes ${FREE_TABLE_QRS} table QR code. Unlock unlimited tables and QR codes to add more.`;
