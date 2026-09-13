import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getTableByToken } from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { getActivePromotions } from "@/server/promotions/queries";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { getPublicRatingStats } from "@/server/feedback/queries";
import { DinerMenu } from "@/components/diner/DinerMenu";
import { getServdBranding } from "@/server/branding/powered-by";

/**
 * Branded-host table entry: e.g. mango-grill.servd.app/t/<token>.
 * Resolves the restaurant by host, then reuses the exact same DinerMenu — the
 * order/pay/bill actions resolve by slug, so they work identically on any host.
 */
export default async function SiteTablePage({
  params,
}: {
  params: Promise<{ host: string; tableToken: string }>;
}) {
  const { host, tableToken } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  const locale = await getLocale();
  const [categories, promotions, loyalty, rating, branding] = await Promise.all([
    getPublicMenu(restaurant.id, locale),
    getActivePromotions(restaurant.id),
    getLoyaltyConfig(restaurant.id),
    getPublicRatingStats(restaurant.id),
    getServdBranding(restaurant.id),
  ]);

  return (
    <DinerMenu
      restaurantId={restaurant.id}
      slug={restaurant.slug}
      tableToken={tableToken}
      tableNumber={table.tableNumber}
      brand={{
        name: restaurant.displayName || restaurant.name,
        logoUrl: restaurant.logoUrl,
        coverImageUrl: restaurant.coverImageUrl,
        tagline: restaurant.tagline,
      }}
      categories={categories}
      googleReviewUrl={restaurant.googleReviewUrl}
      promotions={promotions}
      loyaltyEnabled={loyalty.enabled}
      rating={rating}
      branding={branding}
    />
  );
}
