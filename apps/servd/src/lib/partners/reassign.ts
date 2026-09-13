/**
 * Whether a merchant may be moved to another partner, decided without a database.
 *
 * Territory is licensed, not owned: a partner who stops supporting their city
 * has to be replaceable without the merchants they signed being stranded, and
 * merchant data stays on CANVEXIA infrastructure precisely so that this is a
 * column change rather than a migration. This file is the rule for when that
 * column change is allowed.
 *
 * Kept pure so the rules are testable offline, and so the DB action in
 * server/partners/reassign.ts is only ever "do what this decided".
 *
 * ⚠️ D8. A future `orders."partnerId"` (scheduled Phase 4a, when the statement
 * job needs it) is a COPY of `restaurants."partnerId"`. The moment that column
 * exists, every "move" decision here has to rewrite it too, or a reassigned
 * merchant's orders keep pointing at the previous partner — and because the
 * policy on `orders` would then read that copy, the previous partner keeps
 * reading them. That is a cross-partner leak, not a stale dashboard. The
 * extension point is documented in server/partners/reassign.ts; this comment is
 * here because that is the file someone reads when they add the column.
 */

/** Merchants can only be moved to a partner in this state. */
export const REASSIGNABLE_TO_STATUS = "approved";

export type ReassignDecision =
  | { action: "noop"; reason: string }
  | { action: "move"; from: string | null; to: string }
  | { action: "reject"; error: string };

export function planReassignment(input: {
  currentPartnerId: string | null;
  targetPartnerId: string;
  /** The target's status, or null if no such partner exists. */
  targetPartnerStatus: string | null;
}): ReassignDecision {
  const { currentPartnerId, targetPartnerId, targetPartnerStatus } = input;

  if (!targetPartnerId) {
    return { action: "reject", error: "Choose a partner to move this merchant to." };
  }

  if (targetPartnerStatus === null) {
    return { action: "reject", error: "That partner no longer exists." };
  }

  if (targetPartnerStatus !== REASSIGNABLE_TO_STATUS) {
    // Moving a merchant onto a suspended partner would hand it to someone who
    // cannot sign in to support it, and the merchant would be the one to find
    // out. Approve the partner first, deliberately.
    return {
      action: "reject",
      error: `That partner is ${targetPartnerStatus}, not approved. Approve them first.`,
    };
  }

  if (currentPartnerId === targetPartnerId) {
    // Not an error. Double-submits and a re-run of a bulk move both land here,
    // and both should be quietly fine rather than noisy.
    return { action: "noop", reason: "Already belongs to that partner." };
  }

  return { action: "move", from: currentPartnerId, to: targetPartnerId };
}
