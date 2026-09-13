import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getPublicStorefront } from "@/server/storefront/storefront";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrderTracker } from "@/components/site/WebOrderTracker";

export const metadata = { title: "Track your order" };

/** Permanent, shareable order-status page on a branded host. */
export default async function SiteTrackOrderPage({
  params,
}: {
  params: Promise<{ host: string; orderId: string }>;
}) {
  const { host, orderId } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const order = await systemDb((tx) =>
    tx.order.findFirst({ where: { id: orderId, restaurantId: restaurant.id }, select: { orderType: true } }),
  ).catch(() => null);
  if (!order) notFound();

  const isDelivery = order.orderType === "delivery";
  const sf = isDelivery ? await getPublicStorefront(restaurant.id).catch(() => null) : null;
  const contact = sf?.delivery.selfBookRider
    ? await systemDb((tx) => tx.restaurant.findFirst({ where: { id: restaurant.id }, select: { printerConfig: true } })).catch(() => null)
    : null;
  const pickupAddress = (contact?.printerConfig as { receipt?: { address?: string } } | null)?.receipt?.address ?? null;

  return (
    <WebOrderTracker
      slug={restaurant.slug}
      orderId={orderId}
      orderType={isDelivery ? "delivery" : "pickup"}
      restaurantName={restaurant.displayName || restaurant.name}
      homeHref="/"
      selfBookRider={isDelivery && !!sf?.delivery.selfBookRider}
      selfBookRiderNote={sf?.delivery.selfBookRiderNote}
      pickupAddress={pickupAddress}
    />
  );
}
