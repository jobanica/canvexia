import { tenantDb } from "@/server/tenancy/scoped-db";

/** Seating tables for the restaurant (excludes the counter QR). Tenant-scoped. */
export async function getTables(restaurantId: string) {
  const select = { id: true, tableNumber: true, qrToken: true, createdAt: true } as const;
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.table.findMany({ where: { isCounter: false }, orderBy: { createdAt: "asc" }, select }),
    );
  } catch {
    // isCounter column not migrated yet — return all tables.
    return tenantDb(restaurantId, (tx) =>
      tx.table.findMany({ orderBy: { createdAt: "asc" }, select }),
    );
  }
}

/** The restaurant's single counter/takeout QR row, or null if not set up. */
export async function getCounterTable(restaurantId: string) {
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.table.findFirst({
        where: { isCounter: true },
        select: { id: true, tableNumber: true, qrToken: true },
      }),
    );
  } catch {
    return null; // column not migrated yet
  }
}

/** The restaurant's slug + name — needed to build QR URLs and label the sheet. */
export function getRestaurantBrief(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: {
        name: true,
        displayName: true,
        slug: true,
        subdomain: true,
        customDomain: true,
        customDomainVerifiedAt: true,
      },
    }),
  );
}
