"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { closeShift, openShift } from "@/server/pharmacy/shifts";
import { branchContext } from "@/server/pharmacy/branches";
import { peso } from "@/lib/money";

export type ShiftState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      message: string;
      /**
       * The Z-reading this close produced, so the till can print it without
       * anybody going to look for it. A drawer counted and a reading nobody
       * printed is a shift that has to be reconstructed later.
       */
      readingId?: string;
    };

function denied(e: unknown): ShiftState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot open or close a till."
        : "Your session has expired. Sign in again.",
  };
}

/**
 * Pesos in the form, centavos everywhere else.
 *
 * Blank is refused rather than coerced to zero: an opening float of nothing is
 * a real answer somebody might give, and it has to be given rather than
 * defaulted, or every unattended form produces a drawer that "started empty".
 */
function pesosToCentavos(raw: FormDataEntryValue | null): number | null {
  const v = String(raw ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export async function startShift(_prev: ShiftState, formData: FormData): Promise<ShiftState> {
  let staff;
  try {
    // `sell` — the cashier opening the till is the person who is about to use
    // it. Requiring a manager means the till is opened by whoever is nearest
    // to a manager's password, which is worse than not recording it.
    staff = await requireStaff("sell");
  } catch (e) {
    return denied(e);
  }

  const opening = pesosToCentavos(formData.get("openingCash"));
  if (opening === null) {
    return { status: "error", message: "Count the float and enter it, even if it is zero." };
  }

  // The branch from the session, never the form. "All branches" is a reading
  // position; a till has to be somewhere, so this falls back to the main one.
  const branch = await branchContext(staff.pharmacyId);

  const res = await openShift({
    pharmacyId: staff.pharmacyId,
    staffId: staff.staffId,
    openingCashCentavos: opening,
    notes: String(formData.get("notes") ?? "").trim() || null,
    branchId: branch.writeBranchId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/shift");
  revalidatePath("/pos");
  return { status: "done", message: `Shift open with ${peso(opening)} in the drawer.` };
}

export async function endShift(_prev: ShiftState, formData: FormData): Promise<ShiftState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return denied(e);
  }

  const shiftId = String(formData.get("shiftId") ?? "").trim();
  if (!shiftId) return { status: "error", message: "No shift was selected." };

  const counted = pesosToCentavos(formData.get("countedCash"));
  if (counted === null) {
    return { status: "error", message: "Count the drawer and enter what is in it." };
  }

  const res = await closeShift({
    pharmacyId: staff.pharmacyId,
    shiftId,
    countedCashCentavos: counted,
    notes: String(formData.get("notes") ?? "").trim() || null,
    staffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/shift");
  revalidatePath("/readings");
  revalidatePath("/pos");

  const diff = res.overShortCentavos;
  return {
    status: "done",
    readingId: res.readingId,
    message:
      diff === 0
        ? `Closed. Z-reading ${res.zCounter}. The drawer balanced exactly.`
        : `Closed. Z-reading ${res.zCounter}. The drawer is ${peso(Math.abs(diff))} ${diff < 0 ? "SHORT" : "OVER"}.`,
  };
}
