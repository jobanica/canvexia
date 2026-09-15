"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";
import { reassignMerchant } from "@/server/partners/reassign";
import { requireHqAction } from "./auth";

export type MerchantState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Move a merchant to another partner.
 *
 * Delegates to `reassignMerchant`, which already existed and already does the
 * whole move in one transaction with its own audit row. What this adds is the
 * HQ capability check and the reason — because a merchant changing hands is the
 * kind of thing both partners will ask about later.
 */
export async function reassignMerchantAction(
  _prev: MerchantState,
  formData: FormData,
): Promise<MerchantState> {
  let actor;
  try {
    actor = await requireHqAction("merchants.reassign");
  } catch {
    return { status: "error", message: "You do not have permission to move merchants." };
  }

  const key = String(formData.get("key") ?? "").trim();
  const targetPartnerId = String(formData.get("targetPartnerId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const [productId, restaurantId] = key.split(":");
  // Only the Servd axis can be moved: reassignMerchant writes
  // restaurants.partnerId, and the pharmacy axis has no equivalent path. The UI
  // hides the control; this is what makes the POST fail too.
  if (productId !== "servd" || !restaurantId) {
    return {
      status: "error",
      message: "Only Servd merchants can be reassigned. Resceta has no ownership-transfer path yet.",
    };
  }
  if (reason.length < 4) {
    return { status: "error", message: "Say why. Both partners will ask." };
  }

  const result = await reassignMerchant({
    restaurantId,
    targetPartnerId,
    actorEmail: actor.email,
    reason,
  });
  if (!result.ok) return { status: "error", message: result.error };

  revalidatePath("/hq/merchants");
  revalidatePath("/hq/partners");
  revalidatePath("/hq");
  return {
    status: "done",
    message: result.moved ? "Moved." : "That merchant already belonged to them.",
  };
}

/**
 * Flag a merchant as a national account.
 *
 * The merchant moves to the HOUSE partner, and whoever introduced it is
 * recorded on the house partner's `referralPartnerId` so a referral line can be
 * put on their statement.
 *
 * ONE HONEST GAP, stated rather than hidden: `referralPartnerId` lives on the
 * PARTNER, not on the merchant, so it records one referrer for the house
 * account rather than one per national merchant. That is enough for the first
 * national account and wrong for the second, and moving it to a per-merchant
 * column is a migration — so this refuses to overwrite an existing referrer
 * instead of silently replacing one partner's claim with another's.
 */
export async function flagNationalAccountAction(
  _prev: MerchantState,
  formData: FormData,
): Promise<MerchantState> {
  let actor;
  try {
    actor = await requireHqAction("merchants.reassign");
  } catch {
    return { status: "error", message: "You do not have permission to move merchants." };
  }

  const key = String(formData.get("key") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const [productId, restaurantId] = key.split(":");

  if (productId !== "servd" || !restaurantId) {
    return { status: "error", message: "Only Servd merchants can be moved." };
  }
  if (reason.length < 4) return { status: "error", message: "Say why." };

  const house = await systemDb((tx) =>
    tx.partner.findFirst({ where: { isHouse: true }, select: { id: true, name: true } }),
  );
  if (!house) {
    return {
      status: "error",
      message: "No house partner is set. Mark one on the partner list first.",
    };
  }

  const current = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { partnerId: true, name: true },
    }),
  );
  if (!current) return { status: "error", message: "That merchant no longer exists." };
  if (current.partnerId === house.id) {
    return { status: "error", message: `${current.name} is already a national account.` };
  }

  const referrer = current.partnerId;

  const result = await reassignMerchant({
    restaurantId,
    targetPartnerId: house.id,
    actorEmail: actor.email,
    reason: `National account — ${reason}`,
  });
  if (!result.ok) return { status: "error", message: result.error };

  let referralNote = "";
  if (referrer) {
    try {
      referralNote = await systemDb(async (tx) => {
        const h = await tx.partner.findUnique({
          where: { id: house.id },
          select: { referralPartnerId: true },
        });
        if (h?.referralPartnerId && h.referralPartnerId !== referrer) {
          // Refusing beats overwriting: the existing value is another
          // partner's claim to a referral fee.
          const existing = await tx.partner.findUnique({
            where: { id: h.referralPartnerId },
            select: { name: true },
          });
          return ` The referral stayed with ${existing?.name ?? "the existing referrer"} — the house account records one referrer, not one per merchant.`;
        }
        if (!h?.referralPartnerId) {
          await tx.partner.update({
            where: { id: house.id },
            data: { referralPartnerId: referrer },
          });
          await writeHqAudit(tx, {
            partnerId: house.id,
            actorEmail: actor.email,
            action: "partner.referral_set",
            entityType: "partner",
            entityId: house.id,
            reason,
            after: { referralPartnerId: referrer },
          });
          return " Referral recorded.";
        }
        return "";
      });
    } catch {
      referralNote = " The referral could not be recorded.";
    }
  }

  revalidatePath("/hq/merchants");
  revalidatePath("/hq/partners");
  return {
    status: "done",
    message: `${current.name} now belongs to ${house.name}.${referralNote}`,
  };
}

/**
 * Force a plan change.
 *
 * HQ's override of what a merchant is on. It changes the PLAN, not the price —
 * a partner's own price for that plan lives in `partner_plan_prices` and is
 * theirs to set above the floor. Changing the plan out from under a price
 * override is exactly the case where the two could disagree, so the message
 * says which one now applies.
 */
export async function forcePlanChangeAction(
  _prev: MerchantState,
  formData: FormData,
): Promise<MerchantState> {
  let actor;
  try {
    actor = await requireHqAction("plans.floor");
  } catch {
    return { status: "error", message: "Only a super admin can force a plan change." };
  }

  const key = String(formData.get("key") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const [productId, restaurantId] = key.split(":");

  if (productId !== "servd" || !restaurantId) {
    return { status: "error", message: "Only Servd merchants have plans today." };
  }
  if (!planId) return { status: "error", message: "Pick a plan." };
  if (reason.length < 4) return { status: "error", message: "Say why." };

  try {
    const message = await systemDb(async (tx) => {
      const r = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, name: true, planId: true, partnerId: true },
      });
      if (!r) throw new Error("GONE");

      const plan = await tx.plan.findUnique({
        where: { id: planId },
        select: { id: true, name: true, priceMonthly: true },
      });
      if (!plan) throw new Error("NO_PLAN");

      await tx.restaurant.update({ where: { id: restaurantId }, data: { planId } });

      const override = r.partnerId
        ? await tx.partnerPlanPrice
            .findUnique({
              where: { partnerId_planId: { partnerId: r.partnerId, planId } },
              select: { priceMonthly: true },
            })
            .catch(() => null)
        : null;

      await writeHqAudit(tx, {
        restaurantId,
        partnerId: r.partnerId,
        actorEmail: actor.email,
        action: "merchant.plan_forced",
        entityType: "restaurant",
        entityId: restaurantId,
        reason,
        before: { planId: r.planId },
        after: { planId },
      });

      return override
        ? `${r.name} is on ${plan.name}. Their partner's own price for it applies, not the catalogue price.`
        : `${r.name} is on ${plan.name}.`;
    });

    revalidatePath("/hq/merchants");
    return { status: "done", message };
  } catch (e) {
    const why = e instanceof Error ? e.message : "";
    if (why === "GONE") return { status: "error", message: "That merchant no longer exists." };
    if (why === "NO_PLAN") return { status: "error", message: "That plan no longer exists." };
    return { status: "error", message: "Could not change the plan." };
  }
}
