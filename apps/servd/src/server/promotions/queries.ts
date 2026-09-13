import "server-only";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";

export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  code: string | null;
  type: string;
  value: number;
  freeItemId: string | null;
  minSpend: number;
  expiresAt: Date | null;
  active: boolean;
  sortOrder: number;
}

const SELECT = {
  id: true,
  title: true,
  description: true,
  code: true,
  type: true,
  value: true,
  freeItemId: true,
  minSpend: true,
  expiresAt: true,
  active: true,
  sortOrder: true,
} as const;

/** All promotions for the admin (active + inactive). Resilient to a missing table. */
export async function getPromotions(restaurantId: string): Promise<Promotion[]> {
  try {
    return await tenantDb(restaurantId, (tx) =>
      tx.promotion.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: SELECT,
      }),
    );
  } catch {
    return [];
  }
}

/** Active, non-expired promotions for the diner app. Resilient to a missing table. */
export async function getActivePromotions(restaurantId: string): Promise<Promotion[]> {
  try {
    return await systemDb((tx) =>
      tx.promotion.findMany({
        where: {
          restaurantId,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: SELECT,
      }),
    );
  } catch {
    return [];
  }
}
