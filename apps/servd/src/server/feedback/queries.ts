import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";

/** Feedback inbox for the owner: every rating + comment, newest first. */
export async function getFeedbackList(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        order: {
          select: { id: true, table: { select: { tableNumber: true } } },
        },
      },
    }),
  );
}

/**
 * Public rating summary for the diner storefront (no session). Runs in the
 * system context and returns just the average + count — safe to expose.
 * Best-effort: any error → null so the storefront simply omits the stars.
 */
export async function getPublicRatingStats(
  restaurantId: string,
): Promise<{ count: number; average: number | null } | null> {
  try {
    const agg = await systemDb((tx) =>
      tx.feedback.aggregate({ where: { restaurantId }, _avg: { rating: true }, _count: true }),
    );
    return {
      count: agg._count,
      average: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
    };
  } catch {
    return null;
  }
}

/** Simple aggregate stats for the inbox header. */
export async function getFeedbackStats(restaurantId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const agg = await tx.feedback.aggregate({
      _avg: { rating: true },
      _count: true,
    });
    return {
      count: agg._count,
      average: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
    };
  });
}
