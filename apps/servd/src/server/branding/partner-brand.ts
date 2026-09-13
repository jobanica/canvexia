import "server-only";
import { parseBrandConfig, resolveBrand, type PartnerBrandConfig } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The brand a MERCHANT sees: their partner's, falling back to the platform's.
 *
 * Q4, decided. Two surfaces, two answers, and the seam between them is the one
 * that already exists in the product:
 *
 *   DINER-FACING  — the merchant's own brand. A diner scanning a QR at Mango
 *                   Grill should see Mango Grill: that is what the restaurant
 *                   pays for and what their customers recognise. Already built
 *                   (Restaurant.displayName / logoUrl / brandPrimaryColor), and
 *                   this function is not used there.
 *   MERCHANT-FACING — the partner's brand. The owner's dashboard, the emails
 *                   they receive, and above all who they contact for help. To
 *                   the restaurant, the partner IS the software company.
 *
 * Getting that backwards in either direction is a real failure: a partner's logo
 * on a diner's receipt confuses the restaurant's customers, and Servd's support
 * address on a partner's merchant dashboard sends their customers to us.
 */

/**
 * Servd's own brand — the fallback for anything a partner has not set.
 *
 * Deliberately the current values, so an unbranded partner produces exactly the
 * platform's existing look rather than a half-styled page. The colours are the
 * `mango` and `guava` from tailwind.config.ts.
 */
export const PLATFORM_BRAND = {
  displayName: "Servd",
  primaryColor: "#FF8A1E",
  accentColor: "#FF4D6D",
  supportUrl: "https://www.servdph.com",
} as const satisfies PartnerBrandConfig &
  Required<Pick<PartnerBrandConfig, "displayName" | "primaryColor" | "accentColor">>;

/** The brand for a partner id, resolved against the platform's defaults. */
export async function getPartnerBrand(partnerId: string | null): Promise<PartnerBrandConfig> {
  if (!partnerId) return resolveBrand({}, PLATFORM_BRAND);
  try {
    const row = await systemDb((tx) =>
      tx.partner.findUnique({ where: { id: partnerId }, select: { brandConfig: true } }),
    );
    return resolveBrand(parseBrandConfig(row?.brandConfig), PLATFORM_BRAND);
  } catch {
    // brandConfig not migrated yet — the platform's own brand, which is what
    // every merchant sees today anyway.
    return resolveBrand({}, PLATFORM_BRAND);
  }
}

/**
 * The brand a given merchant's owner should see.
 *
 * Best-effort throughout: a brand is decoration, and no lookup here may be able
 * to stop a dashboard rendering.
 */
export async function getMerchantFacingBrand(restaurantId: string): Promise<PartnerBrandConfig> {
  try {
    const restaurant = await systemDb((tx) =>
      tx.restaurant.findUnique({ where: { id: restaurantId }, select: { partnerId: true } }),
    );
    return getPartnerBrand(restaurant?.partnerId ?? null);
  } catch {
    return resolveBrand({}, PLATFORM_BRAND);
  }
}

/**
 * The brand for a partner's own domain, e.g. cebu.canvexia.app.
 *
 * Paired with parseHost's "partner" kind. Returns null when the slug matches no
 * partner, so the caller can 404 rather than render a blank operator portal.
 */
export async function getPartnerBrandBySlug(
  slug: string,
): Promise<{ partnerId: string; brand: PartnerBrandConfig } | null> {
  if (!slug) return null;
  try {
    const partner = await systemDb((tx) =>
      tx.partner.findUnique({
        where: { slug },
        select: { id: true, status: true, brandConfig: true },
      }),
    );
    if (!partner || partner.status !== "approved") return null;
    return {
      partnerId: partner.id,
      brand: resolveBrand(parseBrandConfig(partner.brandConfig), PLATFORM_BRAND),
    };
  } catch {
    return null;
  }
}
