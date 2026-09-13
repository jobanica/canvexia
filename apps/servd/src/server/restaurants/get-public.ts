import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Public, diner-facing restaurant lookup by slug. Diners have no session, so we
 * resolve in the trusted system context — but we SELECT ONLY diner-safe fields
 * (never payment credentials, SMS balance, etc.). Returns null if not found or
 * not active.
 */
export async function getPublicRestaurantBySlug(slug: string) {
  const hit = await bySlug(slug);
  if (hit) return hit;
  // Nothing at that address. Before giving up, check whether it's an address a
  // shop USED to have: a QR code printed and stuck to a table last year still
  // carries the old one, and the owner correcting a typo must not turn every
  // tent card in the building into a 404.
  //
  // Second query, and only on a miss, so the normal path is unchanged. Wrapped
  // because previousSlug ships as a hand-run migration — a database without the
  // column behaves exactly as it did before this existed.
  try {
    return await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { previousSlug: slug, status: "active" },
        select: PUBLIC_FIELDS,
      }),
    );
  } catch {
    return null;
  }
}

function bySlug(slug: string) {
  return systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug, status: "active" }, select: PUBLIC_FIELDS }),
  );
}

/** Diner-safe columns only — never payment credentials, SMS balance, etc. */
const PUBLIC_FIELDS = {
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

/** Validates a table token belongs to the restaurant. Returns the table or null. */
export async function getTableByToken(restaurantId: string, qrToken: string) {
  const table = await systemDb((tx) =>
    tx.table.findFirst({
      where: { restaurantId, qrToken },
      select: { id: true, tableNumber: true },
    }),
  );
  if (!table) return null;
  // isCounter may not exist yet on a lagging DB — read it best-effort.
  let isCounter = false;
  try {
    const c = await systemDb((tx) =>
      tx.table.findFirst({ where: { id: table.id }, select: { isCounter: true } }),
    );
    isCounter = c?.isCounter ?? false;
  } catch {
    /* column not migrated yet */
  }
  return { ...table, isCounter };
}
