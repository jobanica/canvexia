"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { validateRevenueShare } from "@/lib/partners/revenue-share";
import { reassignMerchant } from "@/server/partners/reassign";

export type OperatorState = { ok?: boolean; message?: string; error?: string } | null;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLLECTION_MODES = ["partner_collects", "hq_collects"];
const BRAND_MODES = ["powered_by", "full_whitelabel"];
const TIERS = ["reseller", "affiliate", "operator"];

function refresh() {
  revalidatePath("/super-admin/partners");
  revalidatePath("/super-admin/merchants");
  revalidatePath("/partner");
}

/**
 * Save a partner's operator terms: tier, territory, split, who collects, and
 * whether CANVEXIA's name appears on their merchants' pages.
 *
 * Owner-only, not merely super-admin. This form sets what CANVEXIA is paid; it
 * belongs with pricing and invoices, not with the day-to-day back office.
 */
export async function saveOperatorTerms(
  _prev: OperatorState,
  formData: FormData,
): Promise<OperatorState> {
  await requireOwnerAction();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "No partner selected." };

  const tier = String(formData.get("tier") ?? "").trim();
  if (!TIERS.includes(tier)) return { error: "Pick a valid tier." };

  const rawShare = String(formData.get("revenueSharePct") ?? "").trim();
  const revenueSharePct = Number(rawShare === "" ? 0 : rawShare);
  if (!Number.isFinite(revenueSharePct)) {
    return { error: "Revenue share must be a number." };
  }

  // The grandfather rule (D2) lives in one place and this is a caller of it,
  // not a second copy: a legacy partner may not carry a share, and an operator
  // may not sit at 0.
  const share = validateRevenueShare({ tier, revenueSharePct });
  if (!share.ok) return { error: share.error };

  const collectionMode = String(formData.get("collectionMode") ?? "partner_collects").trim();
  if (!COLLECTION_MODES.includes(collectionMode)) {
    return { error: "Pick who collects the merchant's payment." };
  }

  const brandMode = String(formData.get("brandMode") ?? "powered_by").trim();
  if (!BRAND_MODES.includes(brandMode)) return { error: "Pick a brand mode." };

  const territory = String(formData.get("territory") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (slug && !SLUG_RE.test(slug)) {
    return { error: "Slug can only use lowercase letters, numbers and hyphens." };
  }

  try {
    await systemDb((tx) =>
      tx.partner.update({
        where: { id },
        data: {
          tier,
          revenueSharePct,
          collectionMode,
          brandMode,
          territory: territory || null,
          slug: slug || null,
        },
      }),
    );
  } catch (e) {
    // A duplicate slug is the one failure a person can actually fix, so it is
    // worth telling them apart from everything else.
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("partners_slug_key") || msg.toLowerCase().includes("unique")) {
      return { error: `The slug “${slug}” is already taken by another partner.` };
    }
    console.error("saveOperatorTerms failed", e);
    return { error: "Couldn't save those terms." };
  }

  refresh();
  return { ok: true, message: "Operator terms saved." };
}

/**
 * Move a merchant to a different partner.
 *
 * Owner-only: it changes who is paid for that merchant every month, and who can
 * read its data at all.
 */
export async function reassignMerchantAction(
  _prev: OperatorState,
  formData: FormData,
): Promise<OperatorState> {
  const actor = await requireOwnerAction();

  const restaurantId = String(formData.get("restaurantId") ?? "").trim();
  const targetPartnerId = String(formData.get("targetPartnerId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const result = await reassignMerchant({
    restaurantId,
    targetPartnerId,
    actorEmail: actor.email,
    reason: reason || null,
  });

  if (!result.ok) return { error: result.error };

  refresh();
  return {
    ok: true,
    message: result.moved ? "Merchant moved." : "Already with that partner — nothing changed.",
  };
}
