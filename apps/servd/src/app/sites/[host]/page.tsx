import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getPublicMenu } from "@/server/menu/public-menu";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { getPublicStorefront, isOpenNow } from "@/server/storefront/storefront";
import { getPublicRatingStats } from "@/server/feedback/queries";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrder } from "@/components/site/WebOrder";
import { storefrontMetadata } from "@/lib/site/metadata";
import { getServdBranding } from "@/server/branding/powered-by";

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const r = await getRestaurantByHost(decodeURIComponent(host));
  const name = r ? r.displayName || r.name : "Order online";
  return storefrontMetadata({ name, tagline: r?.tagline, logoUrl: r?.logoUrl, coverImageUrl: r?.coverImageUrl });
}

/** Branded host — the restaurant's white-label website + online ordering. */
export default async function SiteHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const { host } = await params;
  const { for: scheduleFor } = await searchParams;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const [categories, loyalty, sf, contactRow, rating, branding] = await Promise.all([
    getPublicMenu(restaurant.id),
    getLoyaltyConfig(restaurant.id),
    getPublicStorefront(restaurant.id),
    systemDb((tx) => tx.restaurant.findFirst({ where: { id: restaurant.id }, select: { printerConfig: true } })).catch(() => null),
    getPublicRatingStats(restaurant.id),
    getServdBranding(restaurant.id),
  ]);
  const c = (contactRow?.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;

  return (
    <WebOrder
      slug={restaurant.slug}
      restaurantName={restaurant.displayName || restaurant.name}
      logoUrl={restaurant.logoUrl}
      coverImageUrl={restaurant.coverImageUrl}
      rating={rating}
      categories={categories}
      contact={{ address: c?.address ?? null, phone: c?.phone ?? null }}
      loyalty={loyalty}
      hours={sf.hours}
      zones={sf.zones}
      openNow={isOpenNow(sf.hours)}
      // Both pause routes. pauseWhenClosed was never passed through before, so
      // that setting had no effect on the live site at all.
      pauseWhenClosed={sf.pauseWhenClosed}
      ordersPaused={sf.ordersPaused}
      poweredBy={branding.showFooter}
      homeHref="/"
      acceptsBookings={sf.acceptsBookings}
      bookHref="/book"
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
