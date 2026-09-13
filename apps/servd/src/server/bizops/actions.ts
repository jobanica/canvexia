"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { logTouch } from "@/server/crm/actions";
import { logEvent } from "@/server/bizops/events";

/**
 * Recording that a chase went out.
 *
 * The two tracks record it differently, and that's deliberate rather than
 * untidy. An outreach prospect already has a sequence that owns its cadence —
 * `logTouch` advances the step, stamps the touch and schedules the next due
 * date — and reimplementing any of that here would give the CRM board and this
 * screen two different opinions about the same client.
 *
 * A DIY preview has no such row to advance. Its chase is recorded as an event,
 * which is what the timeline is for, and the due list counts those events back
 * to work out how many chases have gone and when the next is due.
 */
export async function markFollowedUp(
  track: "outreach" | "diy_preview",
  id: string,
): Promise<{ ok: boolean }> {
  const admin = await requireSuperAdmin();

  if (track === "outreach") {
    // The CRM owns the cadence. Let it.
    await logTouch(id).catch(() => ({ error: "logTouch failed" }));
    await logEvent({
      leadId: id,
      eventType: "note",
      actor: admin.email,
      meta: { kind: "follow_up_sent", track },
    });
  } else {
    await logEvent({
      restaurantId: id,
      eventType: "note",
      actor: admin.email,
      meta: { kind: "follow_up_sent", track },
    });
  }

  revalidatePath("/super-admin/bizops/follow-ups");
  revalidatePath("/super-admin/bizops");
  return { ok: true };
}

/**
 * Note that an upsell was offered.
 *
 * An offer is an event, not a row in its own table: the SALE is already an
 * AddonPurchase, and a separate `upsells` table would mean two places to look
 * for the same money and two chances for them to disagree.
 */
export async function logUpsellOffered(restaurantId: string, product: string): Promise<{ ok: boolean }> {
  const admin = await requireSuperAdmin();
  await logEvent({
    restaurantId,
    eventType: "upsell_offered",
    actor: admin.email,
    meta: { product },
  });
  revalidatePath("/super-admin/bizops/upsells");
  revalidatePath(`/super-admin/bizops/customers/${restaurantId}`);
  return { ok: true };
}

export type SpendState = { ok?: boolean; error?: string } | null;

/**
 * Record what was spent on ads.
 *
 * Typed in pesos because that is what the receipt says, stored in centavos
 * because that is what every other money column holds — and because cost per
 * lead divides this by a count, and one figure in pesos next to another in
 * centavos is how a CAC ends up a hundred times wrong.
 */
export async function addAdSpend(_prev: SpendState, formData: FormData): Promise<SpendState> {
  await requireSuperAdmin();
  const pesos = Number(formData.get("amountPesos"));
  const dateRaw = String(formData.get("spendDate") ?? "").trim();
  const platform = String(formData.get("platform") ?? "facebook").trim() || "facebook";
  const campaign = String(formData.get("campaign") ?? "").trim() || null;

  if (!Number.isFinite(pesos) || pesos <= 0) return { error: "Enter what you spent." };
  if (!dateRaw) return { error: "Pick the date it was spent." };
  const spendDate = new Date(`${dateRaw}T00:00:00+08:00`); // the Manila day it belongs to
  if (Number.isNaN(spendDate.getTime())) return { error: "That date didn't make sense." };

  try {
    await systemDb((tx) =>
      tx.adSpend.create({
        data: {
          id: randomUUID(),
          spendDate,
          platform,
          campaign,
          amount: Math.round(pesos * 100),
        },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Couldn't save it — run prisma/manual/add-business-ops.sql, then try again." };
  }
  revalidatePath("/super-admin/bizops/analytics");
  revalidatePath("/super-admin/bizops");
  return { ok: true };
}
