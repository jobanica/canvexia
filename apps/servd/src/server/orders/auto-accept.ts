import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { autoPrintIfEnabled, printKitchenIfNeeded } from "@/server/printing/print";
import { autoAcceptCutoff, normalizeAutoAcceptSeconds } from "@/lib/orders/auto-accept";

/**
 * Accept online orders nobody answered in time.
 *
 * Runs as a SWEEP off the screens that show the incoming queue, rather than
 * from a scheduler, and that is a deliberate choice rather than a shortcut:
 * the shortest interval a cron can run at is a minute, and the wait being asked
 * for here is ten seconds. The merchant screen and the cashier board both poll
 * every few seconds anyway, so the queue being open is what drives this — which
 * is exactly the situation the feature is for. "The tablet is on the counter
 * and nobody has looked at it."
 *
 * The consequence, stated plainly because it decides whether this is the right
 * feature for a shop: with NO staff screen open anywhere, nothing sweeps, and
 * the order waits for a person as it always did. Auto-accept shortens the gap
 * between an order arriving and the kitchen starting it; it is not a way to run
 * a shop with nobody in it.
 *
 * Everything here is best-effort. It is called from read paths that must keep
 * working — a failure to auto-accept can never be the reason a cashier's board
 * fails to load.
 */

/** Read the shop's wait. Its own query and catch: the column ships as a hand-run migration. */
async function autoAcceptWait(restaurantId: string): Promise<number | null> {
  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.findFirst({
        where: { restaurantId },
        select: { autoAcceptSeconds: true },
      }),
    );
    return normalizeAutoAcceptSeconds(row?.autoAcceptSeconds);
  } catch {
    return null; // not migrated → off, which is the safe direction
  }
}

/**
 * Accept every pending order that has waited longer than the shop's setting.
 * Returns the ids accepted — empty when the feature is off, which is the
 * overwhelmingly common case and costs one small query.
 */
export async function runAutoAccept(restaurantId: string): Promise<string[]> {
  const wait = await autoAcceptWait(restaurantId);
  const cutoff = autoAcceptCutoff(wait);
  if (!cutoff) return [];

  // ONLINE orders only — tableId null, the same filter the merchant screen
  // uses. The setting lives in the online website settings and the screen it
  // describes shows nothing else, so a dine-in QR order still waits for a
  // person at the till, as it always has.
  //
  // And never an ADVANCE order: one placed at noon for tomorrow evening is
  // pending on purpose, is handled on its own page, and being "older than ten
  // seconds" says nothing about whether the kitchen should start it. Cooking
  // tomorrow's dinner today is the one mistake this feature could make that
  // costs real food.
  const base = { tableId: null, status: "pending" as const, createdAt: { lte: cutoff } };
  const take = 10; // a bound, so switching this on with a backlog sends a
  //                 manageable batch rather than fifty tickets at once; the
  //                 rest follow on the next sweep, seconds later.

  let due: { id: string }[] = [];
  try {
    due = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { ...base, scheduledFor: null },
        orderBy: { createdAt: "asc" },
        take,
        select: { id: true },
      }),
    );
  } catch {
    // scheduledFor ships as a hand-run migration. A database without the column
    // cannot hold an advance order, so there is nothing to exclude and the
    // unfiltered query is exactly equivalent there.
    try {
      due = await tenantDb(restaurantId, (tx) =>
        tx.order.findMany({ where: base, orderBy: { createdAt: "asc" }, take, select: { id: true } }),
      );
    } catch {
      return [];
    }
  }
  if (due.length === 0) return [];

  const accepted: string[] = [];
  for (const order of due) {
    try {
      // Guarded by status, exactly as the manual accept is: if a merchant taps
      // Accept in the same second, or a second tablet sweeps at the same time,
      // whoever loses the race updates nothing and moves on.
      const res = await tenantDb(restaurantId, (tx) =>
        tx.order.updateMany({ where: { id: order.id, status: "pending" }, data: { status: "new" } }),
      );
      if (res.count === 0) continue;
      accepted.push(order.id);
    } catch {
      /* leave it pending — a person can still accept it */
    }
  }
  if (accepted.length === 0) return [];

  // Print the same tickets a tapped accept would print. Only the server-driven
  // transports (network bridge, cloud poll) can be reached from here: a
  // Bluetooth or print-dialog printer is paired inside somebody's browser, and
  // there is no guarantee a browser is involved in this sweep at all. The
  // settings card says so rather than leaving it to be discovered at the pass.
  for (const id of accepted) {
    try {
      await autoPrintIfEnabled(restaurantId, id);
      await printKitchenIfNeeded(restaurantId, id);
    } catch {
      /* never block acceptance on a printer */
    }
  }

  await notifyOrdersChanged(restaurantId);
  return accepted;
}
