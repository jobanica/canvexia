import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  getPublicRestaurantBySlug,
  getTableByToken,
} from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { getActivePromotions } from "@/server/promotions/queries";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { hasFeature } from "@/server/billing/feature-gate";
import { getPublicRatingStats } from "@/server/feedback/queries";
import { DinerMenu } from "@/components/diner/DinerMenu";
import { getServdBranding } from "@/server/branding/powered-by";

/**
 * Diner entry point from the QR scan: /order/{slug}/{tableToken}
 *
 * No login — the table is identified by the token in the URL. The page renders
 * fully white-label (the parent layout applied the restaurant's brand colors).
 */
export default async function DinerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tableToken: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { slug, tableToken } = await params;
  const { paid } = await searchParams;

  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  const locale = await getLocale();
  const [categories, promotions, loyalty, loyaltyOk, promoOk, rating, branding] = await Promise.all([
    getPublicMenu(restaurant.id, locale),
    getActivePromotions(restaurant.id),
    getLoyaltyConfig(restaurant.id),
    hasFeature(restaurant.id, "loyalty"),
    hasFeature(restaurant.id, "promotions"),
    getPublicRatingStats(restaurant.id),
    getServdBranding(restaurant.id),
  ]);

  return (
    <DinerMenu
      restaurantId={restaurant.id}
      slug={slug}
      tableToken={tableToken}
      tableNumber={table.tableNumber}
      isCounter={table.isCounter}
      brand={{
        name: restaurant.displayName || restaurant.name,
        logoUrl: restaurant.logoUrl,
        coverImageUrl: restaurant.coverImageUrl,
        tagline: restaurant.tagline,
      }}
      categories={categories}
      justPaid={paid === "1"}
      googleReviewUrl={restaurant.googleReviewUrl}
      promotions={promoOk ? promotions : []}
      loyaltyEnabled={loyaltyOk && loyalty.enabled}
      rating={rating}
      branding={branding}
    />
  );
}
