import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { isShiftCurrent, staleShiftCutoff, MAX_SHIFT_HOURS } from "@/lib/orders/shift-window";

/**
 * One cashier's turn at the till.
 *
 * The shift is what makes separate logins mean something. Every payment and
 * cash-out is stamped with the open shift, so the end-of-shift summary counts
 * THAT cashier's drawer instead of the whole restaurant's day — which is what
 * it used to do, and why the second cashier of the day inherited the first
 * one's takings.
 *
 * Deliberately NOT a gate on anything. A shift decides whose money it is; it
 * never decides who may serve a table. Any cashier can still settle any order,
 * because the alternative strands a customer the moment the person who served
 * them goes on break.
 *
 * Written through systemDb with an explicit restaurantId: this is called from
 * paths that must not fail on an RLS edge, and every query is scoped by hand.
 */

export interface OpenShift {
  id: string;
  staffUserId: string;
  staffName: string;
  openedAt: Date;
}

/** Best-effort: null when the table isn't migrated yet, so nothing breaks. */
export async function currentShift(
  restaurantId: string,
  staffUserId: string,
): Promise<OpenShift | null> {
  try {
    const row = await systemDb((tx) =>
      tx.cashierShift.findFirst({
        where: { restaurantId, staffUserId, status: "open" },
        orderBy: { openedAt: "desc" },
        select: { id: true, staffUserId: true, staffName: true, openedAt: true },
      }),
    );
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * The cashier's open shift, opening one if they don't have it yet.
 *
 * Called from the cashier screen and from every money path, so a shift starts
 * by itself the first time someone works — nobody has to remember to press
 * "start", and forgetting can't silently un-attribute a whole evening.
 */
export async function ensureShift(
  restaurantId: string,
  staffUserId: string,
  resolveName: () => Promise<string>,
): Promise<OpenShift | null> {
  // ONE query on the common path. This sits in front of every settle, so the
  // stale sweep and the name lookup are deferred to the rare case where a shift
  // is actually being opened — a cashier shouldn't pay four round-trips to ring
  // up a bill.
  const existing = await currentShift(restaurantId, staffUserId);
  // Bounded by how long the shift has run, NOT by the calendar day. A night
  // cashier who opened at 6 PM must still own their own shift at 12:01 AM;
  // ending it at midnight silently moved their evening's takings into a new,
  // empty shift and lost them from the summary they were about to print.
  if (existing && isShiftCurrent(existing.openedAt)) return existing;

  // Either nothing open, or something someone never signed out of.
  if (existing) await autoCloseStale(restaurantId);

  const staffName = await resolveName();
  try {
    const row = await systemDb((tx) =>
      tx.cashierShift.create({
        data: { restaurantId, staffUserId, staffName },
        select: { id: true, staffUserId: true, staffName: true, openedAt: true },
      }),
    );
    return row;
  } catch {
    // Lost a race with another tab — the partial unique index rejected the
    // second insert, which is exactly what it's for. Re-read the winner.
    return currentShift(restaurantId, staffUserId);
  }
}

/**
 * Close the shift. The Z-report is printed by the caller BEFORE this runs —
 * once it's closed the totals are no longer reachable as "current".
 */
export async function endShift(
  restaurantId: string,
  staffUserId: string,
  reason = "ended",
): Promise<boolean> {
  try {
    const res = await systemDb((tx) =>
      tx.cashierShift.updateMany({
        where: { restaurantId, staffUserId, status: "open" },
        data: { status: "closed", closedAt: new Date(), closedReason: reason },
      }),
    );
    return res.count > 0;
  } catch {
    return false;
  }
}

/**
 * Record which cashier and shift a payment belongs to.
 *
 * Written AFTER the payment, not inside its transaction, and deliberately:
 * these columns may not exist on a live database that hasn't run the migration
 * yet, and a failed attribution must never cost the restaurant a settled sale.
 * An unstamped payment simply doesn't appear in anyone's shift summary.
 */
export async function stampPaymentShift(
  paymentId: string,
  shiftId: string | null,
  staffUserId: string,
): Promise<void> {
  if (!shiftId) return;
  try {
    await systemDb((tx) =>
      tx.payment.updateMany({ where: { id: paymentId }, data: { shiftId, staffUserId } }),
    );
  } catch {
    /* columns not migrated yet */
  }
}

/** Same, for a cash-out taken from the drawer. */
export async function stampCashMovementShift(
  cashMovementId: string,
  shiftId: string | null,
): Promise<void> {
  if (!shiftId) return;
  try {
    await systemDb((tx) =>
      tx.cashMovement.updateMany({ where: { id: cashMovementId }, data: { shiftId } }),
    );
  } catch {
    /* column not migrated yet */
  }
}

/**
 * Close shifts nobody signed out of.
 *
 * Cashiers routinely don't sign out — they close the tab, or the session
 * expires. Without this the shift stays open forever and tomorrow's takings
 * pile onto yesterday's, which is the exact bug shifts were added to fix.
 *
 * Measured in hours open rather than "before midnight", so a shift that runs
 * across midnight survives the night it was worked. See lib/orders/shift-window.
 */
export async function autoCloseStale(restaurantId: string): Promise<number> {
  try {
    const res = await systemDb((tx) =>
      tx.cashierShift.updateMany({
        where: { restaurantId, status: "open", openedAt: { lt: staleShiftCutoff() } },
        data: {
          status: "closed",
          closedAt: new Date(),
          closedReason: `auto_after_${MAX_SHIFT_HOURS}h`,
        },
      }),
    );
    return res.count;
  } catch {
    return 0;
  }
}
