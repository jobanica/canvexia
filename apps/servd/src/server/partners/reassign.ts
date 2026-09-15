import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { planReassignment } from "@/lib/partners/reassign";
import { writeHqAudit } from "@/server/audit/log";

/**
 * Move a merchant from one partner to another.
 *
 * Runs through systemDb because it is the one operation that legitimately spans
 * two partners: no partner scope can see both sides of it, and that is exactly
 * why it is an HQ action and not something a partner can do to themselves.
 *
 * The whole move is one transaction. A merchant half-reassigned — column moved,
 * audit row missing, or the reverse — is worse than one not reassigned at all,
 * because the next person to look has no way to tell which happened.
 */

export type ReassignResult =
  | { ok: true; moved: boolean; from: string | null; to: string }
  | { ok: false; error: string };

export async function reassignMerchant(input: {
  restaurantId: string;
  targetPartnerId: string;
  actorEmail: string | null;
  reason?: string | null;
}): Promise<ReassignResult> {
  const { restaurantId, targetPartnerId, actorEmail, reason } = input;

  if (!restaurantId) return { ok: false, error: "No merchant selected." };

  try {
    return await systemDb(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, name: true, partnerId: true },
      });
      if (!restaurant) return { ok: false as const, error: "That merchant no longer exists." };

      const target = await tx.partner.findUnique({
        where: { id: targetPartnerId },
        select: { id: true, name: true, status: true },
      });

      const decision = planReassignment({
        currentPartnerId: restaurant.partnerId,
        targetPartnerId,
        targetPartnerStatus: target?.status ?? null,
      });

      if (decision.action === "reject") return { ok: false as const, error: decision.error };
      if (decision.action === "noop") {
        return { ok: true as const, moved: false, from: restaurant.partnerId, to: targetPartnerId };
      }

      await tx.restaurant.update({
        where: { id: restaurantId },
        data: { partnerId: decision.to },
      });

      // ⚠️ D8 EXTENSION POINT — read this before adding orders."partnerId".
      //
      // Every denormalised copy of restaurants."partnerId" must be rewritten
      // HERE, inside this transaction. A copy left pointing at `decision.from`
      // is not a stale number on a dashboard: the policy on that table reads the
      // copy, so the previous partner keeps reading those rows after losing the
      // merchant. That is a cross-partner leak with an audit trail saying the
      // move succeeded.
      //
      // When orders."partnerId" lands in Phase 4a, it goes here:
      //     await tx.$executeRaw`update orders set "partnerId" = ${decision.to}
      //                          where "restaurantId" = ${restaurantId}`;
      // with a test asserting no row anywhere still names decision.from.

      await writeHqAudit(tx, {
        restaurantId,
        // The INCOMING partner. The outgoing one is deliberately not given a
        // copy: they have just lost access to this merchant entirely, and a row
        // naming a merchant they can no longer read is a worse answer than
        // asking HQ, who can see the whole trail.
        partnerId: decision.to,
        actorEmail,
        action: "merchant.reassigned",
        entityType: "restaurant",
        entityId: restaurantId,
        reason: reason ?? null,
        before: { partnerId: decision.from },
        after: { partnerId: decision.to },
      });

      return { ok: true as const, moved: true, from: decision.from, to: decision.to };
    });
  } catch (e) {
    console.error("reassignMerchant failed", e);
    return { ok: false, error: "Couldn't move that merchant. Nothing was changed." };
  }
}
