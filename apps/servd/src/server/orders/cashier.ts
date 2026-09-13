"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { currentShift, ensureShift, stampPaymentShift } from "./shift-session";
import { staffLabel } from "@/server/tenancy/staff-name";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { autoPrintIfEnabled, printReceipt, printKitchenIfNeeded } from "@/server/printing/print";
import { getPublicMenu } from "@/server/menu/public-menu";
import { recordServingsSold } from "@/server/menu/servings";
import { recordVariantsSold } from "@/server/menu/variants";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
  type OrderLineInput,
} from "@/server/orders/build-order";
import type { DinerCategory } from "@/lib/cart/types";
import { computeDiscount, netTotal, type DiscountKind } from "@/lib/discount";
import { pesosToCentavos } from "@/lib/money";
import { formatOrderNumber } from "@/lib/orders/order-number";
import { orderTypeLabel, orderTypeLabelWithEmoji, type OrderTypeKey } from "@/lib/orders/order-type";
import { isVoidReason } from "@/lib/orders/void-reasons";
import { needsKitchenReopen, previousLineIds, reopenStatus } from "@/lib/orders/extra-round";
import { writeAudit } from "@/server/audit/log";
import { awardPointsForOrder, getBalance, getLoyaltyConfig, redeemPoints, enrollAccount } from "@/server/loyalty/loyalty";
import { notifyCustomer, restaurantDisplayName } from "@/server/sms/notify";
import { manilaStartOfDay } from "@/lib/time/manila";
import { getDishStock } from "@/server/inventory/dish-stock";
import { runAutoAccept } from "@/server/orders/auto-accept";
import { deductForOrder } from "@/server/inventory/deduct";
import { nextOrderNumberSafe } from "@/server/orders/next-number";
import {
  applyCardSurcharge,
  revertCardSurcharge,
  surchargeMap,
  surchargeOnOrder,
} from "@/server/orders/surcharge";

export interface CashierOrder {
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  discountAmount: number;
  discountLabel: string | null;
  creditApplied: number; // centavos paid by a redeemed gift card
  paid: number; // centavos already tendered (split/partial payments)
  net: number; // total - discount - credit
  billRequested: boolean;
  paidOnline: boolean; // a confirmed gateway (PayMongo) payment exists
  served: boolean; // cashier confirmed the food was served
  /**
   * How the customer said they'd pay, and their proof. Kept on the card AFTER
   * acceptance: with ten orders open, "Payment: unpaid" alone tells a cashier
   * nothing about which of them owes cash and which already sent a transfer.
   */
  paymentChoice: string | null;
  paymentRef: string | null;
  paymentReceiptUrl: string | null;
  cashTendered: number | null;
  /**
   * When an advance order is wanted for, ISO. Kept on the card AFTER
   * acceptance — accepting it only means the kitchen has been told about it,
   * not that it's due now, and a card that drops the date reads exactly like an
   * order to start cooking immediately.
   */
  scheduledFor: string | null;
  createdAt: string;
  itemCount: number;
  items: { name: string; quantity: number; note: string | null; modifiers: string[] }[];
}

/**
 * Best-effort per-order discount lookup. The discount columns may not exist yet
 * on a lagging prod DB — return an empty map then (treated as no discount).
 */
async function discountMap(
  restaurantId: string,
  ids: string[],
): Promise<Map<string, { amount: number; label: string | null }>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, discountAmount: true, discountLabel: true },
      }),
    );
    return new Map(rows.map((o) => [o.id, { amount: o.discountAmount, label: o.discountLabel }]));
  } catch {
    return new Map();
  }
}

/** Best-effort per-order redeemed gift-card credit (column may lag on prod). */
async function creditMap(restaurantId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({ where: { id: { in: ids } }, select: { id: true, creditApplied: true } }),
    );
    return new Map(rows.map((o) => [o.id, o.creditApplied ?? 0]));
  } catch {
    return new Map();
  }
}

export interface CashierTable {
  tableId: string; // group key (table id, or "order:<id>" for pickup/delivery)
  tableNumber: string; // dine-in table label
  kind: OrderTypeKey;
  label: string; // header label ("Table 5", "Pickup — Juan", "Delivery — Ana")
  /**
   * Who the order is for. On a third-party ticket this is the platform —
   * "food panda", "Grab" — and the settle button names it, so a cashier can see
   * they're closing the right one.
   */
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  mapUrl: string | null;
  orders: CashierOrder[];
  outstanding: number; // sum of unpaid order totals (centavos)
  billRequested: boolean;
  /**
   * The cashier who rang this up. Shown so a table can be traced back to a
   * person — it does NOT restrict who may settle it. Hiding another cashier's
   * tables would strand a customer the moment their server went on break.
   */
  openedByName: string | null;
}

/** Best-effort per-order type/customer lookup (columns may lag on prod). */
async function orderMetaMap(
  restaurantId: string,
  ids: string[],
): Promise<
  Map<string, { orderType: string; customerName: string | null; customerPhone: string | null; customerAddress: string | null; mapUrl: string | null; orderNumber: number | null; openedByName: string | null; paymentChoice: string | null; paymentRef: string | null; paymentReceiptUrl: string | null; cashTendered: number | null }>
> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, orderType: true, customerName: true, customerPhone: true, customerAddress: true, customerLat: true, customerLng: true, orderNumber: true, openedByName: true, paymentChoice: true, paymentRef: true, paymentReceiptUrl: true, cashTendered: true },
      }),
    );
    return new Map(
      rows.map((o) => [
        o.id,
        {
          orderType: o.orderType,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          customerAddress: o.customerAddress,
          mapUrl: o.customerLat != null && o.customerLng != null ? `https://maps.google.com/?q=${o.customerLat},${o.customerLng}` : null,
          orderNumber: o.orderNumber,
          openedByName: o.openedByName,
          paymentChoice: o.paymentChoice,
          paymentRef: o.paymentRef,
          paymentReceiptUrl: o.paymentReceiptUrl,
          cashTendered: o.cashTendered,
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

/** Best-effort advance-order times (the scheduledFor column may lag on prod). */
async function scheduledForMap(restaurantId: string, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({ where: { id: { in: ids } }, select: { id: true, scheduledFor: true } }),
    );
    for (const o of rows) if (o.scheduledFor) map.set(o.id, o.scheduledFor.toISOString());
  } catch {
    /* scheduledFor column not migrated yet */
  }
  return map;
}

/** Best-effort payment method + GCash reference (paymentChoice/Ref may lag on prod). */
type PayMeta = {
  choice: string | null;
  ref: string | null;
  receiptUrl: string | null;
  cashTendered: number | null;
};

async function paymentMap(restaurantId: string, ids: string[]): Promise<Map<string, PayMeta>> {
  const map = new Map<string, PayMeta>();
  if (ids.length === 0) return map;
  const put = (
    id: string,
    choice: string | null,
    ref: string | null,
    receiptUrl: string | null,
    cashTendered: number | null,
  ) => map.set(id, { choice, ref, receiptUrl, cashTendered });
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          paymentChoice: true,
          paymentRef: true,
          paymentReceiptUrl: true,
          cashTendered: true,
        },
      }),
    );
    for (const o of rows) {
      put(o.id, o.paymentChoice ?? null, o.paymentRef ?? null, o.paymentReceiptUrl ?? null, o.cashTendered ?? null);
    }
    return map;
  } catch {
    /* cashTendered not migrated yet — retry without it rather than losing the
       payment method entirely, which is the part the cashier actually needs */
  }
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, paymentChoice: true, paymentRef: true, paymentReceiptUrl: true },
      }),
    );
    for (const o of rows) {
      put(o.id, o.paymentChoice ?? null, o.paymentRef ?? null, o.paymentReceiptUrl ?? null, null);
    }
  } catch {
    /* payment columns not migrated yet */
  }
  return map;
}

