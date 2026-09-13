import { Prisma } from "@prisma/client";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Per-restaurant analytics. Everything runs inside ONE tenantDb transaction, so
 * RLS scopes it to the restaurant (defense in depth) and the raw time-bucket
 * queries share the same scope.
 *
 * REVENUE MEANS MONEY TAKEN: the sum of settled payments, timestamped when the
 * payment happened, bucketed in Manila. That is deliberately the same
 * definition the accounting report and the end-of-shift Z-report use — three
 * screens showing three different "total sales" for the same day is worse than
 * any one of them being slightly off, because it makes all three untrustworthy.
 */

export interface AnalyticsBundle {
  summary: {
    revenue: number;
    /** Orders that were PAID in the window — the figure revenue is built from. */
    orders: number;
    /**
     * Orders PLACED in the window, settled or not (cancelled ones excluded).
     *
     * Revenue counts money taken, which is right, but it means an order taken
     * and not yet settled contributes nothing — so a dashboard reading
     * "Orders today: 0" next to an order plainly sitting in the history looks
     * broken when it's just unpaid. This is the number that says so.
     */
    placedOrders: number;
    aov: number;
    avgRating: number | null;
    ratingCount: number;
  };
  revenueByDay: { day: string; revenue: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  worstItems: { name: string; qty: number; revenue: number }[];
  paymentMix: { method: string; count: number; amount: number }[];
  peakHours: { hour: number; orders: number }[];
  ratingTrend: { day: string; avg: number; count: number }[];
}

export async function getAnalytics(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<AnalyticsBundle> {
  return tenantDb(restaurantId, async (tx) => {
    // Revenue is MONEY TAKEN — the sum of settled payments — not the sum of
    // order totals. The two disagree in two ways that made this figure argue
    // with the accounting report and the shift summary:
    //
    //   - order.total is the gross before any discount or store credit, so a
    //     senior discount showed up as revenue nobody received.
    //   - an order created at 11:50 PM and paid at 12:10 AM belongs to the day
    //     it was paid, not the day the ticket was opened.
    //
    // Payments are the same source accounting and the Z-report already use, so
    // all three now answer the same question with the same number.
    const paid = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: from, lte: to } },
      select: { amount: true, orderId: true },
    });
    const fb = await tx.feedback.aggregate({
      where: { createdAt: { gte: from, lte: to } },
      _avg: { rating: true },
      _count: true,
    });

    const revenue = paid.reduce((s, p) => s + p.amount, 0);
    const orderCount = new Set(paid.map((p) => p.orderId)).size;

    // Orders taken in the window, whether or not the money has landed. Counted
    // on the order's own timestamp, so it deliberately answers a different
    // question from revenue rather than trying to agree with it.
    const placedOrders = await tx.order.count({
      where: { createdAt: { gte: from, lte: to }, status: { not: "cancelled" } },
    });

    // Bucketed on the payment's own timestamp, in Manila — matching the summary
    // above and the accounting report, which is the whole point.
    const revenueByDay = await tx.$queryRaw<{ day: string; revenue: number }[]>`
      select to_char(date_trunc('day', p."createdAt" at time zone 'UTC' at time zone 'Asia/Manila'), 'YYYY-MM-DD') as day,
             sum(p.amount)::float8 as revenue
      from payments p
      join orders o on o.id = p."orderId"
      where o."restaurantId" = ${restaurantId}
        and p.status = 'paid'
        and p."createdAt" between ${from} and ${to}
      group by 1 order by 1`;

    const itemsQuery = (dir: Prisma.Sql) => tx.$queryRaw<
      { name: string; qty: number; revenue: number }[]
    >`
      select oi."nameAtTime" as name,
             sum(oi.quantity)::int as qty,
             sum(oi.quantity * oi."unitPrice")::float8 as revenue
      from order_items oi
      join orders o on o.id = oi."orderId"
      where o."restaurantId" = ${restaurantId}
        and o."paymentStatus" = 'paid'
        and o."createdAt" between ${from} and ${to}
      group by oi."nameAtTime"
      order by qty ${dir}
      limit 5`;
    const topItems = await itemsQuery(Prisma.sql`desc`);
    const worstItems = await itemsQuery(Prisma.sql`asc`);

    const paymentGroups = await tx.payment.groupBy({
      by: ["method"],
      where: { status: "paid", order: { is: { createdAt: { gte: from, lte: to } } } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const paymentMix = paymentGroups.map((g) => ({
      method: g.method,
      count: g._count._all,
      amount: g._sum.amount ?? 0,
    }));

    const peakHours = await tx.$queryRaw<{ hour: number; orders: number }[]>`
      select extract(hour from "createdAt")::int as hour, count(*)::int as orders
      from orders
      where "restaurantId" = ${restaurantId}
        and "paymentStatus" = 'paid'
        and "createdAt" between ${from} and ${to}
      group by 1 order by 1`;

    const ratingTrend = await tx.$queryRaw<{ day: string; avg: number; count: number }[]>`
      select to_char(date_trunc('day', "createdAt" at time zone 'UTC' at time zone 'Asia/Manila'), 'YYYY-MM-DD') as day,
             avg(rating)::float8 as avg, count(*)::int as count
      from feedback
      where "restaurantId" = ${restaurantId}
        and "createdAt" between ${from} and ${to}
      group by 1 order by 1`;

    return {
      summary: {
        revenue,
        orders: orderCount,
        placedOrders,
        aov: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
        avgRating: fb._avg.rating ? Number(fb._avg.rating.toFixed(2)) : null,
        ratingCount: fb._count,
      },
      revenueByDay,
      topItems,
      worstItems,
      paymentMix,
      peakHours,
      ratingTrend,
    };
  });
}
