import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getPublicStorefront } from "@/server/storefront/storefront";
import { hasFeature } from "@/server/billing/feature-gate";
import { BookingForm } from "@/components/site/BookingForm";

/** Branded host — advance table booking on the restaurant's white-label site. */
export default async function SiteBookPage({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const [reservationsOn, sf] = await Promise.all([
    hasFeature(restaurant.id, "reservations"),
    getPublicStorefront(restaurant.id),
  ]);
  if (!reservationsOn || !sf.acceptsBookings) notFound();

  return (
    <BookingForm
      slug={restaurant.slug}
      restaurantName={restaurant.displayName || restaurant.name}
      logoUrl={restaurant.logoUrl}
      hours={sf.hours}
      homeHref="/"
      orderHref="/"
    />
  );
}
