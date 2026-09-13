import { notFound } from "next/navigation";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { getPublicStorefront, isOpenNow } from "@/server/storefront/storefront";
import { getPublicRatingStats } from "@/server/feedback/queries";
import { hasFeature } from "@/server/billing/feature-gate";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrder } from "@/components/site/WebOrder";
import { storefrontMetadata } from "@/lib/site/metadata";
import { getServdBranding } from "@/server/branding/powered-by";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getPublicRestaurantBySlug(slug);
  const name = r ? r.displayName || r.name : "Restaurant";
  return storefrontMetadata({ name, tagline: r?.tagline, logoUrl: r?.logoUrl, coverImageUrl: r?.coverImageUrl });
}

async function getContact(restaurantId: string) {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId }, select: { printerConfig: true } }),
    );
    const c = (r?.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;
    return { address: c?.address ?? null, phone: c?.phone ?? null };
  } catch {
    return { address: null, phone: null };
  }
}

export default async function RestaurantSite({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const { slug } = await params;
  const { for: scheduleFor } = await searchParams;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();
  // Online ordering is a Growth+ feature — Free doesn't get a public order site.
  if (!(await hasFeature(restaurant.id, "onlineOrdering"))) notFound();

  const [categories, loyalty, contact, sf, rating, branding] = await Promise.all([
    getPublicMenu(restaurant.id),
    getLoyaltyConfig(restaurant.id),
    getContact(restaurant.id),
    getPublicStorefront(restaurant.id),
    getPublicRatingStats(restaurant.id),
    getServdBranding(restaurant.id),
  ]);

  return (
    <WebOrder
      slug={slug}
      restaurantName={restaurant.displayName || restaurant.name}
      logoUrl={restaurant.logoUrl}
      coverImageUrl={restaurant.coverImageUrl}
      rating={rating}
      categories={categories}
      contact={contact}
      loyalty={loyalty}
      hours={sf.hours}
      zones={sf.zones}
      openNow={isOpenNow(sf.hours)}
      // Both pause routes. pauseWhenClosed was never passed through before, so
      // that setting had no effect on the live site at all.
      pauseWhenClosed={sf.pauseWhenClosed}
      ordersPaused={sf.ordersPaused}
      poweredBy={branding.showFooter}
      homeHref={`/r/${slug}`}
      acceptsBookings={sf.acceptsBookings}
      bookHref={`/r/${slug}/book`}
      scheduleFor={scheduleFor}
      booking={sf.booking}
      payment={sf.payment}
      delivery={sf.delivery}
      storeCenter={
        sf.delivery.originLat != null && sf.delivery.originLng != null
          ? { lat: sf.delivery.originLat, lng: sf.delivery.originLng }
          : restaurant.latitude != null && restaurant.longitude != null
            ? { lat: restaurant.latitude, lng: restaurant.longitude }
            : null
      }
    />
  );
}
