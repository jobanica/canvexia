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
 *
 * IT DOES PHARMACIES TOO, NOW. It used to refuse anything that was not Servd,
 * on the argument that the pharmacy vertical keeps its own table and guessing
 * at it from here would write to the wrong row. The table is the only thing
 * that differs: `pharmacies.status` is the same column in the same sense, and
 * Resceta already honours it — `pos/actions.ts` refuses to ring up a sale when
 * it is not "active", and the shell says so on every page. So the mechanism was
 * built on the pharmacy side and only the lever was missing: a partner could
 * ACTIVATE a pharmacy (`activatePharmacy`) and never switch one off again. A
 * one-way door on the one control that makes non-payment answerable.
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
  // Named, not inferred. A product this code has never heard of has no table to
  // write to, and defaulting to one would switch off the wrong business.
  if (productId !== "servd" && productId !== "pharmacy") {
    return { error: "This can only be done for Servd and Resceta accounts." };
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
      // matches zero rows rather than being switched off. Both axes carry
      // `partnerId` and `status`, so the clause is identical — only the table
      // differs, and it is chosen from a value this function has validated
      // rather than from the form directly.
      const hit =
        productId === "pharmacy"
          ? await tx.pharmacy.updateMany({
              where: { id: merchantId, partnerId: who.partnerId },
              data: { status: next },
            })
          : await tx.restaurant.updateMany({
              where: { id: merchantId, partnerId: who.partnerId },
              data: { status: next },
            });
      if (hit.count === 0) return false;

      await writeSeatAudit(tx, who, {
        action: next === "suspended" ? "partner.merchant_suspended" : "partner.merchant_reactivated",
        // The axis, so an audit reader is not left guessing which table an id
        // belongs to. Two products can hold the same uuid shape.
        entityType: productId === "pharmacy" ? "pharmacy" : "merchant",
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
