import { notFound } from "next/navigation";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { getPublicStorefront } from "@/server/storefront/storefront";
import { hasFeature } from "@/server/billing/feature-gate";
import { BookingForm } from "@/components/site/BookingForm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getPublicRestaurantBySlug(slug);
  const name = r ? r.displayName || r.name : "Restaurant";
  return { title: `Book a table — ${name}`, description: `Reserve a table at ${name}.` };
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const [reservationsOn, sf] = await Promise.all([
    hasFeature(restaurant.id, "reservations"),
    getPublicStorefront(restaurant.id),
  ]);
  // Booking is only visible when the plan includes reservations and the owner
  // has switched it on for the website.
  if (!reservationsOn || !sf.acceptsBookings) notFound();

  return (
    <BookingForm
      slug={slug}
      restaurantName={restaurant.displayName || restaurant.name}
      logoUrl={restaurant.logoUrl}
      hours={sf.hours}
      homeHref={`/r/${slug}`}
      orderHref={`/r/${slug}`}
    />
  );
}