/** A QR order awaiting the cashier's acceptance. */
export interface IncomingOrder {
  id: string;
  tableNumber: string;
  label: string; // "Table 5" or "🥡 Pickup — Juan" / "🛵 Delivery — Ana"
  channel: string; // dine_in | takeout | delivery
  customerPhone: string | null;
  customerAddress: string | null;
  mapUrl: string | null;
  scheduledFor: string | null; // ISO — advance order requested time (null = ASAP)
  paymentChoice: string | null; // "cod" | "gcash" | "maya" | "bank"
  paymentRef: string | null; // customer's GCash reference
  /// Screenshot the customer uploaded as proof. The cashier has to be able to
  /// LOOK at it — "verify before accepting" is not a verification.
  paymentReceiptUrl: string | null;
  cashTendered: number | null; // what they say they'll hand over, on a cash order
  total: number;
  paymentStatus: string;
  createdAt: string;
  items: { name: string; quantity: number; note: string | null; modifiers: string[] }[];
  /**
   * Ingredient warnings for THIS order, worked out before it's accepted.
   *
   * Stock comes off when the kitchen finishes, so an order sitting in the
   * incoming queue has already promised its ingredients but not consumed them.
   * Without this the cashier sees a full fridge and keeps saying yes.
   */
  stockWarnings: { name: string; makeable: number; wanted: number; soldOut: boolean }[];
}

const OPEN = ["new", "preparing", "done"] as const;

/** Open orders grouped per table, for the cashier. */
export async function getCashierTables(): Promise<CashierTable[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: { in: [...OPEN] } },
      orderBy: { createdAt: "asc" },
      // Explicit select so a schema lag (newer columns) can't break this query.
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        total: true,
        billRequested: true,
        createdAt: true,
        table: { select: { id: true, tableNumber: true } },
        _count: { select: { items: true } },
        items: {
          select: {
            nameAtTime: true,
            quantity: true,
            note: true,
            modifiers: { select: { nameAtTime: true } },
          },
        },
        payments: { where: { status: "paid" }, select: { gateway: true, amount: true } },
      },
    }),
  );

  // Which finished orders are already served. Best-effort: the servedAt column
  // may not exist yet on a lagging production DB — treat all as not-served then.
  let servedIds = new Set<string>();
  try {
    const served = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { status: "done", servedAt: { not: null } },
        select: { id: true },
      }),
    );
    servedIds = new Set(served.map((o) => o.id));
  } catch {
    /* column not migrated yet — leave servedIds empty */
  }

  const discounts = await discountMap(staff.restaurantId, orders.map((o) => o.id));
  const credits = await creditMap(staff.restaurantId, orders.map((o) => o.id));
  // Card fees already added — so a bill half-settled on a card still shows the
  // right amount outstanding on the floor.
  const surcharges = await surchargeMap(staff.restaurantId, orders.map((o) => o.id));
  // When an advance order is actually wanted for.
  const scheduled = await scheduledForMap(staff.restaurantId, orders.map((o) => o.id));
  const meta = await orderMetaMap(staff.restaurantId, orders.map((o) => o.id));

  const byTable = new Map<string, CashierTable>();
  for (const o of orders) {
    const m = meta.get(o.id);
    const kind = (m?.orderType ?? "dine_in") as CashierTable["kind"];
    // A counter/stall order has an order number — one card per order, never
    // grouped under the shared counter "table".
    const isCounter = m?.orderNumber != null;
    // Dine-in groups by table; pickup/delivery/counter is one card per order.
    const isDineIn = !isCounter && (kind === "dine_in" || !!o.table);
    const key = isDineIn ? `table:${o.table?.id ?? o.id}` : `order:${o.id}`;
    const customerName = m?.customerName ?? null;
    const label = isDineIn
      ? `Table ${o.table?.tableNumber ?? "—"}`
      : isCounter
        ? `🧾 Order ${formatOrderNumber(m!.orderNumber!)}`
        // One word per type, shared with the kitchen display and the receipt.
        : `${orderTypeLabelWithEmoji(kind)} — ${customerName ?? "Customer"}`;

    if (!byTable.has(key)) {
      byTable.set(key, {
        tableId: key,
        tableNumber: o.table?.tableNumber ?? "",
        kind: isDineIn ? "dine_in" : kind,
        label,
        // Who the order is for — on a third-party ticket this is the platform
        // ("food panda", "Grab"), which the settle button names outright.
        customerName,
        customerPhone: m?.customerPhone ?? null,
        customerAddress: m?.customerAddress ?? null,
        mapUrl: m?.mapUrl ?? null,
        orders: [],
        outstanding: 0,
        billRequested: false,
        openedByName: m?.openedByName ?? null,
      });
    }
    const t = byTable.get(key)!;
    const disc = discounts.get(o.id);
    const discountAmount = disc?.amount ?? 0;
    const creditApplied = credits.get(o.id) ?? 0;
    const net = netTotal(o.total, discountAmount, creditApplied, surcharges.get(o.id) ?? 0);
    const paid = o.payments.reduce((s, p) => s + (p.amount ?? 0), 0);
    t.orders.push({
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      discountAmount,
      discountLabel: disc?.label ?? null,
      creditApplied,
      paid,
      net,
      billRequested: o.billRequested,
      paidOnline: o.payments.some((p) => p.gateway === "paymongo"),
      served: servedIds.has(o.id),
      paymentChoice: m?.paymentChoice ?? null,
      paymentRef: m?.paymentRef ?? null,
      paymentReceiptUrl: m?.paymentReceiptUrl ?? null,
      cashTendered: m?.cashTendered ?? null,
      scheduledFor: scheduled.get(o.id) ?? null,
      createdAt: o.createdAt.toISOString(),
      itemCount: o._count.items,
      items: o.items.map((it) => ({
        name: it.nameAtTime,
        quantity: it.quantity,
        note: it.note,
        modifiers: it.modifiers.map((m) => m.nameAtTime),
      })),
    });
    if (o.paymentStatus !== "paid") t.outstanding += Math.max(0, net - paid);
    if (o.billRequested) t.billRequested = true;
  }

  return [...byTable.values()];
}

