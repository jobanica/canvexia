"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { deductForOrder } from "@/server/inventory/deduct";
import { formatOrderNumber } from "@/lib/orders/order-number";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";
import { manilaStartOfDay } from "@/lib/time/manila";
import { kitchenShowsAddress } from "@/server/printing/kitchen-options";
import type { KitchenOrder } from "@/lib/orders/types";

const ACTIVE = ["new", "preparing"] as const;

/** Active orders (new + preparing) for the logged-in staff's restaurant. */
export async function getKitchenOrders(): Promise<KitchenOrder[]> {
  const staff = await requireStaff(["kitchen", "admin", "cashier"]);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: { in: [...ACTIVE] } },
      orderBy: { createdAt: "asc" },
      // Explicit select so a schema lag (newer columns) can't break this query.
      select: {
        id: true,
        status: true,
        createdAt: true,
        total: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            id: true,
            nameAtTime: true,
            quantity: true,
            note: true,
            modifiers: { select: { nameAtTime: true } },
          },
        },
      },
    }),
  );

  return decorate(staff.restaurantId, orders);
}

type RawKitchenOrder = {
  id: string;
  status: string;
  createdAt: Date;
  total: number;
  table: { tableNumber: string } | null;
  items: {
    id: string;
    nameAtTime: string;
    quantity: number;
    note: string | null;
    modifiers: { nameAtTime: string }[];
  }[];
};

/**
 * Which lines the kitchen has already ticked off.
 *
 * Read separately and best-effort: `preparedAt` ships as a hand-run migration,
 * and selecting it inline would take the whole kitchen display down on a
 * database that hasn't run the file yet. No column means nothing is ticked,
 * which is how the board behaved before this existed.
 */
async function preparedMap(restaurantId: string, orderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (orderIds.length === 0) return out;
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.orderItem.findMany({
        where: { orderId: { in: orderIds }, preparedAt: { not: null } },
        select: { id: true, preparedAt: true },
      }),
    );
    for (const r of rows) if (r.preparedAt) out.set(r.id, r.preparedAt.toISOString());
  } catch {
    /* preparedAt column not migrated yet */
  }
  return out;
}

/**
 * When each ticket last had items added to it.
 *
 * Its own query, best-effort: `addedItemsAt` ships as a hand-run migration, and
 * selecting it alongside the rest would take the whole kitchen display down on
 * a database that hasn't run the file. No column means no badge, which is how
 * the board read before extras were flagged at all.
 */
async function addedItemsMap(restaurantId: string, orderIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (orderIds.length === 0) return out;
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: orderIds }, addedItemsAt: { not: null } },
        select: { id: true, addedItemsAt: true },
      }),
    );
    for (const r of rows) if (r.addedItemsAt) out.set(r.id, r.addedItemsAt.toISOString());
  } catch {
    /* addedItemsAt column not migrated yet */
  }
  return out;
}

/**
 * Adds the card title and the type line. Shared by the live queue and the
 * history so a ticket reads identically whichever list it's in — a cook
 * checking what they just closed shouldn't have to re-read a different layout.
 */
async function decorate(
  restaurantId: string,
  orders: RawKitchenOrder[],
): Promise<KitchenOrder[]> {
  // Only asked for when the kitchen actually works by zone — otherwise the
  // address isn't fetched at all, rather than fetched and hidden.
  const showAddress = await kitchenShowsAddress(restaurantId);

  // Best-effort pickup/delivery/counter labels (columns may lag on prod).
  const labels = new Map<string, string>();
  const types = new Map<string, string>();
  const addresses = new Map<string, string>();
  const scheduled = new Map<string, string>();
  const prepared = await preparedMap(restaurantId, orders.map((o) => o.id));
  const addedItems = await addedItemsMap(restaurantId, orders.map((o) => o.id));
  try {
    const meta = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        // Dine-in is included when it carries a ticket number: a shop that
        // rings up at the counter and seats people afterwards has dine-in
        // orders with no table, and those are called by number. Without this
        // they reached the kitchen labelled "—".
        where: {
          id: { in: orders.map((o) => o.id) },
          OR: [{ orderType: { not: "dine_in" } }, { orderNumber: { not: null } }],
        },
        select: {
          id: true,
          orderType: true,
          customerName: true,
          orderNumber: true,
          scheduledFor: true,
          ...(showAddress ? { customerAddress: true as const } : {}),
        },
      }),
    );
    for (const m of meta) {
      const addr = (m as { customerAddress?: string | null }).customerAddress?.trim();
      if (showAddress && m.orderType === "delivery" && addr) addresses.set(m.id, addr);
      if (m.scheduledFor) scheduled.set(m.id, m.scheduledFor.toISOString());
      // A counter/stall order shows its big daily ticket number to the kitchen.
      // The type reads the same word here as on the cashier screen and the
      // receipt — the kitchen assembles from all three.
      const label = orderTypeLabelWithEmoji(m.orderType);
      if (m.orderNumber != null) {
        labels.set(m.id, formatOrderNumber(m.orderNumber));
        types.set(m.id, label);
        continue;
      }
      // A dine-in order only reaches here with a number; without one the
      // table number the board already has is the right title.
      if (m.orderType === "dine_in") continue;
      // Title = who the order is for; the type shows on its own line.
      labels.set(m.id, m.customerName?.trim() || "Customer");
      types.set(m.id, label);
    }
  } catch {
    /* not migrated yet */
  }

  return orders.map((o) => ({
    id: o.id,
    tableNumber: labels.get(o.id) ?? o.table?.tableNumber ?? "—",
    typeLabel: types.get(o.id) ?? orderTypeLabelWithEmoji("dine_in"),
    status: o.status as KitchenOrder["status"],
    createdAt: o.createdAt.toISOString(),
    total: o.total,
    customerAddress: addresses.get(o.id) ?? null,
    scheduledFor: scheduled.get(o.id) ?? null,
    addedItemsAt: addedItems.get(o.id) ?? null,
    items: o.items.map((it) => ({
      id: it.id,
      name: it.nameAtTime,
      quantity: it.quantity,
      note: it.note,
      modifiers: it.modifiers.map((m) => m.nameAtTime),
      preparedAt: prepared.get(it.id) ?? null,
    })),
  }));
}

