import { systemDb } from "@/server/tenancy/scoped-db";
import { parseHost } from "@/lib/host";

const PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  displayName: true,
  logoUrl: true,
  coverImageUrl: true,
  tagline: true,
  brandPrimaryColor: true,
  brandAccentColor: true,
  paymentOnlineEnabled: true,
  googleReviewUrl: true,
  feedbackMode: true,
  latitude: true,
  longitude: true,
} as const;

/**
 * Resolves the active, public restaurant for a branded host (a *.ROOT subdomain
 * or a connected custom domain). Returns null if no match / not active.
 */
export async function getRestaurantByHost(host: string) {
  const info = parseHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
  if (info.kind === "platform") return null;

  return systemDb((tx) =>
    tx.restaurant.findFirst({
      where: {
        status: "active",
        ...(info.kind === "subdomain"
          ? { subdomain: info.subdomain }
          : { customDomain: info.host }),
      },
      select: PUBLIC_SELECT,
    }),
  );
}