/** QR orders awaiting acceptance (the cashier's incoming-order queue). */
export async function getIncomingOrders(): Promise<IncomingOrder[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  // Take anything nobody answered in time before listing, so the board never
  // shows a card that has already run out its clock. A no-op — one small query
  // — for every shop that hasn't switched auto-accept on.
  await runAutoAccept(staff.restaurantId).catch(() => []);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        total: true,
        paymentStatus: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            menuItemId: true, // needed to look up what's still makeable
            nameAtTime: true,
            quantity: true,
            note: true,
            modifiers: { select: { nameAtTime: true } },
          },
        },
      },
    }),
  );

  const itemIds = [
    ...new Set(orders.flatMap((o) => o.items.map((i) => i.menuItemId)).filter((id): id is string => !!id)),
  ];
  const [meta, sched, payments, stock] = await Promise.all([
    orderMetaMap(staff.restaurantId, orders.map((o) => o.id)),
    scheduledForMap(staff.restaurantId, orders.map((o) => o.id)),
    paymentMap(staff.restaurantId, orders.map((o) => o.id)),
    getDishStock(staff.restaurantId, itemIds).catch(() => new Map()),
  ]);
  return orders.map((o) => {
    const m = meta.get(o.id);
    const kind = (m?.orderType ?? "dine_in") as string;
    const isCounter = m?.orderNumber != null;
    const isDineIn = !isCounter && (kind === "dine_in" || !!o.table);
    const label = isDineIn
      ? `Table ${o.table?.tableNumber ?? "—"}`
      : isCounter
        ? `🧾 Order ${formatOrderNumber(m!.orderNumber!)}`
        : kind === "delivery"
          ? `🛵 Delivery — ${m?.customerName ?? "Customer"}`
          : `🥡 Pickup — ${m?.customerName ?? "Customer"}`;
    return {
      id: o.id,
      tableNumber: isCounter ? formatOrderNumber(m!.orderNumber!) : o.table?.tableNumber ?? "—",
      label,
      channel: isDineIn ? "dine_in" : kind,
      customerPhone: m?.customerPhone ?? null,
      customerAddress: m?.customerAddress ?? null,
      mapUrl: m?.mapUrl ?? null,
      scheduledFor: sched.get(o.id) ?? null,
      paymentChoice: payments.get(o.id)?.choice ?? null,
      paymentRef: payments.get(o.id)?.ref ?? null,
      paymentReceiptUrl: payments.get(o.id)?.receiptUrl ?? null,
      cashTendered: payments.get(o.id)?.cashTendered ?? null,
      total: o.total,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
      // Only lines that are actually short — a clean order carries none, so an
      // empty array means "nothing to worry about" and the card stays quiet.
      stockWarnings: o.items.flatMap((it) => {
        const s = it.menuItemId ? stock.get(it.menuItemId) : undefined;
        if (!s || s.makeable == null) return [];
        if (s.makeable >= it.quantity && !s.low) return [];
        return [{
          name: it.nameAtTime,
          makeable: s.makeable,
          wanted: it.quantity,
          soldOut: s.makeable <= 0,
        }];
      }),
      items: o.items.map((it) => ({
        name: it.nameAtTime,
        quantity: it.quantity,
        note: it.note,
        modifiers: it.modifiers.map((m) => m.nameAtTime),
      })),
    };
  })
    // Advance orders live on the Advance orders page until they're sent to the
    // kitchen — keep them out of the cashier's "incoming now" popup.
    .filter((o) => !o.scheduledFor);
}

export interface CashierState {
  ok: boolean;
  incoming?: IncomingOrder[];
  tables?: CashierTable[];
  error?: string;
  // Set when a kitchen ticket must be printed by the browser (no kitchen display).
  printKitchen?: boolean;
  printOrderId?: string;
}

/** Accept an incoming QR order → moves it into the kitchen + prints the ticket. */
export async function acceptOrder(orderId: string): Promise<CashierState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  // Guarded by status so a double-tap (or two cashiers) can't accept twice.
  const res = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "new" } }),
  );

  let printKitchen = false;
  if (res.count > 0) {
    // Stamp when the clock started, so a shop watching the merchant screen sees
    // a countdown on an order accepted from the till. Best-effort and on its
    // own: a missing column must never fail an accept.
    try {
      await tenantDb(staff.restaurantId, (tx) =>
        tx.order.updateMany({ where: { id: orderId }, data: { acceptedAt: new Date() } }),
      );
    } catch {
      /* acceptedAt not migrated yet */
    }
    await notifyOrdersChanged(staff.restaurantId);
    await autoPrintIfEnabled(staff.restaurantId, orderId);
    // No kitchen display → print a kitchen ticket on accept.
    printKitchen = (await printKitchenIfNeeded(staff.restaurantId, orderId)).clientPrintNeeded;

    // Confirmation SMS for pickup/delivery customers (best-effort).
    const m = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId);
    if (m && m.orderType !== "dine_in" && m.customerPhone) {
      const who = await restaurantDisplayName(staff.restaurantId);
      const ref = orderId.slice(0, 8).toUpperCase();
      const mode = m.orderType === "delivery" ? "for delivery" : "for pickup";
      const hi = m.customerName ? `Hi ${m.customerName}, ` : "";
      await notifyCustomer(
        staff.restaurantId,
        m.customerPhone,
        `${hi}your order #${ref} at ${who} is confirmed ${mode}. We'll prepare it now. Salamat!`,
      );
    }
  }
  return {
    ok: true,
    incoming: await getIncomingOrders(),
    tables: await getCashierTables(),
    printKitchen,
    printOrderId: printKitchen ? orderId : undefined,
  };
}

/** Decline an incoming QR order → cancels it. */
export async function declineOrder(orderId: string): Promise<CashierState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "cancelled" } }),
  );
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, incoming: await getIncomingOrders(), tables: await getCashierTables() };
}

/**
 * What's left on an order after everything already tendered against it.
 *
 * Its own function because the card fee has to be worked out on this number
 * before the settle transaction opens — charging 3.5% of the full bill on a
 * table that already paid half in cash would be quietly wrong.
 */
async function amountStillOwed(
  restaurantId: string,
  orderId: string,
  discountAmount: number,
  credit: number,
  surcharge: number,
): Promise<number> {
  return tenantDb(restaurantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId }, select: { total: true } });
    if (!order) return 0;
    const agg = await tx.payment.aggregate({
      where: { orderId, status: "paid" },
      _sum: { amount: true },
    });
    const net = netTotal(order.total, discountAmount, credit, surcharge);
    return Math.max(0, net - (agg._sum.amount ?? 0));
  });
}

/**
 * Remember what the customer handed over, so the receipt can show the change.
 *
 * Best-effort and deliberately not part of the settle transaction: a receipt
 * detail must never be the reason a payment fails to record.
 */
async function recordCashTendered(
  restaurantId: string,
  orderId: string,
  method: string,
  tenderedCentavos: number | undefined,
): Promise<void> {
  if (method !== "cash") return;
  const tendered = Math.round(Number(tenderedCentavos) || 0);
  if (tendered <= 0) return;
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { cashTendered: tendered } }),
    );
  } catch {
    /* cashTendered column not migrated yet — the receipt just omits the line */
  }
}

/** Payment methods a cashier can record in person. */
export type CounterMethod =
  | "cash"
  | "card_terminal"
  | "gcash"
  | "maya"
  | "bank_transfer"
  // Grab / Foodpanda. Not tendered at the counter — see settleThirdParty.
  | "third_party";

/**
 * Record an in-person payment (cash/card/e-wallet). Marks paid AND closes the order.
 *
 * `tenderedCentavos` is what the customer physically handed over on a cash
 * sale. It changes nothing about what is charged — it's recorded so the receipt
 * can print the cash received and the change given back.
 */
export async function markOrderPaid(
  orderId: string,
  method: CounterMethod,
  tenderedCentavos?: number,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string; printTicket?: boolean; drawerKickBase64?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const settled = await settleAtCounter(staff, orderId, method, tenderedCentavos);
  if (!settled.ok) return { ok: false, error: settled.error };
  return {
    ok: true,
    tables: await getCashierTables(),
    printTicket: settled.printTicket,
    drawerKickBase64: settled.drawerKickBase64,
  };
}

