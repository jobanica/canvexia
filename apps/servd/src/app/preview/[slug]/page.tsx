import { notFound } from "next/navigation";
import { getPublicMenu } from "@/server/menu/public-menu";
import { defaultPaymentConfig, defaultDeliveryConfig, defaultBookingConfig } from "@/server/storefront/storefront";
import { getPreviewRestaurant, stampPreviewReached } from "@/server/build/queries";
import { readBuildCookie } from "@/server/build/session";
import { PreviewStorefront } from "@/components/build/PreviewStorefront";

export const metadata = { robots: { index: false, follow: false } };

/**
 * A DIY build's storefront, rendered with the real ordering UI in demo mode.
 *
 * This route exists SEPARATELY from /r/[slug] on purpose: every live path —
 * the storefront loader, order placement, checkout, bill requests — filters on
 * `status = 'active'`, so a preview restaurant is structurally incapable of
 * taking a real order or being found at its future live URL. Demo gating is a
 * property of the data, not a hidden button.
 */
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getPreviewRestaurant(slug);
  if (!restaurant) notFound();

  const categories = await getPublicMenu(restaurant.id);

  // Only the builder (the cookie holder) is offered the payment button; anyone
  // they share the link with still gets the full browse-and-checkout demo.
  const isOwner = (await readBuildCookie()) === restaurant.buildToken;
  if (isOwner) {
    // Funnel: stamp "reached preview" the first time they land here.
    await stampPreviewReached(restaurant.id);
  }

  return (
    <PreviewStorefront
      isOwner={isOwner}
      buildHref="/build"
      order={{
        slug,
        restaurantName: restaurant.displayName || restaurant.name,
        logoUrl: restaurant.logoUrl,
        coverImageUrl: restaurant.coverImageUrl,
        categories,
        contact: { address: null, phone: null },
        hours: undefined,
        zones: [],
        openNow: true,
        homeHref: `/preview/${slug}`,
        booking: defaultBookingConfig(),
        payment: { ...defaultPaymentConfig(), codEnabled: true },
        delivery: defaultDeliveryConfig(),
        storeCenter: null,
      }}
    />
  );
}
