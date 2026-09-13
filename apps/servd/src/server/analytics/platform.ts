import { systemDb } from "@/server/tenancy/scoped-db";

/** Platform-wide metrics for the super-admin (cross-tenant, systemDb). */
export async function getPlatformMetrics() {
  return systemDb(async (tx) => {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [activeRestaurants, orders30, smsUsed] = await Promise.all([
      tx.restaurant.count({ where: { status: "active" } }),
      tx.order.count({ where: { createdAt: { gte: since } } }),
      tx.smsCreditLedger.aggregate({ _sum: { change: true }, where: { change: { lt: 0 } } }),
    ]);

    return {
      activeRestaurants,
      orders30,
      smsCreditsUsed: Math.abs(smsUsed._sum.change ?? 0),
    };
  });
}