/**
 * Close a Grab / Foodpanda ticket once the rider has taken the food.
 *
 * Nothing is tendered here, which is the whole point. The platform collected
 * from the customer in its own app and remits to the restaurant later, so there
 * is no cash to count, no change to give and no card to tap — but the sale is
 * real and has to land somewhere. Ringing it up as cash (the only thing the
 * till could do before) put it in the wrong column of every report AND left the
 * drawer over by the amount at cash-out, because the money it claimed to hold
 * was never there.
 *
 * Recorded at the ticket's full value, not net of the platform's commission.
 * That matches every other method — what the customer was charged is what the
 * sale was — and the commission is a cost, settled against the platform's
 * remittance, not a discount the restaurant gave.
 *
 * No PIN and no confirmation: it takes money nowhere and is undone by re-opening
 * the ticket, the same as any other settle.
 */
export async function settleThirdParty(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string; printTicket?: boolean }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  const settled = await settleAtCounter(staff, orderId, "third_party");
  if (!settled.ok) {
    // A database that hasn't run the migration rejects the enum value outright.
    // Say which file rather than showing a raw Postgres string.
    const missing = /invalid input value for enum|third_party/i.test(settled.error);
    return {
      ok: false,
      error: missing
        ? "Settling a third-party order needs one database update. Run prisma/manual/add-third-party-tender.sql, then try again."
        : settled.error,
    };
  }
  return { ok: true, tables: await getCashierTables(), printTicket: settled.printTicket };
}

type SettleOutcome =
  | { ok: true; printTicket: boolean; drawerKickBase64?: string }
  | { ok: false; error: string };

/**
 * Taking the money — the whole of it, from the card fee to the receipt.
 *
 * Its own function because two flows settle an order now: the cashier tapping
 * Pay on a bill already on the floor, and a pay-first shop taking the money as
 * part of ringing the order up. Written twice, the two would drift, and the
 * half that drifts is always the surcharge, the shift attribution or the
 * loyalty base — the three things nobody notices until the books disagree.
 *
 * Takes an already-authorised staff member: the caller has done the role check
 * and this must never be reachable without one.
 */
async function settleAtCounter(
  staff: Awaited<ReturnType<typeof requireStaff>>,
  orderId: string,
  method: CounterMethod,
  tenderedCentavos?: number,
): Promise<SettleOutcome> {
  // Charge the discounted (net) amount, less any gift-card credit already applied.
  const disc = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
  const credit = (await creditMap(staff.restaurantId, [orderId])).get(orderId) ?? 0;
  let netPaid = 0;

  // The card fee, charged on whatever is still owed. Worked out and written to
  // the order BEFORE the tender is recorded, so a payment can only ever include
  // a fee the order actually carries — see applyCardSurcharge for why.
  const surcharge = await surchargeOnOrder(staff.restaurantId, orderId);
  const owedBefore = await amountStillOwed(staff.restaurantId, orderId, disc?.amount ?? 0, credit, surcharge);
  const { fee } = await applyCardSurcharge(staff.restaurantId, orderId, method, owedBefore);

  // Whose drawer this money lands in. Resolved before the transaction so a
  // shift lookup can never hold a settle open.
  const shift = await ensureShift(staff.restaurantId, staff.staffUserId, () =>
    staffLabel(staff.restaurantId, staff.staffUserId),
  );
  let paymentId: string | null = null;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId },
        select: { total: true, status: true },
      });
      if (!order) throw new Error("Order not found");
      const net = netTotal(order.total, disc?.amount ?? 0, credit, surcharge + fee);
      // Settle only what's still owed after any prior split/partial tenders.
      const agg = await tx.payment.aggregate({ where: { orderId, status: "paid" }, _sum: { amount: true } });
      const amount = Math.max(0, net - (agg._sum.amount ?? 0));
      // Loyalty earns on what the customer spent with the restaurant, not on
      // the card fee passed through on top of it.
      netPaid = Math.max(0, net - (surcharge + fee));
      // An order leaves the boards when it is BOTH paid and cooked — never on
      // payment alone. A takeout customer pays the moment they order, and
      // closing there used to wipe the ticket off the kitchen display before
      // anyone had made the food.
      const cooked = order.status === "done" || order.status === "closed";
      // updateMany (not update) so it doesn't read the whole row back — keeps
      // working even if the prod schema lags (e.g. missing newer columns).
      await tx.order.updateMany({
        where: { id: orderId },
        data: {
          paymentStatus: "paid",
          billRequested: false,
          ...(cooked ? { status: "closed" as const } : {}),
        },
      });
      if (amount > 0) {
        const p = await tx.payment.create({
          data: { orderId, amount, method, gateway: "manual", status: "paid" },
          select: { id: true },
        });
        paymentId = p.id;
      }
    });
  } catch (e) {
    console.error("markOrderPaid failed", e);
    // The fee was written before the tender; the tender didn't happen. Put it
    // back, or a retry would charge the fee on top of itself.
    await revertCardSurcharge(staff.restaurantId, orderId, fee);
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the payment." };
  }

  // Credit the takings to this cashier's shift (best-effort — see the helper).
  if (paymentId) await stampPaymentShift(paymentId, shift?.id ?? null, staff.staffUserId);

  // Written before the receipt is built, so the change prints on the copy the
  // customer is handed rather than only on a reprint.
  await recordCashTendered(staff.restaurantId, orderId, method, tenderedCentavos);

  // Award loyalty points (best-effort) to the order's customer phone.
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  await awardPointsForOrder(staff.restaurantId, orderId, netPaid, phone);

  // Always print the receipt on an explicit cash/card settle (independent of the
  // auto-print-on-new-order toggle). Server transports print straight to the
  // printer; client transports open the ticket page from the cashier board.
  const settle = await printReceipt(staff.restaurantId, orderId);

  await notifyOrdersChanged(staff.restaurantId);
  return {
    ok: true,
    printTicket: settle.clientPrintNeeded,
    drawerKickBase64: settle.drawerKickBase64,
  };
}

export type PartialPaymentResult =
  | { ok: true; settled: boolean; remaining: number; tables: CashierTable[]; printTicket?: boolean; drawerKickBase64?: string }
  | { ok: false; error: string };

/**
 * Split / partial payment — record one tender (cash or card) toward an order's
 * net. The amount is clamped server-side to what's still owed; when the running
 * total of tenders covers the net, the order is settled (paid + closed) and the
 * receipt prints. Money is never trusted from the client.
 */
