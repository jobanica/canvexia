"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { writeOffStock } from "@/server/pharmacy/writeoffs";
import { setAlertThreshold } from "@/server/pharmacy/settings";

/**
 * The two things this screen writes.
 *
 * Both re-check permission server-side. The buttons are hidden without it,
 * which is a convenience; these are the checks.
 */

export type AlertActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): AlertActionState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "You do not have permission to do that."
        : "Your session has expired. Sign in again.",
  };
}

/**
 * Write off a whole expired batch, from the row that reported it.
 *
 * THE WHOLE BATCH, and only from the expiring list. A partial write-off is a
 * decision with a quantity in it and belongs on the write-off screen, which
 * already exists and asks for one. This button exists for the ordinary case
 * the alerts page is FOR: the batch is past its date, none of it may be
 * dispensed, and all of it comes off.
 */
export async function writeOffExpired(
  _prev: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const parsed = z
    .object({
      batchId: z.string().uuid(),
      quantity: z.coerce.number().int().positive(),
    })
    .safeParse({
      batchId: formData.get("batchId"),
      quantity: formData.get("quantity"),
    });
  if (!parsed.success) return { status: "error", message: "That batch didn't come through." };

  const res = await writeOffStock({
    pharmacyId: staff.pharmacyId,
    values: {
      batchId: parsed.data.batchId,
      quantity: parsed.data.quantity,
      reason: "expired",
      recipient: null,
      notes: "Written off from the expiry alert",
    },
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/alerts");
  revalidatePath("/");
  revalidatePath("/catalogue");
  return {
    status: "done",
    message: `${res.productName} — ${res.quantity} written off.`,
  };
}

/**
 * How far ahead the expiry alert looks.
 *
 * BOUNDED 7..730 HERE rather than by a CHECK constraint, so a typo comes back
 * as a sentence instead of a failed save. A week is the shortest notice worth
 * having; two years is longer than most stock lives.
 */
export async function saveAlertWindow(
  _prev: AlertActionState,
  formData: FormData,
): Promise<AlertActionState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const parsed = z.coerce
    .number()
    .int()
    .min(7, "A week is the shortest notice worth having.")
    .max(730, "Two years is longer than most stock lives.")
    .safeParse(formData.get("expiryAlertDays"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "That isn't a number of days." };
  }

  const saved = await setAlertThreshold({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    expiryAlertDays: parsed.data,
  });
  if (!saved) return { status: "error", message: "That pharmacy no longer exists." };

  revalidatePath("/alerts");
  return { status: "done", message: `Now alerting ${parsed.data} days ahead.` };
}
