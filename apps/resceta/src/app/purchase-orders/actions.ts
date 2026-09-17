"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/server/tenancy/current-user";
import { PoInput } from "@/lib/pharmacy/po-input";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  markPoSent,
  receiveAgainstPo,
  type ReceiptLine,
} from "@/server/pharmacy/purchase-orders";

/**
 * Purchase-order writes.
 *
 * `manageStock` throughout: raising an order, sending it, cancelling it and
 * receiving against it are all the stock job, and the pharmacist who takes the
 * delivery is the one who needs every one of them.
 */

export type PoState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown): PoState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? "This account cannot manage purchase orders."
        : "Your session has expired. Sign in again.",
  };
}

/**
 * Read the repeated line fields out of the form.
 *
 * The three arrays are positional and come from the same rows, so a missing
 * entry is a line the user left blank rather than a mismatch — filtered out
 * before validation rather than failing the whole order.
 */
function readLines(formData: FormData) {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const costs = formData.getAll("unitCost").map(String);

  return productIds
    .map((productId, i) => ({
      productId,
      quantityOrdered: quantities[i] ?? "",
      unitCostCentavos: costs[i] ?? "",
    }))
    .filter((l) => l.productId && String(l.quantityOrdered).trim() !== "");
}

export async function raisePurchaseOrder(
  _prev: PoState,
  formData: FormData,
): Promise<PoState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const parsed = PoInput.safeParse({
    supplierId: formData.get("supplierId") || null,
    expectedDate: formData.get("expectedDate") ?? "",
    notes: formData.get("notes") ?? "",
    lines: readLines(formData),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the lines." };
  }

  const res = await createPurchaseOrder({
    pharmacyId: staff.pharmacyId,
    values: parsed.data,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/purchase-orders");
  // Straight to the order: the next thing anybody does is send it or print it,
  // and a "created" message on the form they just left is not that.
  redirect(`/purchase-orders/${res.id}`);
}

export async function sendPurchaseOrder(_prev: PoState, formData: FormData): Promise<PoState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }
  const poId = String(formData.get("poId") ?? "").trim();
  if (!poId) return { status: "error", message: "No order was selected." };

  const res = await markPoSent(staff.pharmacyId, poId, staff.staffId);
  if (!res.ok) return { status: "error", message: res.error };
  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  return { status: "done", message: "Marked as sent." };
}

export async function cancelPo(_prev: PoState, formData: FormData): Promise<PoState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }
  const poId = String(formData.get("poId") ?? "").trim();
  if (!poId) return { status: "error", message: "No order was selected." };

  const res = await cancelPurchaseOrder(staff.pharmacyId, poId, staff.staffId);
  if (!res.ok) return { status: "error", message: res.error };
  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  return { status: "done", message: "Order cancelled." };
}

export async function receiveDelivery(_prev: PoState, formData: FormData): Promise<PoState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return denied(e);
  }

  const poId = String(formData.get("poId") ?? "").trim();
  if (!poId) return { status: "error", message: "No order was selected." };

  const itemIds = formData.getAll("itemId").map(String);
  const qtys = formData.getAll("receiveQty").map(String);
  const costs = formData.getAll("receiveCost").map(String);
  const lots = formData.getAll("lotNumber").map(String);
  const expiries = formData.getAll("expiryDate").map(String);

  const lines: ReceiptLine[] = [];
  for (let i = 0; i < itemIds.length; i += 1) {
    const qty = Number(qtys[i] ?? "");
    if (!Number.isFinite(qty) || qty <= 0) continue; // a line left blank
    if (!Number.isInteger(qty)) {
      return { status: "error", message: "Quantities come in whole units." };
    }
    const cost = Number(costs[i] ?? "");
    if (!Number.isFinite(cost) || cost < 0) {
      // Blank would coerce to 0, and a zero-cost batch is a 100% margin on
      // every future sale of it.
      return { status: "error", message: "Enter the unit cost for every line you are receiving." };
    }
    lines.push({
      itemId: itemIds[i]!,
      quantity: qty,
      unitCostCentavos: Math.round(cost * 100),
      lotNumber: lots[i]?.trim() || null,
      expiryDate: expiries[i]?.trim() || null,
    });
  }

  const res = await receiveAgainstPo({
    pharmacyId: staff.pharmacyId,
    poId,
    lines,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/");
  revalidatePath("/alerts");
  return {
    status: "done",
    message: `${res.units} units in ${res.batches} batch${res.batches === 1 ? "" : "es"}. Order is ${res.status}.`,
  };
}
