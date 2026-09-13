import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/** True if a demo storefront belongs to this partner (ownership gate). */
export async function partnerOwnsDemo(id: string, partnerId: string): Promise<boolean> {
  try {
    const hit = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id, demoPartnerId: partnerId }, select: { id: true } }),
    );
    return !!hit;
  } catch {
    return false;
  }
}

export interface DemoLogin {
  converted: boolean;
  username: string | null;
}

/**
 * Whether a storefront has become a real account, and under what login.
 *
 * Kept separate from getDemoStorefront (which the super-admin screen shares) so
 * the partner detail page can ask this one question without either screen
 * having to carry the other's fields.
 *
 * The two facts are fetched separately on purpose. `username` arrives in a
 * manual migration (add-staff-username.sql), so a database that's behind the
 * code throws on it — and asking for both at once meant that throw took the
 * `converted` answer down with it, hiding the convert button on every demo. A
 * missing display detail must not be able to remove the button.
 */
export async function demoLogin(restaurantId: string): Promise<DemoLogin> {
  let converted = false;
  try {
    const staff = await systemDb((tx) =>
      tx.staffUser.findFirst({ where: { restaurantId }, select: { id: true } }),
    );
    converted = !!staff;
  } catch {
    // Can't tell whether a login exists. Say no: the convert action itself
    // re-checks and refuses a storefront that already has one, so an offered
    // button is recoverable — a missing one just looks broken.
    return { converted: false, username: null };
  }

  let username: string | null = null;
  try {
    const row = await systemDb((tx) =>
      tx.staffUser.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "asc" },
        select: { username: true },
      }),
    );
    username = row?.username ?? null;
  } catch {
    /* username column not migrated yet — the handle just isn't shown */
  }

  return { converted, username };
}

/**
 * Has this demo already had its one AI menu scan?
 *
 * `menuScannedAt` is the real record, and it survives the partner deleting the
 * items afterwards. It arrives in a manual migration though, so until that's
 * applied this falls back to "does the storefront already have menu items?" —
 * softer (clearing the menu would buy another scan) but it still holds the rule
 * on a database that's behind the code, which is the state that matters.
 */
export async function demoAlreadyScanned(restaurantId: string): Promise<boolean> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId }, select: { menuScannedAt: true } }),
    );
    return !!r?.menuScannedAt;
  } catch {
    /* menuScannedAt not migrated yet — fall through */
  }
  try {
    const item = await systemDb((tx) =>
      tx.menuItem.findFirst({ where: { restaurantId }, select: { id: true } }),
    );
    return !!item;
  } catch {
    // Can't tell. Allow it: a scan that should have been blocked costs one
    // vision call, where a wrongly blocked one leaves the partner unable to
    // build the storefront at all.
    return false;
  }
}

export interface PartnerDemoRow {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
  createdAt: string;
  /** Converted to a real account — it has a login the owner uses. */
  converted: boolean;
  /** The owner's login handle, once converted. */
  username: string | null;
}

/**
 * Storefronts a partner has built (newest first) — both the demos still being
 * pitched and the ones that became real accounts.
 *
 * "Real account" is decided by whether a login exists, not by restaurant
 * status: a demo is created `active` too (its ordering page has to work while
 * it's being shown around), so status can't tell the two apart. A staff row is
 * exactly what conversion adds.
 */
export async function listPartnerDemos(partnerId: string): Promise<PartnerDemoRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { demoPartnerId: partnerId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          createdAt: true,
          _count: { select: { menuItems: true, staff: true } },
        },
      }),
    );

    // The login handle is a nice-to-have label, and `username` arrives in a
    // manual migration — so it's fetched on its own. Folded into the query
    // above, a database without that column would throw and take the whole
    // storefront list with it, leaving the partner staring at "No demos yet".
    let usernames = new Map<string, string | null>();
    try {
      const staff = await systemDb((tx) =>
        tx.staffUser.findMany({
          where: { restaurantId: { in: rows.map((r) => r.id) } },
          orderBy: { createdAt: "asc" },
          select: { restaurantId: true, username: true },
        }),
      );
      usernames = staff.reduce(
        (m, s) => (m.has(s.restaurantId) ? m : m.set(s.restaurantId, s.username)),
        new Map<string, string | null>(),
      );
    } catch {
      /* username column not migrated yet — the handle just isn't shown */
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.displayName || r.name,
      slug: r.slug,
      itemCount: r._count.menuItems,
      createdAt: r.createdAt.toISOString(),
      converted: r._count.staff > 0,
      username: usernames.get(r.id) ?? null,
    }));
  } catch {
    return []; // demoPartnerId column not migrated yet
  }
}