export async function recordPartialPayment(
  orderId: string,
  amountPesos: number,
  method: CounterMethod,
): Promise<PartialPaymentResult> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const requested = pesosToCentavos(Number(amountPesos) || 0);
  if (requested <= 0) return { ok: false, error: "Enter an amount." };

  const disc = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
  const credit = (await creditMap(staff.restaurantId, [orderId])).get(orderId) ?? 0;

  // Split bills carry the card fee only on the part that goes on the card: pay
  // half in cash and half by card and you're charged 3.5% of the half, not of
  // the bill. That falls out of charging the fee on the tender rather than on
  // the order.
  const surchargeBefore = await surchargeOnOrder(staff.restaurantId, orderId);
  const owedBefore = await amountStillOwed(
    staff.restaurantId,
    orderId,
    disc?.amount ?? 0,
    credit,
    surchargeBefore,
  );
  const base = Math.min(requested, owedBefore);
  const { fee } = await applyCardSurcharge(staff.restaurantId, orderId, method, base);

  const shift = await ensureShift(staff.restaurantId, staff.staffUserId, () =>
    staffLabel(staff.restaurantId, staff.staffUserId),
  );
  let settled = false;
  let remaining = 0;
  // Each tender is stamped individually: a bill split across two cashiers
  // credits each of them with the part they actually took.
  let partialPaymentId: string | null = null;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: { total: true },
      });
      if (!order) throw new Error("This order is already settled.");
      const net = netTotal(order.total, disc?.amount ?? 0, credit, surchargeBefore + fee);
      const agg = await tx.payment.aggregate({
        where: { orderId, status: "paid" },
        _sum: { amount: true },
      });
      const paidSoFar = agg._sum.amount ?? 0;
      const owed = Math.max(0, net - paidSoFar);
      if (owed <= 0) throw new Error("This order is already fully paid.");

      // The fee rides along with the tender it belongs to: the customer taps
      // for the amount they chose plus the fee on it, and the remaining balance
      // moves by the amount alone.
      const amount = Math.min(base + fee, owed);
      const p = await tx.payment.create({
        data: { orderId, amount, method, gateway: "manual", status: "paid" },
        select: { id: true },
      });
      partialPaymentId = p.id;
      remaining = owed - amount;
      if (remaining <= 0) {
        settled = true;
        // Paid in full, but it still only leaves the boards once it's cooked.
        const current = await tx.order.findFirst({
          where: { id: orderId },
          select: { status: true },
        });
        const cooked = current?.status === "done" || current?.status === "closed";
        await tx.order.updateMany({
          where: { id: orderId },
          data: {
            paymentStatus: "paid",
            billRequested: false,
            ...(cooked ? { status: "closed" as const } : {}),
          },
        });
      }
    });
  } catch (e) {
    await revertCardSurcharge(staff.restaurantId, orderId, fee);
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't record the payment." };
  }

  if (partialPaymentId) {
    await stampPaymentShift(partialPaymentId, shift?.id ?? null, staff.staffUserId);
  }

  let printTicket = false;
  let drawerKickBase64: string | undefined;
  if (settled) {
    const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
    // Award loyalty on the full net once the order is settled.
    const disc2 = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
    const credit2 = (await creditMap(staff.restaurantId, [orderId])).get(orderId) ?? 0;
    const order = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findFirst({ where: { id: orderId }, select: { total: true } }),
    );
    // No surcharge in the points base: the card fee is a cost passed through,
    // not something the customer spent with the restaurant, and earning points
    // on it would reward paying the more expensive way.
    if (order) await awardPointsForOrder(staff.restaurantId, orderId, netTotal(order.total, disc2?.amount ?? 0, credit2), phone);
    const settle = await printReceipt(staff.restaurantId, orderId);
    printTicket = settle.clientPrintNeeded;
    drawerKickBase64 = settle.drawerKickBase64;
  }

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, settled, remaining, tables: await getCashierTables(), printTicket, drawerKickBase64 };
}

/** Close (settle) an order so it leaves the active boards. */
export async function closeOrder(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        where: { id: orderId },
        data: { status: "closed", billRequested: false },
      }),
    );
  } catch (e) {
    console.error("closeOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not close the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

export interface ClosedOrder {
  id: string;
  label: string;
  total: number;
  paymentStatus: string;
  closedAt: string;
}

/**
 * Recently closed orders so the cashier can re-open one if needed.
 *
 * Covers the cashier's own shift when there is one, falling back to the
 * calendar day. Anchoring on midnight emptied this list under a night cashier
 * at 12:00 AM — the same cut that used to wipe their shift summary — leaving
 * them nothing to check the evening's tickets against.
 *
 * `total` is what was actually PAID, not order.total. The order's total is the
 * gross before discounts and store credit, so this list added up to more than
 * the accounting report and more than the drawer for any restaurant that gives
 * a senior discount. Three screens disagreeing about the day's takings is how
 * you end up trusting none of them.
 */
export async function getClosedOrders(): Promise<ClosedOrder[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  const shift = await currentShift(staff.restaurantId, staff.staffUserId);
  const since = shift?.openedAt ?? manilaStartOfDay();

  const rows = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: "closed", updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        total: true,
        paymentStatus: true,
        updatedAt: true,
        orderType: true,
        customerName: true,
        table: { select: { tableNumber: true } },
      },
    }),
  );

  // What each of those tickets actually took, from its payments.
  const paidByOrder = new Map<string, number>();
  try {
    const groups = await tenantDb(staff.restaurantId, (tx) =>
      tx.payment.groupBy({
        by: ["orderId"],
        where: { orderId: { in: rows.map((o) => o.id) }, status: "paid" },
        _sum: { amount: true },
      }),
    );
    for (const g of groups) paidByOrder.set(g.orderId, g._sum.amount ?? 0);
  } catch {
    /* fall back to the order total below */
  }

  return rows.map((o) => ({
    id: o.id,
    label:
      o.table?.tableNumber
        ? `Table ${o.table.tableNumber}`
        : o.customerName || orderTypeLabel(o.orderType),
    // An unpaid closed ticket has no payments; its total is still the figure
    // to show, since that's what was written off rather than collected.
    total: paidByOrder.get(o.id) ?? o.total,
    paymentStatus: o.paymentStatus,
    closedAt: o.updatedAt.toISOString(),
  }));
}

/** Re-open a closed order so it returns to the active board. */
export async function reopenOrder(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; closed?: ClosedOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      // Back to "done" (ready/served) so it shows on the board again; payment
      // status is left untouched so an already-paid order stays paid.
      tx.order.updateMany({
        where: { id: orderId, status: "closed" },
        data: { status: "done" },
      }),
    );
  } catch (e) {
    console.error("reopenOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not re-open the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables(), closed: await getClosedOrders() };
}

/**
 * Void an unpaid order. Requires the restaurant's cashier void PIN — so a
 * cashier can't dismiss an order without authorization. Voided orders are
 * cancelled (they leave the board and never count as sales, since sales come
 * from confirmed payments).
 */
export async function voidOrder(
  orderId: string,
  pin: string,
  reason?: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  const entered = (pin ?? "").trim();
  if (!entered) return { ok: false, error: "Enter the void PIN." };
  const reasonText = (reason ?? "").trim();
  if (!reasonText || !isVoidReason(reasonText)) return { ok: false, error: "Select a reason for the void." };

  const pinCheck = await checkVoidPin(staff.restaurantId, entered);
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const before = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: { id: true, status: true, total: true, tableId: true, creditApplied: true, giftCardId: true },
      });
      if (!before) throw new Error("Only an unpaid order can be voided.");
      // Restore any redeemed gift-card balance (the void unwinds the redemption).
      if (before.giftCardId && before.creditApplied > 0) {
        await tx.giftCard.update({
          where: { id: before.giftCardId },
          data: { balance: { increment: before.creditApplied } },
        });
        await tx.giftCardTxn.create({
          data: { restaurantId: staff.restaurantId, giftCardId: before.giftCardId, amount: before.creditApplied, kind: "restore", orderId },
        });
      }
      // Cancelled status removes it from the board; tag voidedAt for reconciliation.
      await tx.order.updateMany({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        data: { status: "cancelled", billRequested: false, voidedAt: new Date(), creditApplied: 0, giftCardId: null },
      });
      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "order.void",
        entityType: "order",
        entityId: orderId,
        reason: reasonText,
        before: { status: before.status, total: before.total },
        after: { status: "cancelled" },
      });
    });
  } catch (e) {
    console.error("voidOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not void the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/** Verifies the cashier void PIN (best-effort read — column may lag on prod). */
async function checkVoidPin(
  restaurantId: string,
  entered: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let configured: string | null = null;
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { cashierVoidPin: true } }),
    );
    configured = r?.cashierVoidPin ?? null;
  } catch {
    return { ok: false, error: "Void isn't set up yet. Ask an admin to set a void PIN." };
  }
  if (!configured) return { ok: false, error: "No void PIN set. Ask an admin to set one in Settings." };
  if (entered !== configured) return { ok: false, error: "Incorrect PIN." };
  return { ok: true };
}