/**
 * Tick a line off — or put it back — as the kitchen plates it.
 *
 * A working aid and nothing more: it doesn't move the order's status, doesn't
 * touch stock, and doesn't decide when the ticket is done. The cook still
 * presses "Mark ready" when the whole order is up. What it buys is the thing
 * that was actually asked for: on a five-item ticket, seeing at a glance which
 * two are still to come instead of re-reading the list every time.
 *
 * Toggling rather than one-way, because the commonest tap on a busy pass is the
 * wrong one, and a cook who can't undo will stop using it.
 *
 * Written straight to the database rather than held on the tablet, so all three
 * screens agree — the whole point is that the person at the pass and the person
 * at the fryer are looking at the same ticket.
 */
export async function toggleItemPrepared(
  orderItemId: string,
  prepared: boolean,
): Promise<{ ok: boolean; orders?: KitchenOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["kitchen", "admin", "cashier"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    // updateMany, scoped through the order's restaurant: a stale tablet tapping
    // a line from a ticket that has already left the board is a no-op, not a
    // crash, and never reaches another restaurant's row.
    await tenantDb(staff.restaurantId, (tx) =>
      tx.orderItem.updateMany({
        where: { id: orderItemId, order: { restaurantId: staff.restaurantId } },
        data: { preparedAt: prepared ? new Date() : null },
      }),
    );
  } catch (e) {
    console.error("toggleItemPrepared failed", e);
    return {
      ok: false,
      error:
        "Ticking items off needs one database update. Run prisma/manual/add-item-prepared-and-refunds.sql, then try again.",
    };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, orders: await getKitchenOrders() };
}

/**
 * Advances an order's status (new → preparing → done). Kitchen + admin only.
 * Returns the refreshed active list so the caller can update instantly.
 */
export async function advanceOrderStatus(
  orderId: string,
  toStatus: "preparing" | "done",
): Promise<{ ok: boolean; orders?: KitchenOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["kitchen", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  try {
    // updateMany never throws on a no-match (unlike update), so a stale tap or a
    // race with another tablet can't crash the action.
    const res = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { status: toStatus } }),
    );
    if (res.count === 0) return { ok: false, error: "That order is no longer active." };

    // Consumption happens when the kitchen finishes the order (best-effort).
    if (toStatus === "done") {
      await deductForOrder(staff.restaurantId, orderId);

      // The other half of "paid AND cooked": a takeout order paid up front has
      // nothing left to do at the till, so finishing it here closes it. An
      // unpaid order stays on the cashier board waiting to be settled.
      try {
        await tenantDb(staff.restaurantId, (tx) =>
          tx.order.updateMany({
            where: { id: orderId, status: "done", paymentStatus: "paid" },
            data: { status: "closed" },
          }),
        );
      } catch {
        /* leave it on the board rather than lose the order */
      }
    }

    // Signal other screens (cashier, diner phones, other kitchen tablets).
    await notifyOrdersChanged(staff.restaurantId);

    return { ok: true, orders: await getKitchenOrders() };
  } catch (e) {
    console.error("advanceOrderStatus failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the order." };
  }
}

/**
 * Recently finished tickets, newest first.
 *
 * The kitchen display is a queue, so a ticket advanced by mistake — a stray tap
 * on a busy screen, or the wrong card in a row of three — used to vanish with
 * no way back, and the food never got made. This is the way back.
 */
export async function getKitchenHistory(): Promise<KitchenOrder[]> {
  const staff = await requireStaff(["kitchen", "admin", "cashier"]);
  const since = manilaStartOfDay();
  try {
    const orders = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { status: { in: ["done", "closed"] }, updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: {
          id: true,
          status: true,
          createdAt: true,
          total: true,
          table: { select: { tableNumber: true } },
          items: {
            select: {
              id: true,
              nameAtTime: true,
              quantity: true,
              note: true,
              modifiers: { select: { nameAtTime: true } },
            },
          },
        },
      }),
    );
    return decorate(staff.restaurantId, orders);
  } catch {
    return [];
  }
}

/**
 * Put a finished ticket back in the queue.
 *
 * Goes to `preparing`, not `new`: the food was at least started, and dropping
 * it back to the top of a busy queue as if it had just arrived would lose the
 * fact that a customer has already been waiting.
 *
 * Deliberately allowed for a CLOSED order too. A takeout paid up front closes
 * itself the moment the kitchen marks it done, so "closed" is exactly the state
 * a mis-tapped ticket lands in — refusing to reopen those would leave the one
 * case this exists for unfixable.
 */
export async function reopenKitchenOrder(
  orderId: string,
): Promise<{ ok: boolean; orders?: KitchenOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["kitchen", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  try {
    const res = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        // Never resurrect a cancelled/voided order — that one was deliberate.
        where: { id: orderId, status: { in: ["done", "closed"] } },
        data: { status: "preparing" },
      }),
    );
    if (res.count === 0) return { ok: false, error: "That ticket can't be brought back." };
    await notifyOrdersChanged(staff.restaurantId);
    return { ok: true, orders: await getKitchenOrders() };
  } catch (e) {
    console.error("reopenKitchenOrder failed", e);
    return { ok: false, error: "Couldn't bring that ticket back." };
  }
}
