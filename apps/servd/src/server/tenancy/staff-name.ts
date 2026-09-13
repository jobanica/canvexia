import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * A human name for a staff member, for printed reports and floor labels.
 *
 * Falls through displayName → username → the local part of the email, because
 * a DIY account's login address is synthetic (`slug@staff.servdph.com`) and
 * printing that on a Z-report the owner signs is just noise.
 *
 * Scoped by restaurantId as well as id, so a name can never be read across
 * tenants even though this goes through systemDb.
 */
export async function staffLabel(restaurantId: string, staffUserId: string): Promise<string> {
  try {
    const s = await systemDb((tx) =>
      tx.staffUser.findFirst({
        where: { id: staffUserId, restaurantId },
        select: { displayName: true, username: true, email: true },
      }),
    );
    return s?.displayName || s?.username || s?.email?.split("@")[0] || "Cashier";
  } catch {
    return "Cashier";
  }
}