export interface EditableItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number; // centavos (unit incl. modifiers × qty)
}

/** Items on an open, unpaid order — for the manager edit (void-item) view. */
export async function getOrderItems(orderId: string): Promise<EditableItem[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  const order = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findFirst({
      where: { id: orderId, paymentStatus: { not: "paid" } },
      select: {
        items: {
          select: {
            id: true,
            nameAtTime: true,
            quantity: true,
            unitPrice: true,
            modifiers: { select: { priceDeltaAtTime: true } },
          },
        },
      },
    }),
  );
  if (!order) return [];
  return order.items.map((i) => ({
    id: i.id,
    name: i.nameAtTime,
    quantity: i.quantity,
    lineTotal: (i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0)) * i.quantity,
  }));
}

/**
 * Manager edit — void a single line item from an unpaid order. Requires the
 * void PIN + a reason, recomputes the order total SERVER-SIDE from the
 * remaining items (never trusts the client), and logs to the audit trail. If
 * the last item is removed, the whole order is voided.
 */
export async function voidOrderItem(
  orderId: string,
  itemId: string,
  pin: string,
  reason?: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const entered = (pin ?? "").trim();
  if (!entered) return { ok: false, error: "Enter the void PIN." };
  const reasonText = (reason ?? "").trim();
  if (!reasonText || !isVoidReason(reasonText)) return { ok: false, error: "Select a reason." };

  const pinCheck = await checkVoidPin(staff.restaurantId, entered);
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: {
          id: true,
          total: true,
          items: {
            select: {
              id: true,
              nameAtTime: true,
              quantity: true,
              unitPrice: true,
              modifiers: { select: { priceDeltaAtTime: true } },
            },
          },
        },
      });
      if (!order) throw new Error("Only an unpaid order can be edited.");
      const target = order.items.find((i) => i.id === itemId);
      if (!target) throw new Error("Item not found on this order.");

      const lineValue = (it: (typeof order.items)[number]) =>
        (it.unitPrice + it.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0)) * it.quantity;
      const remaining = order.items.filter((i) => i.id !== itemId);
      const newTotal = remaining.reduce((s, i) => s + lineValue(i), 0);

      // Remove the line (its modifiers cascade) and recompute the order total.
      await tx.orderItem.delete({ where: { id: itemId } });

      if (remaining.length === 0) {
        // Nothing left — void the whole order.
        await tx.order.update({
          where: { id: orderId },
          data: { total: 0, status: "cancelled", billRequested: false, voidedAt: new Date() },
          select: { id: true },
        });
      } else {
        await tx.order.update({ where: { id: orderId }, data: { total: newTotal }, select: { id: true } });
      }

      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "order.item_void",
        entityType: "order_item",
        entityId: itemId,
        reason: reasonText,
        before: {
          orderId,
          item: { name: target.nameAtTime, quantity: target.quantity, lineTotal: lineValue(target) },
          orderTotal: order.total,
        },
        after: { orderTotal: remaining.length === 0 ? 0 : newTotal, orderVoided: remaining.length === 0 },
      });
    });
  } catch (e) {
    console.error("voidOrderItem failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not edit the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

export interface VoidedOrder {
  id: string;
  label: string;
  total: number;
  voidedAt: string;
}

/** Orders voided today, for end-of-shift reconciliation. */
export async function getVoidedOrders(): Promise<VoidedOrder[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  const startOfDay = manilaStartOfDay();
  try {
    const rows = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { voidedAt: { gte: startOfDay } },
        orderBy: { voidedAt: "desc" },
        take: 50,
        select: {
          id: true,
          total: true,
          voidedAt: true,
          orderType: true,
          customerName: true,
          table: { select: { tableNumber: true } },
        },
      }),
    );
    return rows.map((o) => ({
      id: o.id,
      label: o.table?.tableNumber
        ? `Table ${o.table.tableNumber}`
        : o.customerName || orderTypeLabel(o.orderType),
      total: o.total,
      voidedAt: (o.voidedAt ?? new Date()).toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Confirm a ready order's food was served to the table. */
export async function markServed(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { servedAt: new Date() } }),
    );
  } catch (e) {
    console.error("markServed failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not mark as served." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/**
 * Apply (or clear) a discount on an order — Senior Citizen / PWD / custom.
 * Recomputed server-side from the order's gross total.
 */
export async function applyDiscount(
  orderId: string,
  kind: DiscountKind,
  value?: number,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, select: { total: true } });
      if (!order) throw new Error("Order not found");
      const { amount, label } = computeDiscount(order.total, kind, value);
      await tx.order.updateMany({
        where: { id: orderId },
        data: { discountAmount: amount, discountLabel: label },
      });
    });
  } catch (e) {
    console.error("applyDiscount failed", e);
    return {
      ok: false,
      error:
        e instanceof Error && /discountAmount|discountLabel|column/i.test(e.message)
          ? "Discounts need a quick database update. Run the discount migration, then try again."
          : e instanceof Error
            ? e.message
            : "Could not apply the discount.",
    };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

// ---------------------------------------------------------------------------
// Loyalty redemption at the cashier
// ---------------------------------------------------------------------------

/** Loyalty info for an order's customer (for the redeem UI). */
export async function getOrderLoyalty(
  orderId: string,
): Promise<{ enabled: boolean; phone: string | null; points: number; pointValue: number }> {
  const staff = await requireStaff(["cashier", "admin"]);
  const cfg = await getLoyaltyConfig(staff.restaurantId);
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  const points = phone ? await getBalance(staff.restaurantId, phone) : 0;
  return { enabled: cfg.enabled, phone, points, pointValue: cfg.pointValue };
}

/** Redeem a customer's points on an order — applied as a discount. */
export async function redeemLoyalty(
  orderId: string,
  points: number,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  if (!phone) return { ok: false, error: "This order has no customer phone for loyalty." };

  const order = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findFirst({ where: { id: orderId }, select: { total: true } }),
  );
  if (!order) return { ok: false, error: "Order not found." };

  const res = await redeemPoints(staff.restaurantId, phone, points);
  if (!res.ok) return { ok: false, error: res.error };

  // Apply the redeemed value as the order discount (capped at the total).
  const amount = Math.min(order.total, res.value ?? 0);
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        where: { id: orderId },
        data: { discountAmount: amount, discountLabel: `Loyalty (${points} pts)` },
      }),
    );
  } catch (e) {
    console.error("redeemLoyalty discount failed", e);
    return { ok: false, error: "Redeemed, but couldn't apply the discount. Please retry." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

// ---------------------------------------------------------------------------
// Cashier POS — create an order directly (walk-up / phone / counter orders).
// ---------------------------------------------------------------------------

/** Menu (categories → items → modifiers) for the cashier's restaurant. */
export async function getPosMenu(): Promise<DinerCategory[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  // The one caller that sees counter-only items: boxes, repeat add-ons, staff
  // meals, and anything that doesn't survive a delivery ride.
  return getPublicMenu(staff.restaurantId, "en", { includePosOnly: true });
}

export interface PosCustomer {
  name: string;
  phone: string;
  address: string | null;
}

/**
 * Search saved customers for the POS by name or phone. Built from past
 * pickup/delivery orders (which store name/phone/address), so any customer the
 * cashier punched in before — even one who never used the website — comes back
 * with their last-known details to auto-fill. Deduped by phone, most recent first.
 */
export async function searchPosCustomers(query: string): Promise<PosCustomer[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const q = query.trim();
  if (q.length < 2) return [];
  let rows: { customerName: string | null; customerPhone: string | null; customerAddress: string | null }[] = [];
  try {
    rows = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: {
          customerPhone: { not: null },
          OR: [
            { customerName: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: { customerName: true, customerPhone: true, customerAddress: true },
      }),
    );
  } catch {
    return []; // columns not migrated yet
  }
  const seen = new Map<string, PosCustomer>();
  for (const r of rows) {
    const phone = (r.customerPhone ?? "").trim();
    if (!phone || seen.has(phone)) continue;
    seen.set(phone, { name: r.customerName ?? "", phone, address: r.customerAddress?.trim() || null });
    if (seen.size >= 8) break;
  }
  return [...seen.values()];
}

/** Tables for the cashier's restaurant (for picking where an order belongs). */
export async function getPosTables(): Promise<{ id: string; tableNumber: string }[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  return tenantDb(staff.restaurantId, (tx) =>
    tx.table.findMany({ orderBy: { tableNumber: "asc" }, select: { id: true, tableNumber: true } }),
  );
}

/**
 * Everything about a second round that has to be written best-effort.
 *
 * Three separate writes, each in its own try, and none of them able to fail the
 * order: `addedItemsAt` and `preparedAt` both ship as hand-run migrations, and
 * `servedAt` is only meaningful on a database that has that one too. The worst
 * outcome on an un-migrated database is the ticket coming back with all its
 * lines showing instead of just the new ones — the extras still get cooked,
 * which is the part that matters.
 *
 * `previousIds` is null when the ticket was still on the board, and a list of
 * the lines the kitchen had already made when it wasn't.
 */
async function markExtraRound(
  restaurantId: string,
  orderId: string,
  previousIds: string[] | null,
  addedLines: readonly { menuItemId: string | null; quantity: number }[],
): Promise<void> {
  // Stock, before anything else. An order the kitchen already finished is
  // stamped as deducted, so the deduction that runs when it's finished a second
  // time returns immediately — without this, a second round is cooked and sold
  // and never comes off the shelf. Only the new lines, and only when the first
  // round has genuinely been counted; otherwise the normal whole-order
  // deduction is still to come and would count these twice.
  try {
    const alreadyCounted = await tenantDb(restaurantId, (tx) =>
      tx.order.findFirst({ where: { id: orderId }, select: { inventoryDeductedAt: true } }),
    );
    if (alreadyCounted?.inventoryDeductedAt) {
      await deductForOrder(restaurantId, orderId, addedLines);
    }
  } catch {
    /* inventory must never block the till */
  }

  // Stamped on every append, board or not, so the card can flag extras on a
  // ticket the cook is still holding as well as on one that came back.
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { addedItemsAt: new Date() } }),
    );
  } catch {
    /* addedItemsAt not migrated — no badge, everything else still works */
  }

  if (!previousIds) return;

  // The ticket came back. Tick off what the kitchen already made, so what's
  // left unticked on the card IS the extra order — which is the whole ask.
  if (previousIds.length > 0) {
    try {
      await tenantDb(restaurantId, (tx) =>
        tx.orderItem.updateMany({
          where: { id: { in: previousIds }, order: { restaurantId } },
          data: { preparedAt: new Date() },
        }),
      );
    } catch {
      /* preparedAt not migrated — the whole ticket shows, nothing is lost */
    }
  }

  // It was marked served, and now there's food outstanding again. Leaving the
  // stamp would show the cashier a second round as already served.
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { servedAt: null } }),
    );
  } catch {
    /* servedAt not migrated */
  }
}

