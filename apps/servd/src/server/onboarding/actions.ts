"use server";

import { redirect } from "next/navigation";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";

/**
 * Marks onboarding finished/dismissed. "Guided + skippable" — the owner can
 * finish anytime; this stops the wizard redirect and hides the resume banner.
 */
export async function finishOnboarding(): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: { onboardingCompletedAt: new Date() },
      select: { id: true },
    }),
  );
  redirect("/admin");
}
