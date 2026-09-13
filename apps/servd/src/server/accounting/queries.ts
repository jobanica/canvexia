import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey, manilaShortDateTime } from "@/lib/time/manila";

const VAT_RATE = 0.12;

/**
 * Manila, not UTC.
 *
 * This used to be `d.toISOString().slice(0, 10)`, which buckets by the UTC day.
 * Manila is UTC+8, so every sale taken between midnight and 8 AM was filed
 * under the previous day — while the dashboard, which buckets in Manila, filed
 * it under the right one. Two screens, two answers, same money. Part of why the
 * daily totals never agreed.
 */
const dayKey = (d: Date) => manilaDayKey(d);

export interface SalesReport {
  gross: number; // total collected (centavos)
  orderCount: number;
  discounts: number;
  byMethod: { method: string; amount: number; count: number }[];
  byDay: { day: string; amount: number; orders: number }[];
}

/** Sales / Z-report from confirmed payments in a period. */
export async function getSalesReport(restaurantId: string, from: Date, to: Date): Promise<SalesReport> {
  return tenantDb(restaurantId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: from, lte: to } },
      select: { amount: true, method: true, orderId: true, createdAt: true },
    });

    let gross = 0;
    const orderIds = new Set<string>();
    const methodMap = new Map<string, { amount: number; count: number }>();
    const dayMap = new Map<string, { amount: number; orders: Set<string> }>();
    for (const p of payments) {
      gross += p.amount;
      orderIds.add(p.orderId);
      const m = methodMap.get(p.method) ?? { amount: 0, count: 0 };
      methodMap.set(p.method, { amount: m.amount + p.amount, count: m.count + 1 });
      const dk = dayKey(p.createdAt);
      const d = dayMap.get(dk) ?? { amount: 0, orders: new Set<string>() };
      d.amount += p.amount;
      d.orders.add(p.orderId);
      dayMap.set(dk, d);
    }

    // Discounts on those orders (best-effort — column may lag).
    let discounts = 0;
    try {
      if (orderIds.size) {
        const orders = await tx.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { discountAmount: true },
        });
        discounts = orders.reduce((s, o) => s + (o.discountAmount ?? 0), 0);
      }
    } catch {
      /* not migrated */
    }

    return {
      gross,
      orderCount: orderIds.size,
      discounts,
      byMethod: [...methodMap.entries()].map(([method, v]) => ({ method, ...v })),
      byDay: [...dayMap.entries()]
        .map(([day, v]) => ({ day, amount: v.amount, orders: v.orders.size }))
        .sort((a, b) => (a.day < b.day ? 1 : -1)),
    };
  });
}

export interface VatReport {
  totalSales: number;
  exemptSales: number; // Senior/PWD VAT-exempt
  vatableGross: number; // VAT-inclusive
  netOfVat: number;
  vat: number;
}

/** PH VAT breakdown (12% inclusive) with Senior/PWD exemption. */
export async function getVatReport(restaurantId: string, from: Date, to: Date): Promise<VatReport> {
  return tenantDb(restaurantId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: from, lte: to } },
      select: { amount: true, orderId: true },
    });
    const total = payments.reduce((s, p) => s + p.amount, 0);

    // Exempt = sales for orders with a Senior/PWD discount label (best-effort).
    let exempt = 0;
    try {
      const ids = [...new Set(payments.map((p) => p.orderId))];
      if (ids.length) {
        const orders = await tx.order.findMany({
          where: { id: { in: ids }, OR: [{ discountLabel: { contains: "Senior" } }, { discountLabel: { contains: "PWD" } }] },
          select: { id: true },
        });
        const exemptIds = new Set(orders.map((o) => o.id));
        exempt = payments.filter((p) => exemptIds.has(p.orderId)).reduce((s, p) => s + p.amount, 0);
      }
    } catch {
      /* not migrated */
    }

    const vatableGross = Math.max(0, total - exempt);
    const netOfVat = Math.round(vatableGross / (1 + VAT_RATE));
    return { totalSales: total, exemptSales: exempt, vatableGross, netOfVat, vat: vatableGross - netOfVat };
  });
}

/**
 * COGS = sum of (menu item food cost × quantity) for items in paid orders.
 * Food cost is set per item in the menu editor. Best-effort (0 if not set).
 */
export async function getCogs(restaurantId: string, from: Date, to: Date): Promise<number> {
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const payments = await tx.payment.findMany({
        where: { status: "paid", createdAt: { gte: from, lte: to } },
        select: { orderId: true },
      });
      const orderIds = [...new Set(payments.map((p) => p.orderId))];
      if (orderIds.length === 0) return 0;
      const [items, costs] = await Promise.all([
        tx.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          select: { menuItemId: true, quantity: true },
        }),
        tx.menuItemCost.findMany({ select: { menuItemId: true, cost: true } }),
      ]);
      const costMap = new Map(costs.map((c) => [c.menuItemId, c.cost]));
      return items.reduce((s, it) => s + (it.menuItemId ? costMap.get(it.menuItemId) ?? 0 : 0) * it.quantity, 0);
    });
  } catch {
    return 0;
  }
}

export interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
}

export async function getExpenses(restaurantId: string, from: Date, to: Date): Promise<ExpenseRow[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.expense.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: "desc" },
        select: { id: true, date: true, category: true, amount: true, note: true },
      }),
    );
    return rows.map((r) => ({ id: r.id, date: r.date.toISOString(), category: r.category, amount: r.amount, note: r.note }));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------- ticket list

export interface SalesTicket {
  orderId: string;
  label: string;
  /** Manila-formatted time the money was taken. */
  paidAt: string;
  /** The ticket's own total, before discount. */
  gross: number;
  discount: number;
  /** What was actually collected — this is the column that sums to the KPI. */
  paid: number;
  methods: string[];
}

export interface VoidedTicket {
  orderId: string;
  label: string;
  at: string;
  /** Money that was taken and then reversed. */
  reversed: number;
}

/**
 * Every ticket behind the period's total, one row each.
 *
 * Built because an owner comparing the system against their own written tally
 * had no way to find the difference — three screens showed three numbers and
 * none of them could be opened up. A total nobody can break down into the
 * tickets that made it is a number you either believe or don't.
 *
 * The `paid` column sums to Gross sales exactly. Anything in the owner's list
 * that isn't here is either a voided ticket (listed separately, with what was
 * reversed) or one that was never settled — which is the answer, either way.
 */
export async function getSalesTickets(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<{ tickets: SalesTicket[]; voided: VoidedTicket[] }> {
  return tenantDb(restaurantId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: from, lte: to } },
      select: { amount: true, method: true, orderId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Fold split tenders back into one row per ticket — the owner wrote down
    // one line for the sale, not one per card swipe.
    const byOrder = new Map<string, { paid: number; at: Date; methods: Set<string> }>();
    for (const p of payments) {
      const cur = byOrder.get(p.orderId);
      if (cur) {
        cur.paid += p.amount;
        cur.methods.add(p.method);
        if (p.createdAt > cur.at) cur.at = p.createdAt;
      } else {
        byOrder.set(p.orderId, { paid: p.amount, at: p.createdAt, methods: new Set([p.method]) });
      }
    }

    const ids = [...byOrder.keys()];
    const orders = ids.length
      ? await tx.order.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            total: true,
            discountAmount: true,
            orderNumber: true,
            customerName: true,
            table: { select: { tableNumber: true } },
          },
        })
      : [];
    const meta = new Map(orders.map((o) => [o.id, o]));

    const tickets: SalesTicket[] = [...byOrder.entries()]
      .map(([orderId, v]) => {
        const o = meta.get(orderId);
        return {
          orderId,
          label: ticketLabel(o, orderId),
          paidAt: manilaShortDateTime(v.at),
          gross: o?.total ?? v.paid,
          discount: o?.discountAmount ?? 0,
          paid: v.paid,
          methods: [...v.methods],
        };
      })
      .sort((a, b) => (a.paidAt < b.paidAt ? -1 : 1));

    // Tickets voided in the window. Their payments were flipped to `refunded`,
    // so they're correctly absent from every total above — but they're exactly
    // what a hand-written list still counts, so name them rather than leaving
    // the owner to wonder where their money went.
    let voided: VoidedTicket[] = [];
    try {
      const rows = await tx.order.findMany({
        where: { voidedAt: { gte: from, lte: to } },
        select: {
          id: true,
          total: true,
          voidedAt: true,
          orderNumber: true,
          customerName: true,
          table: { select: { tableNumber: true } },
          payments: { where: { status: "refunded" }, select: { amount: true } },
        },
        orderBy: { voidedAt: "asc" },
      });
      voided = rows.map((o) => ({
        orderId: o.id,
        label: ticketLabel(o, o.id),
        at: o.voidedAt ? manilaShortDateTime(o.voidedAt) : "",
        reversed: o.payments.reduce((s, p) => s + p.amount, 0) || o.total,
      }));
    } catch {
      /* voidedAt column not migrated yet */
    }

    return { tickets, voided };
  });
}

/** Whatever the staff would recognise this ticket by. */
function ticketLabel(
  o:
    | { orderNumber?: number | null; customerName?: string | null; table?: { tableNumber: string } | null }
    | undefined,
  orderId: string,
): string {
  if (o?.orderNumber != null) return `#${o.orderNumber}`;
  if (o?.table?.tableNumber) return `Table ${o.table.tableNumber}`;
  if (o?.customerName) return o.customerName;
  return orderId.slice(0, 8);
}
