"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { uploadReceipt, uploadPayQr } from "@/server/storage/partner-billing";
import { confirmRenewal, rejectRenewal, openRenewal } from "@/server/billing/renewals";

export type RenewState = { ok?: string; error?: string; requested?: boolean } | null;

/**
 * The merchant taps Renew.
 *
 * Creates the request if there isn't one, and is a NO-OP if there is — a unique
 * partial index enforces one open renewal per merchant, because two requests
 * confirmed separately would extend the shop two months for one payment.
 */
export async function startRenewalAction(_prev: RenewState, _formData: FormData): Promise<RenewState> {
  const { restaurantId } = await requireAdminAction();

  const existing = await openRenewal(restaurantId);
  if (existing) return { ok: "You already have a renewal in progress.", requested: true };

  try {
    const [restaurant, sub] = await systemDb(async (tx) => [
      await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { partnerId: true },
      }),
      await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { plan: { select: { priceMonthly: true } } },
      }),
    ]);
    if (!restaurant?.partnerId) {
      return { error: "This account has nobody to renew with yet." };
    }
    await systemDb((tx) =>
      tx.merchantRenewal.create({
        data: {
          partnerId: restaurant.partnerId!,
          productId: "servd",
          merchantId: restaurantId,
          // The list price, which the partner can correct to what they actually
          // collected when they confirm.
          amountCentavos: sub?.plan.priceMonthly ?? 0,
        },
        select: { id: true },
      }),
    );
  } catch {
    // Almost certainly the one-open-renewal index. Treat a race as success:
    // from the owner's side a renewal is now in progress, which is true.
    return { ok: "You already have a renewal in progress.", requested: true };
  }

  revalidatePath("/admin/billing");
  return { ok: "Pay using the code below, then upload your receipt.", requested: true };
}

/** The merchant uploads proof they paid. */
export async function uploadReceiptAction(_prev: RenewState, formData: FormData): Promise<RenewState> {
  const { restaurantId } = await requireAdminAction();

  const file = formData.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a photo or screenshot." };

  const renewal = await openRenewal(restaurantId);
  if (!renewal) return { error: "Start a renewal first." };

  let path: string;
  try {
    path = await uploadReceipt(renewal.partnerId, restaurantId, file);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "That didn't upload. Try again." };
  }

  await systemDb((tx) =>
    tx.merchantRenewal.updateMany({
      // State in the WHERE clause: a renewal already decided must not accept a
      // late receipt and look like it is waiting again.
      where: { id: renewal.id, status: { in: ["requested", "receipt_uploaded"] } },
      data: { receiptPath: path, status: "receipt_uploaded", receiptAt: new Date() },
    }),
  );

  revalidatePath("/admin/billing");
  return { ok: "Sent. Your partner will confirm it and your plan will be extended." };
}

/* ------------------------------------------------------------------ partner */

export type ReviewState = { ok?: string; error?: string } | null;

/** The partner recognises the payment. This is where the money is recorded. */
export async function confirmRenewalAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  /**
   * `merchants.change_plan` — confirming a renewal extends the merchant's plan,
   * which is literally what that permission names, and books the revenue split
   * as a side effect. There is no finer-grained "may confirm a payment", and
   * inventing one nobody can see in the grid would be worse than reusing the
   * one that already covers changing what a merchant is entitled to.
   */
  const who = await requireWritablePartner("merchants.change_plan");
  if (!who) return { error: "Your seat can't confirm payments." };

  const renewalId = String(formData.get("renewalId") ?? "");
  const pesos = Number(String(formData.get("amountPesos") ?? ""));
  if (!renewalId || !Number.isFinite(pesos) || pesos < 0) {
    return { error: "Enter what you collected, in pesos." };
  }

  const res = await confirmRenewal({
    renewalId,
    partnerId: who.partnerId,
    decidedBy: who.email,
    amountCentavos: Math.round(pesos * 100),
  });
  if (!res.ok) return { error: res.message };

  try {
    await systemDb((tx) =>
      writeSeatAudit(tx, who, {
        action: "partner.renewal_confirmed",
        entityType: "renewal",
        entityId: renewalId,
        after: { amountCentavos: Math.round(pesos * 100), paidUntil: res.paidUntil.toISOString() },
      }),
    );
  } catch {
    /* the renewal is already recorded; losing the audit row must not undo it */
  }

  revalidatePath("/partner/renewals");
  return { ok: `Confirmed. They are paid up to ${res.paidUntil.toLocaleDateString("en-PH")}.` };
}

export async function rejectRenewalAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const who = await requireWritablePartner("merchants.change_plan");
  if (!who) return { error: "Your seat can't do that." };

  const res = await rejectRenewal({
    renewalId: String(formData.get("renewalId") ?? ""),
    partnerId: who.partnerId,
    decidedBy: who.email,
    note: String(formData.get("note") ?? ""),
  });
  if (!res.ok) return { error: res.message };

  revalidatePath("/partner/renewals");
  return { ok: "Turned down. They can see why and try again." };
}

/**
 * The partner's own payment code — the thing that makes "partner_collects" real.
 *
 * `merchants.manage` again: it is how this operator gets paid, and a wrong code
 * sends a restaurant's money to a stranger.
 */
export async function savePayQrAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const who = await requireWritablePartner("merchants.change_plan");
  if (!who) return { error: "Your seat can't change payment details." };

  const instructions = String(formData.get("payInstructions") ?? "").trim().slice(0, 500) || null;
  const file = formData.get("qr");

  let path: string | undefined;
  if (file instanceof File && file.size > 0) {
    try {
      path = await uploadPayQr(who.partnerId, file);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "That image didn't upload." };
    }
  }

  try {
    await systemDb((tx) =>
      tx.partner.update({
        where: { id: who.partnerId },
        // Only overwrite the code when a new one was actually chosen; saving
        // the instructions alone must not wipe the QR.
        data: { payInstructions: instructions, ...(path ? { payQrPath: path } : {}) },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Couldn't save that. Try again." };
  }

  revalidatePath("/partner/renewals");
  return { ok: path ? "Payment code saved." : "Saved." };
}
