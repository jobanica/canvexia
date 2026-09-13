"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { endShift } from "./shift-session";

export type EndShiftState = { ok?: boolean; error?: string } | null;

/**
 * Close the current cashier's shift.
 *
 * Called AFTER the Z-report has printed — once the shift is closed its takings
 * are no longer reachable as "current", so printing first is the difference
 * between a cashier having their numbers and having to go ask the owner.
 *
 * Signing out is left to the caller: closing the shift and ending the session
 * are separate things, and a cashier who closes their drawer to hand over to
 * the next shift shouldn't be forced to log out of a till they're still at.
 */
export async function endMyShift(): Promise<EndShiftState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { error: "Not allowed." };
  }
  const closed = await endShift(staff.restaurantId, staff.staffUserId);
  return closed ? { ok: true } : { error: "No open shift to close." };
}
