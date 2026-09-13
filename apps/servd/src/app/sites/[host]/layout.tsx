import { notFound } from "next/navigation";
import { BrandProvider } from "@/components/diner/BrandProvider";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";

/**
 * White-label layout for branded hosts (subdomain / custom domain). Resolves the
 * restaurant from the host and applies its brand — same skin as the diner group.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  return <BrandProvider brand={restaurant}>{children}</BrandProvider>;
}
