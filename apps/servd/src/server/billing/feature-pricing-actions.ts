"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { pesosToCentavos } from "@/lib/money";
import { ALL_FEATURES } from "@/lib/billing/features";
import {
  normalizeFeaturePrices,
  type FeaturePriceMap,
  type FeaturePrice,
} from "@/lib/billing/feature-pricing";
import { getFeaturePrices, saveFeaturePrices } from "@/server/billing/feature-pricing";

export type PricingState = { ok?: boolean; error?: string } | null;

/** Save the whole one-time pricing table in one submit. */
export async function updateFeaturePrices(
  _prev: PricingState,
  formData: FormData,
): Promise<PricingState> {
  await requireOwnerAction();

  const current = await getFeaturePrices();
  const next = {} as FeaturePriceMap;
  for (const key of ALL_FEATURES) {
    const raw = formData.get(`price_${key}`);
    // Blank/garbage keeps the existing price rather than silently zeroing it.
    const pesos = Number(raw);
    const price =
      raw != null && String(raw).trim() !== "" && Number.isFinite(pesos) && pesos >= 0
        ? pesosToCentavos(pesos)
        : current[key].price;
    const row: FeaturePrice = { price, enabled: formData.get(`on_${key}`) === "on" };
    next[key] = row;
  }

  try {
    await saveFeaturePrices(normalizeFeaturePrices(next));
  } catch {
    return { error: "Couldn't save. Run the feature-prices migration if you haven't yet." };
  }
  revalidatePath("/super-admin/feature-pricing");
  return { ok: true };
}
