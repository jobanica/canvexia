"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";

/**
 * Switching a merchant off, and back on.
 *
 * WHY A PARTNER NEEDS THIS. A partner-sold account is billed by the partner, in
 * cash, off this system — `Subscription.billedExternally`. Servd therefore never
 * duns it and never suspends it for non-payment, because Servd has no idea
 * whether the restaurant paid. That left the person who DOES know with no lever
 * at all: a shop could stop paying its partner and keep every feature forever.
 *
 * This is that lever, and it is deliberately manual. Nothing automatic can
 * decide this, because nothing automatic knows whether the money arrived.
 *
 * `merchants.suspend` — the A7 permission that names this exact action, rather
 * than the legacy `merchants.manage` capability that bundles four. Admin and
 * ops_manager hold it by default and an operator can take it off a seat, which
 * a fixed capability could not express. Sales opens accounts and support answers
 * for them; neither switches a business off.
 */

export type MerchantActionState = { ok?: string; error?: string } | null;

/** Suspending sets the tenant's own status, which is what the app already reads. */
async function setStatus(
  formData: FormData,
  next: "suspended" | "active",
): Promise<MerchantActionState> {
  const who = await requireWritablePartner("merchants.suspend");
  if (!who) return { error: "Your seat can't do that." };

  const merchantId = String(formData.get("merchantId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!merchantId) return { error: "Merchant not found." };
  // Only Servd for now. The pharmacy vertical keeps its own table and its own
  // notion of being switched off; guessing at it from here would write to the
  // wrong row or silently do nothing.
  if (productId !== "servd") {
    return { error: "This can only be done for Servd accounts yet." };
  }

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;
  if (next === "suspended" && !reason) {
    // A suspension with no reason is one nobody can explain to the owner who
    // rings up about it, possibly months later.
    return { error: "Say why — the owner will ask, and so will whoever picks this up." };
  }

  try {
    const done = await systemDb(async (tx) => {
      // Ownership in the WHERE clause: a merchant belonging to another partner
      // matches zero rows rather than being switched off.
      const hit = await tx.restaurant.updateMany({
        where: { id: merchantId, partnerId: who.partnerId },
        data: { status: next },
      });
      if (hit.count === 0) return false;

      await writeSeatAudit(tx, who, {
        action: next === "suspended" ? "partner.merchant_suspended" : "partner.merchant_reactivated",
        entityType: "merchant",
        entityId: merchantId,
        after: { status: next, reason },
      });
      return true;
    });
    if (!done) return { error: "Merchant not found." };
  } catch {
    return { error: "Couldn't do that. Try again." };
  }

  revalidatePath(`/partner/merchants/${productId}:${merchantId}`);
  revalidatePath("/partner/merchants");
  return {
    ok:
      next === "suspended"
        ? "Suspended. Staff see a notice instead of the app; the storefront stops taking orders."
        : "Back on. Everything is exactly as they left it.",
  };
}

export async function suspendMerchantAction(
  _prev: MerchantActionState,
  formData: FormData,
): Promise<MerchantActionState> {
  return setStatus(formData, "suspended");
}

export async function reactivateMerchantAction(
  _prev: MerchantActionState,
  formData: FormData,
): Promise<MerchantActionState> {
  return setStatus(formData, "active");
}