/**
 * Add more items to an EXISTING open, unpaid order — the "customer ordered,
 * then wants to add another item a few minutes later" case. Prices are built
 * server-side (never trusted from the client) and appended; the order total is
 * bumped by the added items' value. The kitchen display updates via realtime;
 * print-mode kitchens get a fresh ticket so the added items reach the line.
 *
 * If the kitchen had already finished the ticket, the extras would land on the
 * bill and nowhere else — the cook's screen is a queue of unfinished orders, so
 * a served table ordering more had to be spotted by somebody and reopened by
 * hand. Appending now puts the ticket back on the board by itself, with the
 * first round ticked off so what's showing is the extra.
 */
export async function addItemsToOrder(
  orderId: string,
  lines: OrderLineInput[],
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string; printKitchen?: boolean; printOrderId?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  if (!lines?.length) return { ok: false, error: "Add at least one item." };

  let built;
  try {
    built = await buildValidatedOrder(staff.restaurantId, lines, { channel: "pos" });
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "Could not add the items." };
  }

  // Filled in when the ticket had already been cooked, so the kitchen has to be
  // told about the second round once the write commits. Held on an object
  // rather than a `let` so assigning it inside the transaction callback stays
  // visible to the type checker out here.
  const reopened: { previousLineIds: string[] | null } = { previousLineIds: null };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      // Only an OPEN (in-kitchen) order that isn't paid yet can take more items.
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" }, status: { in: [...OPEN] } },
        select: {
          id: true,
          total: true,
          status: true,
          // Read BEFORE the append, so "the lines that were already here" can't
          // accidentally include the ones being added right now.
          items: { select: { id: true, preparedAt: true } },
        },
      });
      if (!order) throw new Error("This order can no longer be edited.");
      // Nested create appends the new lines; select keeps this safe on a lagging schema.
      await tx.order.update({
        where: { id: orderId },
        data: {
          total: order.total + built.total,
          items: { create: orderItemsCreate(built.items) },
          // Back in front of the kitchen. A ticket the cook has already finished
          // is off the display, so without this the extras exist only on the
          // bill and nobody cooks them — the whole point of this branch.
          ...(needsKitchenReopen(order.status) ? { status: reopenStatus() } : {}),
        },
        select: { id: true },
      });
      if (needsKitchenReopen(order.status)) {
        reopened.previousLineIds = previousLineIds(order.items);
      }
    });
  } catch (e) {
    console.error("addItemsToOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the items." };
  }

  // Everything below is best-effort and deliberately outside the transaction
  // above: every column it touches ships as a hand-run migration, and none of
  // them is worth failing an order the kitchen is already cooking.
  await markExtraRound(staff.restaurantId, orderId, reopened.previousLineIds, built.items);

  // Count these servings toward each item's daily cap (best-effort, own tx).
  await recordServingsSold(staff.restaurantId, built.items);
  await recordVariantsSold(
    staff.restaurantId,
    built.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
  );

  await notifyOrdersChanged(staff.restaurantId);
  // No kitchen display → reprint so the kitchen sees the updated order.
  const kitchen = await printKitchenIfNeeded(staff.restaurantId, orderId);
  return {
    ok: true,
    tables: await getCashierTables(),
    printKitchen: kitchen.clientPrintNeeded,
    printOrderId: kitchen.clientPrintNeeded ? orderId : undefined,
  };
}

/**
 * Create an order from the cashier POS. Cashier-created orders are already
 * accepted, so they go straight to the kitchen (status "new") and print.
 */
