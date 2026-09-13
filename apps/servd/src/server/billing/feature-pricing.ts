import "server-only";

import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  normalizeFeaturePrices,
  DEFAULT_FEATURE_PRICES,
  type FeaturePriceMap,
} from "@/lib/billing/feature-pricing";

/** Current one-time unlock prices. Falls back to defaults if the column lags. */
export async function getFeaturePrices(): Promise<FeaturePriceMap> {
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({ where: { id: "platform" }, select: { featurePrices: true } }),
    );
    return normalizeFeaturePrices(row?.featurePrices);
  } catch {
    return { ...DEFAULT_FEATURE_PRICES };
  }
}

/** Replace the whole price map (already normalized by the caller). */
export async function saveFeaturePrices(prices: FeaturePriceMap): Promise<void> {
  await systemDb((tx) =>
    tx.platformSetting.upsert({
      where: { id: "platform" },
      create: { id: "platform", featurePrices: prices as unknown as Prisma.InputJsonValue },
      update: { featurePrices: prices as unknown as Prisma.InputJsonValue },
    }),
  );
}
