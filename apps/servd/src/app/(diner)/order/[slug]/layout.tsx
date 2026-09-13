import { notFound } from "next/navigation";
import { BrandProvider } from "@/components/diner/BrandProvider";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";

/**
 * Diner route layout. Everything under /order/[slug] is WHITE-LABEL: it wears
 * the restaurant's own branding, never the Servd identity. We resolve the
 * restaurant once here and apply its colors via <BrandProvider>.
 */
export default async function DinerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  return <BrandProvider brand={restaurant}>{children}</BrandProvider>;
}