export async function createCashierOrder(input: {
  orderType?: OrderTypeKey;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  lines: OrderLineInput[];
  /**
   * Take the money as part of ringing it up — the pay-before-you-sit-down
   * flow. Omitted, the order is created unpaid exactly as it always was.
   */
  payNow?: { method: CounterMethod; tenderedCentavos?: number };
}): Promise<{
  ok: boolean;
  tables?: CashierTable[];
  error?: string;
  printKitchen?: boolean;
  printOrderId?: string;
  /** Set when the order was created but the payment didn't record. */
  paymentError?: string;
  paid?: boolean;
  printReceipt?: boolean;
  drawerKickBase64?: string;
}> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const orderType = input.orderType ?? "dine_in";
  // No table needed. Plenty of shops take the order at the counter and seat
  // people afterwards, or have no table plan at all — requiring one stopped
  // them ringing up a dine-in order they were standing in front of. Without a
  // table the ticket gets the day's next number instead, which is what the
  // customer gets called by anyway.
  if (orderType !== "dine_in" && !input.customerName?.trim()) {
    return { ok: false, error: "Enter the customer's name." };
  }
  if (orderType === "delivery" && !input.customerAddress?.trim()) {
    return { ok: false, error: "Enter the delivery address." };
  }
  if (!input.lines?.length) return { ok: false, error: "Add at least one item." };

  let built;
  try {
    built = await buildValidatedOrder(staff.restaurantId, input.lines, { channel: "pos" });
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "Could not build the order." };
  }

  // A dine-in order with no table is called by a number instead. Worked out
  // here rather than inside the transaction: see nextOrderNumberSafe.
  const ticketNumber =
    orderType === "dine_in" && !input.tableId
      ? await nextOrderNumberSafe(staff.restaurantId)
      : null;

  let orderId: string;
  try {
    const order = await tenantDb(staff.restaurantId, async (tx) => {
      // Dine-in keeps the data minimal so it still works before the
      // pickup/delivery migration runs (orderType defaults to dine_in in DB).
      const base = {
        restaurantId: staff.restaurantId,
        status: "new" as const,
        paymentStatus: "unpaid" as const,
        total: built.total,
        items: { create: orderItemsCreate(built.items) },
      };

      if (orderType === "dine_in") {
        if (input.tableId) {
          const table = await tx.table.findFirst({
            where: { id: input.tableId },
            select: { id: true },
          });
          if (!table) throw new Error("That table doesn't exist.");
          return tx.order.create({ data: { ...base, tableId: table.id }, select: { id: true } });
        }
        // No table: give it the day's next ticket number. Resolved before the
        // transaction opened, and null when the column isn't there yet — the
        // order still goes through, it just has no number to call out.
        return tx.order.create({
          data: { ...base, ...(ticketNumber != null ? { orderNumber: ticketNumber } : {}) },
          select: { id: true },
        });
      }

      return tx.order.create({
        data: {
          ...base,
          orderType,
          customerName: input.customerName?.trim() || null,
          customerPhone: input.customerPhone?.trim() || null,
          customerAddress: input.customerAddress?.trim() || null,
        },
        select: { id: true },
      });
    });
    orderId = order.id;
    // Who rang it up, shown on the floor so a table traces back to a person.
    // Best-effort and written separately: attribution must never be the reason
    // an order fails to open, and these columns may not be migrated yet.
    try {
      const name = await staffLabel(staff.restaurantId, staff.staffUserId);
      await tenantDb(staff.restaurantId, (tx) =>
        tx.order.updateMany({
          where: { id: order.id },
          data: { openedByStaffId: staff.staffUserId, openedByName: name },
        }),
      );
    } catch {
      /* columns not migrated yet */
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create the order.";
    if (/orderType|customer|column/i.test(msg)) {
      return {
        ok: false,
        error: "Pickup/delivery needs a quick database update. Run the migration, then try again.",
      };
    }
    return { ok: false, error: msg };
  }

  // Count these servings toward each item's daily cap (best-effort, own tx).
  await recordServingsSold(staff.restaurantId, built.items);
  await recordVariantsSold(
    staff.restaurantId,
    built.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
  );

  await notifyOrdersChanged(staff.restaurantId);

  // Money first, kitchen second, when the shop takes payment up front. A failed
  // payment then means no kitchen ticket — which is the whole point of paying
  // first — and the order is still on the board to be settled by hand.
  let paymentError: string | undefined;
  let settled: SettleOutcome | null = null;
  if (input.payNow) {
    settled = await settleAtCounter(
      staff,
      orderId,
      input.payNow.method,
      input.payNow.tenderedCentavos,
    );
    if (!settled.ok) paymentError = settled.error;
  }

  await autoPrintIfEnabled(staff.restaurantId, orderId);
  // No kitchen display → print a kitchen ticket for the new order.
  const kitchen = await printKitchenIfNeeded(staff.restaurantId, orderId);

  // Auto-enroll pickup/delivery customers into loyalty (name + phone given).
  if (orderType !== "dine_in" && input.customerPhone?.trim()) {
    try {
      const cfg = await getLoyaltyConfig(staff.restaurantId);
      if (cfg.enabled) await enrollAccount(staff.restaurantId, input.customerPhone, input.customerName);
    } catch {
      /* best-effort */
    }
  }
  return {
    ok: true,
    tables: await getCashierTables(),
    printKitchen: kitchen.clientPrintNeeded,
    printOrderId: kitchen.clientPrintNeeded ? orderId : undefined,
    // ok:true even when the payment failed, deliberately. The ORDER exists —
    // telling the till nothing happened would have them punch it a second time,
    // and a duplicate ticket is worse than an unpaid one.
    paid: settled?.ok === true,
    paymentError,
    printReceipt: settled?.ok === true ? settled.printTicket : undefined,
    drawerKickBase64: settled?.ok === true ? settled.drawerKickBase64 : undefined,
  };
}

/**
 * Void an order that has already been settled — a reversal, not a dismissal.
 *
 * Kept separate from voidOrder on purpose. That one refuses anything paid,
 * which is right for a live bill: cancelling money someone has handed over
 * shouldn't be one tap away on a busy till. But a test order, or a genuine
 * mistake rung up and closed, otherwise stays in the sales figures forever with
 * no way to take it out.
 *
 * The reversal marks the payments `refunded` rather than deleting them, so the
 * money that was recorded is still visible in the audit trail — it just stops
 * counting as a sale, which is what every report keys on.
 */
export async function voidClosedOrder(
  orderId: string,
  pin: string,
  reason?: string,
): Promise<{ ok: boolean; closed?: ClosedOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  const entered = (pin ?? "").trim();
  if (!entered) return { ok: false, error: "Enter the void PIN." };
  const reasonText = (reason ?? "").trim();
  if (!reasonText || !isVoidReason(reasonText)) {
    return { ok: false, error: "Select a reason for the void." };
  }
  const pinCheck = await checkVoidPin(staff.restaurantId, entered);
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const before = await tx.order.findFirst({
        where: { id: orderId, status: "closed" },
        select: { id: true, status: true, total: true, paymentStatus: true },
      });
      if (!before) throw new Error("That order isn't closed — void it from the board instead.");

      // Reverse the money first: if anything below fails, a half-voided order
      // that still counts as a sale is the safer of the two wrong states.
      const reversed = await tx.payment.updateMany({
        where: { orderId, status: "paid" },
        data: { status: "refunded" },
      });

      await tx.order.updateMany({
        where: { id: orderId },
        data: {
          status: "cancelled",
          paymentStatus: "refunded",
          billRequested: false,
          voidedAt: new Date(),
        },
      });

      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "order.void_closed",
        entityType: "order",
        entityId: orderId,
        reason: reasonText,
        before: { status: before.status, total: before.total, paymentStatus: before.paymentStatus },
        after: { status: "cancelled", paymentStatus: "refunded", paymentsReversed: reversed.count },
      });
    });
  } catch (e) {
    console.error("voidClosedOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not void that order." };
  }

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, closed: await getClosedOrders() };
}
