import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { manilaShortDateTime } from "@/lib/time/manila";
import { isOrderType, type OrderTypeKey } from "@/lib/orders/order-type";
import { rollUpItemsSold, type ItemsSold } from "@/lib/orders/items-sold";

/**
 * Order history an owner can actually read, on the phone in their pocket.
 *
 * Before this, looking anything up meant exporting a CSV and opening a
 * spreadsheet — which is fine at a desk and useless standing in the shop when a
 * customer asks about an order from Tuesday. The cashier's closed list only
 * covers the current shift, and accounting answers a money question, not "what
 * did that person order".
 *
 * Every figure is what was actually collected, matching accounting and the
 * shift report. `total` is the ticket's own total before discounts, kept beside
 * it so the two can be compared rather than confused.
 */

export interface HistoryOrder {
  id: string;
  label: string;
  orderNumber: number | null;
  at: string;
  status: string;
  paymentStatus: string;
  orderType: OrderTypeKey;
  customerName: string | null;
  customerPhone: string | null;
  cashier: string | null;
  /** Ticket total before discount/credit. */
  total: number;
  discount: number;
  /** Sum of settled payments. */
  paid: number;
  methods: string[];
  itemCount: number;
  items: { name: string; quantity: number; lineTotal: number; note: string | null; modifiers: string[] }[];
}

export interface HistoryPage {
  orders: HistoryOrder[];
  /** Totals for the WHOLE filtered range, not just this page. */
  totals: { orders: number; collected: number; discounts: number };
  page: number;
  pageCount: number;
}

export interface HistoryFilter {
  from: Date;
  to: Date;
  /** Free text over order number, customer name and phone. */
  q?: string;
  orderType?: OrderTypeKey;
  /** "paid" | "unpaid" | "cancelled" — anything else means all. */
  state?: string;
  page?: number;
}

const PAGE_SIZE = 25;

/**
 * The order filter, built once.
 *
 * Shared by the list, its count, the range totals and the items-sold summary,
 * because near-identical where clauses in four places is how a list stops
 * agreeing with the total printed above it.
 */
