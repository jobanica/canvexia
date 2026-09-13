import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { moveToTrackB } from "@/server/email/followup";

/** Minimum items before the preview is worth showing (§ "the aha must be fast"). */
export const MIN_PREVIEW_ITEMS = 3;

/** The ₱499 one-time activation fee, in centavos. */
export const ACTIVATION_PRICE = 49_900;

export interface BuildItem {
  id: string;
  name: string;
  price: number; // centavos
  category: string;
  imageUrl: string | null;
}

export interface BuildState {
  token: string;
  restaurantId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  contactEmail: string;
  contactPhone: string;
  contactFb: string;
  items: BuildItem[];
  /** Enough items to show the preview? */
  canPreview: boolean;
  /** A pending/paid activation attempt, if one exists. */
  activation: { id: string; status: string; checkoutUrl: string | null } | null;
}

/** Everything the wizard needs, resolved from a build token. */
export async function getBuildState(token: string): Promise<BuildState | null> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { buildToken: token, status: "preview" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          contactEmail: true,
          contactPhone: true,
          contactFb: true,
          menuItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              price: true,
              imageUrl: true,
              category: { select: { name: true } },
            },
          },
          activationRequests: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, checkoutUrl: true },
          },
        },
      }),
    );
    if (!r) return null;
    return {
      token,
      restaurantId: r.id,
      name: r.name,
      slug: r.slug,
      logoUrl: r.logoUrl,
      contactEmail: r.contactEmail ?? "",
      contactPhone: r.contactPhone ?? "",
      contactFb: r.contactFb ?? "",
      items: r.menuItems.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        category: i.category?.name ?? "Menu",
        imageUrl: i.imageUrl,
      })),
      canPreview: r.menuItems.length >= MIN_PREVIEW_ITEMS,
      activation: r.activationRequests[0] ?? null,
    };
  } catch {
    return null; // builder columns not migrated yet
  }
}

/** Public read for the preview page — a preview restaurant, never a live one. */
export async function getPreviewRestaurant(slug: string) {
  try {
    return await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { slug, status: "preview" },
        select: {
          id: true,
          name: true,
          slug: true,
          displayName: true,
          logoUrl: true,
          coverImageUrl: true,
          tagline: true,
          brandPrimaryColor: true,
          brandAccentColor: true,
          buildToken: true,
        },
      }),
    );
  } catch {
    return null;
  }
}

/**
 * Funnel: stamp the first time the owner saw their own storefront. Plain server
 * helper (not an action) so it can run during a page render — no revalidation.
 */
export async function stampPreviewReached(restaurantId: string): Promise<void> {
  try {
    const res = await systemDb((tx) =>
      tx.restaurant.updateMany({
        where: { id: restaurantId, previewReachedAt: null },
        data: { previewReachedAt: new Date() },
      }),
    );
    // Only on the FIRST view: they've done what Track A was asking for, so it
    // stops and Track B ("activate") takes over. Re-visits change nothing.
    if (res.count > 0) await moveToTrackB(restaurantId);
  } catch {
    /* column not migrated yet — the preview still works */
  }
}
