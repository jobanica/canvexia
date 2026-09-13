import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

export interface DemoStorefrontRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  itemCount: number;
  createdAt: string;
}

/**
 * Demo storefronts = tenants with no REAL login account.
 *
 * "No staff at all" would be wrong now: a demo can carry a temporary preview
 * login while it's being pitched, and that must not make it disappear from the
 * very list the person pitching it is working from.
 */
export async function listDemoStorefronts(): Promise<DemoStorefrontRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        // Also login-less, but a different funnel entirely: DIY previews belong
        // on the funnel page, not in the partner/super-admin demo list.
        where: { staff: { none: { previewExpiresAt: null } }, status: { notIn: ["preview", "archived"] } },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          createdAt: true,
          _count: { select: { menuItems: true } },
        },
      }),
    );
    return rows.map(toRow);
  } catch {
    // The preview column isn't migrated here. Fall back to the original
    // "no staff at all" rule rather than returning nothing: an empty demo list
    // looks like the demos were deleted.
    try {
      const rows = await systemDb((tx) =>
        tx.restaurant.findMany({
          where: { staff: { none: {} }, status: { notIn: ["preview", "archived"] } },
          orderBy: { createdAt: "desc" },
          take: 300,
          select: {
            id: true,
            name: true,
            displayName: true,
            slug: true,
            status: true,
            createdAt: true,
            _count: { select: { menuItems: true } },
          },
        }),
      );
      return rows.map(toRow);
    } catch {
      return [];
    }
  }
}

function toRow(r: {
  id: string;
  name: string;
  displayName: string | null;
  slug: string;
  status: string;
  createdAt: Date;
  _count: { menuItems: number };
}): DemoStorefrontRow {
  return {
    id: r.id,
    name: r.displayName || r.name,
    slug: r.slug,
    status: r.status,
    itemCount: r._count.menuItems,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface DemoMenuItem {
  id: string;
  name: string;
  price: number; // centavos
  description: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
}
export interface DemoCategory {
  id: string;
  name: string;
  items: DemoMenuItem[];
}
export interface DemoStorefront {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  previewPostUrl: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  categories: DemoCategory[];
}

export async function getDemoStorefront(id: string): Promise<DemoStorefront | null> {
  try {
    return await systemDb(async (tx) => {
      const r = await tx.restaurant.findFirst({
        where: { id },
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          logoUrl: true,
          coverImageUrl: true,
          previewPostUrl: true,
          tagline: true,
          printerConfig: true,
        },
      });
      if (!r) return null;
      const cats = await tx.category.findMany({
        where: { restaurantId: id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          menuItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true, price: true, description: true, imageUrl: true, isAvailable: true },
          },
        },
      });
      const contact = (r.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;
      return {
        id: r.id,
        name: r.displayName || r.name,
        slug: r.slug,
        status: r.status,
        logoUrl: r.logoUrl,
        coverImageUrl: r.coverImageUrl,
        previewPostUrl: r.previewPostUrl,
        tagline: r.tagline,
        address: contact?.address || null,
        phone: contact?.phone || null,
        categories: cats.map((c) => ({ id: c.id, name: c.name, items: c.menuItems })),
      };
    });
  } catch {
    return null;
  }
}
