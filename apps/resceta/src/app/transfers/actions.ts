"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/tenancy/current-user";
import { cancelTransfer, createTransfer, receiveTransfer } from "@/server/pharmacy/transfers";

export type TransferState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): TransferState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot move stock between branches."
        : "Your session has expired. Sign in again.",
  };
}

export async function sendTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const fromBranchId = String(formData.get("fromBranchId") ?? "").trim();
  const toBranchId = String(formData.get("toBranchId") ?? "").trim();
  if (!fromBranchId || !toBranchId) {
    return { status: "error", message: "Pick both branches." };
  }

  const batchIds = formData.getAll("batchId").map(String);
  const quantities = formData.getAll("quantity").map(String);

  const lines = [];
  for (let i = 0; i < batchIds.length; i += 1) {
    const raw = (quantities[i] ?? "").trim();
    if (raw === "") continue; // a line left blank is a line not being sent
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      return { status: "error", message: "Quantities come in whole units." };
    }
    if (n > 0) lines.push({ batchId: batchIds[i]!, quantity: n });
  }

  const res = await createTransfer({
    pharmacyId: staff.pharmacyId,
    fromBranchId,
    toBranchId,
    lines,
    notes: String(formData.get("notes") ?? "").trim() || null,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/transfers");
  revalidatePath("/");
  revalidatePath("/alerts");
  redirect(`/transfers/${res.id}`);
}

export async function acceptTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const transferId = String(formData.get("transferId") ?? "").trim();
  if (!transferId) return { status: "error", message: "No transfer was selected." };

  const res = await receiveTransfer({
    pharmacyId: staff.pharmacyId,
    transferId,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/transfers/${transferId}`);
  revalidatePath("/transfers");
  revalidatePath("/");
  revalidatePath("/alerts");
  return { status: "done", message: `${res.units} units on the shelf.` };
}

export async function abandonTransfer(
  _prev: TransferState,
  formData: FormData,
): Promise<TransferState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const transferId = String(formData.get("transferId") ?? "").trim();
  if (!transferId) return { status: "error", message: "No transfer was selected." };

  const res = await cancelTransfer({
    pharmacyId: staff.pharmacyId,
    transferId,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/transfers/${transferId}`);
  revalidatePath("/transfers");
  revalidatePath("/");
  return { status: "done", message: "Cancelled. The stock is back where it came from." };
}
