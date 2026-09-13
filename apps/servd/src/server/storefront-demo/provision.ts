import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { uniqueSlug } from "@/lib/slug";
import { getTopPlan } from "@/server/billing/subscription";
import { COMP_FOREVER } from "@/lib/billing/comp";

/** Storefront contact reads from printerConfig.receipt (no extra column). */
export function receiptJson(address: string, phone: string) {
  return { receipt: { address: address || "", phone: phone || "" } };
}

export interface DemoInput {
  name: string;
  address: string;
  phone: string;
  tagline: string;
  logoUrl: string;
  /** Storefront hero, and the picture that shows when the link is shared. */
  coverImageUrl?: string;
  /** Set when a partner creates the demo (attribution). */
  demoPartnerId?: string | null;
}

/**
 * Provision a demo storefront tenant (no login) + a complimentary open-ended
 * trial so onlineOrdering stays unlocked. Returns the new restaurant id. Shared
 * by the super-admin create flow and the partner dashboard.
 */
export async function provisionDemo(d: DemoInput): Promise<string> {
  return systemDb(async (tx) => {
    const slug = await uniqueSlug(
      d.name,
      async (s) => !!(await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } })),
    );
    const r = await tx.restaurant.create({
      data: {
        name: d.name,
        displayName: d.name,
        slug,
        status: "active",
        logoUrl: d.logoUrl || null,
        coverImageUrl: d.coverImageUrl || null,
        tagline: d.tagline || null,
        ...(d.demoPartnerId ? { demoPartnerId: d.demoPartnerId } : {}),
        printerConfig: receiptJson(d.address, d.phone),
      },
      select: { id: true },
    });
    const plan = await getTopPlan(tx);
    if (plan) {
      await tx.restaurant.update({ where: { id: r.id }, data: { planId: plan.id }, select: { id: true } });
      await tx.subscription.create({
        data: {
          restaurantId: r.id,
          planId: plan.id,
          status: "trialing",
          trialEndsAt: COMP_FOREVER,
          currentPeriodEnd: COMP_FOREVER,
        },
        select: { id: true },
      });
    }
    return r.id;
  });
}
