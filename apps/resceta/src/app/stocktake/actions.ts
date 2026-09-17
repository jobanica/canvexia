"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/tenancy/current-user";
import {
  approveStocktake,
  cancelStocktake,
  openStocktake,
  saveCounts,
} from "@/server/pharmacy/stocktake";
import { peso } from "@/lib/money";

export type StocktakeState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): StocktakeState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot run a stocktake."
        : "Your session has expired. Sign in again.",
  };
}

export async function startCount(_prev: StocktakeState, formData: FormData): Promise<StocktakeState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const res = await openStocktake({
    pharmacyId: staff.pharmacyId,
    notes: String(formData.get("notes") ?? "").trim() || null,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/stocktake");
  redirect(`/stocktake/${res.id}`);
}

export async function recordCounts(
  _prev: StocktakeState,
  formData: FormData,
): Promise<StocktakeState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const stocktakeId = String(formData.get("stocktakeId") ?? "").trim();
  if (!stocktakeId) return { status: "error", message: "No count was selected." };

  const itemIds = formData.getAll("itemId").map(String);
  const values = formData.getAll("countedQty").map(String);

  const counts = itemIds.map((itemId, i) => {
    const raw = (values[i] ?? "").trim();
    // BLANK MEANS NOT COUNTED, and stays null. Turning it into 0 would write
    // every untouched product down to nothing on approval.
    if (raw === "") return { itemId, countedQty: null };
    const n = Number(raw);
    return { itemId, countedQty: Number.isInteger(n) && n >= 0 ? n : null };
  });

  const res = await saveCounts({
    pharmacyId: staff.pharmacyId,
    stocktakeId,
    counts,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/stocktake/${stocktakeId}`);
  return { status: "done", message: `${res.counted} lines counted.` };
}

export async function approveCount(
  _prev: StocktakeState,
  formData: FormData,
): Promise<StocktakeState> {
  let staff;
  try {
    // Approving MOVES STOCK. `viewReports` on top of `manageStock` is
    // deliberate: the person counting and the person signing off the variance
    // should not have to be the same, and at this size the owner and the
    // manager are who hold it.
    staff = await requireStaff("viewReports");
  } catch (e) {
    return denied(e);
  }

  const stocktakeId = String(formData.get("stocktakeId") ?? "").trim();
  if (!stocktakeId) return { status: "error", message: "No count was selected." };

  const res = await approveStocktake({
    pharmacyId: staff.pharmacyId,
    stocktakeId,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/stocktake/${stocktakeId}`);
  revalidatePath("/stocktake");
  revalidatePath("/");
  revalidatePath("/alerts");
  return {
    status: "done",
    message:
      res.adjusted === 0
        ? "Approved. The shelf agreed with the system — nothing to adjust."
        : `Approved. ${res.adjusted} products adjusted, ${peso(res.varianceCentavos)} of variance.`,
  };
}

export async function abandonCount(
  _prev: StocktakeState,
  formData: FormData,
): Promise<StocktakeState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const stocktakeId = String(formData.get("stocktakeId") ?? "").trim();
  if (!stocktakeId) return { status: "error", message: "No count was selected." };

  const res = await cancelStocktake({
    pharmacyId: staff.pharmacyId,
    stocktakeId,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/stocktake");
  revalidatePath(`/stocktake/${stocktakeId}`);
  return { status: "done", message: "Count cancelled. No stock moved." };
}