function historyWhere(filter: HistoryFilter): Record<string, unknown> {
  const where: Record<string, unknown> = { createdAt: { gte: filter.from, lte: filter.to } };

  if (filter.state === "paid") where.paymentStatus = "paid";
  else if (filter.state === "unpaid") where.paymentStatus = { in: ["unpaid", "failed"] };
  else if (filter.state === "cancelled") where.status = "cancelled";

  // Newer columns are filtered best-effort: a database that hasn't caught up
  // should show an unfiltered list, not an error page.
  if (filter.orderType) where.orderType = filter.orderType;

  const q = filter.q?.trim();
  if (q) {
    const asNumber = Number(q.replace(/^#/, ""));
    where.OR = [
      ...(Number.isFinite(asNumber) && asNumber > 0 ? [{ orderNumber: asNumber }] : []),
      { customerName: { contains: q, mode: "insensitive" } },
      { customerPhone: { contains: q } },
    ];
  }
  return where;
}

export async function getOrderHistory(
  restaurantId: string,
  filter: HistoryFilter,
): Promise<HistoryPage> {
  const page = Math.max(1, Math.floor(filter.page ?? 1));

  return tenantDb(restaurantId, async (tx) => {
    const where = historyWhere(filter);

    let total = 0;
    let rows: {
      id: string;
      createdAt: Date;
      status: string;
      paymentStatus: string;
      total: number;
      discountAmount: number | null;
      orderNumber: number | null;
      orderType: string | null;
      customerName: string | null;
      customerPhone: string | null;
      openedByName: string | null;
      table: { tableNumber: string } | null;
      items: {
        nameAtTime: string;
        quantity: number;
        unitPrice: number;
        note: string | null;
        modifiers: { nameAtTime: string; priceDeltaAtTime: number }[];
      }[];
    }[] = [];

    try {
      [total, rows] = await Promise.all([
        tx.order.count({ where }),
        tx.order.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            createdAt: true,
            status: true,
            paymentStatus: true,
            total: true,
            discountAmount: true,
            orderNumber: true,
            orderType: true,
            customerName: true,
            customerPhone: true,
            openedByName: true,
            table: { select: { tableNumber: true } },
            items: {
              select: {
                nameAtTime: true,
                quantity: true,
                unitPrice: true,
                note: true,
                modifiers: { select: { nameAtTime: true, priceDeltaAtTime: true } },
              },
            },
          },
        }),
      ]);
    } catch {
      return { orders: [], totals: { orders: 0, collected: 0, discounts: 0 }, page: 1, pageCount: 1 };
    }

    // Money for this page's orders.
    const ids = rows.map((r) => r.id);
    const paidByOrder = new Map<string, { amount: number; methods: Set<string> }>();
    if (ids.length) {
      try {
        const payments = await tx.payment.findMany({
          where: { orderId: { in: ids }, status: "paid" },
          select: { orderId: true, amount: true, method: true },
        });
        for (const p of payments) {
          const cur = paidByOrder.get(p.orderId) ?? { amount: 0, methods: new Set<string>() };
          cur.amount += p.amount;
          cur.methods.add(p.method);
          paidByOrder.set(p.orderId, cur);
        }
      } catch {
        /* leave the money columns at zero rather than dropping the list */
      }
    }

    // Range totals, computed over every matching order rather than this page —
    // a header that only added up the visible 25 would be worse than none.
    let collected = 0;
    let discounts = 0;
    try {
      const agg = await tx.payment.aggregate({
        where: { status: "paid", order: where },
        _sum: { amount: true },
      });
      collected = agg._sum.amount ?? 0;
      const d = await tx.order.aggregate({ where, _sum: { discountAmount: true } });
      discounts = d._sum.discountAmount ?? 0;
    } catch {
      /* best-effort */
    }

    const orders: HistoryOrder[] = rows.map((o) => {
      const money = paidByOrder.get(o.id);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        label:
          o.orderNumber != null
            ? `#${o.orderNumber}`
            : o.table?.tableNumber
              ? `Table ${o.table.tableNumber}`
              : o.customerName || o.id.slice(0, 8),
        at: manilaShortDateTime(o.createdAt),
        status: o.status,
        paymentStatus: o.paymentStatus,
        orderType: isOrderType(o.orderType ?? "") ? (o.orderType as OrderTypeKey) : "dine_in",
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        cashier: o.openedByName,
        total: o.total,
        discount: o.discountAmount ?? 0,
        paid: money?.amount ?? 0,
        methods: money ? [...money.methods] : [],
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        items: o.items.map((i) => ({
          name: i.nameAtTime,
          quantity: i.quantity,
          note: i.note,
          modifiers: i.modifiers.map((m) => m.nameAtTime),
          lineTotal:
            (i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0)) * i.quantity,
        })),
      };
    });

    return {
      orders,
      totals: { orders: total, collected, discounts },
      page,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  });
}

/**
 * What was sold in this window, per item.
 *
 * Runs against the SAME filter as the list above it, with one deliberate
 * exception: VOIDED TICKETS NEVER COUNT AS SOLD. A cancelled order's items went
 * back on the shelf, and counting them would tell an owner they sold forty
 * burgers on a day they sold thirty-eight and voided two — which is exactly the
 * number they'd then order stock against.
 *
 * So when the list is filtered to voided, this comes back empty. That's the
 * honest answer to "what did we sell", not a bug.
 */
export async function getItemsSold(
  restaurantId: string,
  filter: HistoryFilter,
): Promise<ItemsSold> {
  const empty: ItemsSold = { items: [], totalQuantity: 0, totalRevenue: 0, distinctItems: 0 };
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const where = { ...historyWhere(filter), status: { not: "cancelled" as const } };
      // Filtering to voided and excluding voided leaves nothing, by definition.
      if (filter.state === "cancelled") return empty;

      const lines = await tx.orderItem.findMany({
        where: { order: where },
        select: {
          menuItemId: true,
          nameAtTime: true,
          quantity: true,
          unitPrice: true,
          modifiers: { select: { priceDeltaAtTime: true } },
        },
      });

      return rollUpItemsSold(
        lines.map((l) => ({
          menuItemId: l.menuItemId,
          nameAtTime: l.nameAtTime,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          modifierDeltas: l.modifiers.map((m) => m.priceDeltaAtTime),
        })),
      );
    });
  } catch {
    return empty;
  }
}
