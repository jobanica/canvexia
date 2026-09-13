import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Whose gateway a settlement webhook came from.
 *
 * THE PROBLEM THIS EXISTS FOR. Every `*ByProviderRef` function settles a payment
 * by gateway reference alone — find the invoice with this reference, mark it
 * paid, grant access. That was sound while exactly one trusted account existed:
 * the reference could only have come from CANVEXIA's own gateway, so possessing
 * one was proof enough.
 *
 * Under D5 those references are minted by N partner sub-accounts. Uniqueness
 * across them is not guaranteed, and — more to the point — the trust boundary is
 * different for each. A partner who replays or guesses a reference could settle
 * ANOTHER partner's invoice: a merchant marked paid, access granted, revenue
 * recorded, all from money that never arrived in the right account.
 *
 * So a scope is now a required argument everywhere, and it is a tagged union
 * rather than an optional `partnerId`. An optional parameter is one a caller
 * forgets and the compiler forgives; this way the unscoped case has to be
 * written out, and anyone reading `PLATFORM_SCOPE` at a call site can ask why.
 */
export type SettlementScope =
  | { kind: "partner"; partnerId: string }
  | { kind: "platform" };

/**
 * CANVEXIA's own gateway. Legitimate, and narrow: only the platform webhook
 * route may use it, and only because that route authenticates against the
 * platform's own callback token — the same single trusted account the original
 * design assumed.
 */
export const PLATFORM_SCOPE: SettlementScope = { kind: "platform" };

export function partnerScope(partnerId: string): SettlementScope {
  return { kind: "partner", partnerId };
}

/**
 * Whether a settlement in this scope is allowed to touch this merchant.
 *
 * Called BEFORE any mutation, every time. Reading first and checking after is
 * fine — what matters is that nothing is written until this has answered.
 *
 * A merchant with no owner (`partnerId` null) is only reachable by the platform
 * scope. That state should not exist after the house-partner backfill, and
 * treating it as "anyone may settle it" would be the wrong way to be wrong.
 */
export async function restaurantInScope(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  scope: SettlementScope,
): Promise<boolean> {
  if (scope.kind === "platform") return true;

  try {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { partnerId: true },
    });
    return !!restaurant && restaurant.partnerId === scope.partnerId;
  } catch {
    // partnerId not migrated yet. Fail CLOSED for a partner scope: a database
    // that cannot answer "who owns this" cannot be allowed to answer "yes".
    return false;
  }
}
