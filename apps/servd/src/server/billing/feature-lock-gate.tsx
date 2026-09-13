import "server-only";

import type { ReactNode } from "react";
import type { Feature } from "@/lib/billing/features";
import { getFeatureLock } from "@/server/billing/feature-lock";
import { FeatureLockCard } from "@/components/billing/FeatureLockCard";

/**
 * Gate a page on a feature, showing the unlock in place of a redirect.
 *
 * The old requireFeaturePage() sent the owner to /admin/billing, where the one
 * thing they wanted sat in a list of eighteen priced features. It reads as a
 * bill instead of an offer. This keeps them on the page they asked for and
 * offers exactly that feature at its own price.
 *
 * Returns the card to render, or null when they already have it:
 *
 *   const locked = await featureLockOr(restaurantId, "accounting", "Accounting");
 *   if (locked) return locked;
 */
export async function featureLockOr(
  restaurantId: string,
  feature: Feature,
  title: string,
  opts?: { backHref?: string; backLabel?: string },
): Promise<ReactNode | null> {
  const lock = await getFeatureLock(restaurantId, feature);
  if (lock.allowed) return null;
  return (
    <FeatureLockCard
      lock={lock}
      title={title}
      backHref={opts?.backHref}
      backLabel={opts?.backLabel}
    />
  );
}
