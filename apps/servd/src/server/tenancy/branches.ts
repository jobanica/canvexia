import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The restaurants one login can work in.
 *
 * A branch is a complete, separate restaurant — its own menu, orders, staff,
 * takings and paid unlocks. Nothing is pooled. What makes several of them "one
 * account" is only that the same person is staff at each, which is why this
 * reads from staff_users rather than from any group or parent record.
 *
 * Deliberately no shared entitlements: an unlock bought for one shop applies to
 * that shop. Two branches are two businesses that happen to share an owner, and
 * pretending otherwise would let one ₱1,500 purchase cover ten kitchens.
 */

export interface BranchRow {
  restaurantId: string;
  name: string;
  slug: string;
  status: string;
  /** True for the one the dashboard is currently showing. */
  active: boolean;
}

export async function listBranches(
  authUserId: string,
  activeRestaurantId: string,
): Promise<BranchRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.staffUser.findMany({
        where: { authUserId },
        orderBy: { createdAt: "asc" },
        select: {
          restaurantId: true,
          restaurant: { select: { name: true, displayName: true, slug: true, status: true } },
        },
      }),
    );
    return rows.map((r) => ({
      restaurantId: r.restaurantId,
      name: r.restaurant.displayName || r.restaurant.name,
      slug: r.restaurant.slug,
      status: r.restaurant.status,
      active: r.restaurantId === activeRestaurantId,
    }));
  } catch {
    // Before add-multi-branch.sql the query still works — this catch is for a
    // database that's behind in some other way. One branch is the safe answer:
    // the dashboard then hides the switcher and behaves exactly as it always did.
    return [];
  }
}

/** Is this login actually staff at that restaurant? Never trust the client. */
export async function isMemberOf(authUserId: string, restaurantId: string): Promise<boolean> {
  try {
    const hit = await systemDb((tx) =>
      tx.staffUser.findFirst({ where: { authUserId, restaurantId }, select: { id: true } }),
    );
    return !!hit;
  } catch {
    return false;
  }
}

/**
 * May this login switch INTO that branch?
 *
 * Membership isn't enough — the branch also has to be activated. An
 * unactivated branch has no online ordering and nothing to run, so switching
 * into it drops the owner in a dashboard that can't do anything and looks
 * broken. They activate it from the branches list, then go in.
 *
 * Checked on the server, not just hidden in the UI: the branch id comes from a
 * form post, and a hidden button stops nobody.
 */
export async function canEnterBranch(
  authUserId: string,
  restaurantId: string,
): Promise<boolean> {
  try {
    const hit = await systemDb((tx) =>
      tx.staffUser.findFirst({
        where: { authUserId, restaurantId, restaurant: { status: "active" } },
        select: { id: true },
      }),
    );
    return !!hit;
  } catch {
    return false;
  }
}
