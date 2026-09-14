"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { voidSale, processReturn } from "@/server/pharmacy/reversal";
import { can } from "@/lib/pharmacy/roles";

/**
 * The pharmacy comes from the session, never the form (D30). The saleId does
 * come from the request — it has to — but every read of it goes through
 * pharmacyDb, so one belonging to another pharmacy is not found rather than
 * acted on.
 */

export type ReversalState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string; creditNoteHref?: string };

const Void = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().max(200).optional(),
});

export async function voidSaleAction(
  _prev: ReversalState,
  formData: FormData,
): Promise<ReversalState> {
  let staff;
  try {
    staff = await requireStaff("voidSale");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account can't void a sale."
          : "Your session has expired. Sign in again.",
    };
  }

  const parsed = Void.safeParse({
    saleId: formData.get("saleId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "Nothing to void." };

  const outcome = await voidSale({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    ...parsed.data,
  });
  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath("/receipts");
  revalidatePath("/");
  return {
    status: "done",
    message: `Voided. ${outcome.unitsRestored} unit${outcome.unitsRestored === 1 ? "" : "s"} back in stock.`,
  };
}

const Return = z.object({
  saleId: z.string().uuid(),
  reason: z.string().trim().max(200).optional(),
  refundMethod: z.enum(["cash", "gcash", "card", "maya", "store_credit"]).default("cash"),
  lines: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(1_000_000),
        restock: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function returnAction(
  _prev: ReversalState,
  formData: FormData,
): Promise<ReversalState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account can't take returns."
          : "Your session has expired. Sign in again.",
    };
  }

  let raw: unknown;
  try {
    raw = {
      saleId: formData.get("saleId"),
      reason: formData.get("reason") || undefined,
      refundMethod: String(formData.get("refundMethod") ?? "cash"),
      lines: JSON.parse(String(formData.get("lines") ?? "[]")),
    };
  } catch {
    return { status: "error", message: "That return didn't come through — try again." };
  }

  const parsed = Return.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "Check the quantities and try again." };
  }

  const outcome = await processReturn({
    pharmacyId: staff.pharmacyId,
    actorStaffId: staff.staffId,
    // Putting a returned medicine back on the shelf is a stock decision, so it
    // needs the stock permission — not merely the one that lets you take the
    // customer's money back.
    canRestock: can(staff.role, "manageStock"),
    ...parsed.data,
  });
  if (!outcome.ok) return { status: "error", message: outcome.message };

  revalidatePath("/receipts");
  revalidatePath("/");
  const parts = [`Credit note ${outcome.returnNumber}.`];
  if (outcome.unitsRestocked) parts.push(`${outcome.unitsRestocked} back in stock.`);
  if (outcome.unitsDestroyed) parts.push(`${outcome.unitsDestroyed} written off.`);
  // The credit note is the customer-facing half of a return. Without this the
  // only way to the document just created is to go and find it on the receipt.
  return {
    status: "done",
    message: parts.join(" "),
    creditNoteHref: `/returns/${outcome.returnId}/print?auto=1`,
  };
}
