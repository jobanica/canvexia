import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * All staff logins for the restaurant.
 *
 * Columns are named rather than left to Prisma's "everything" default: a column
 * added to StaffUser later would otherwise land in this query and break the
 * staff page on any database that hasn't run the migration yet.
 *
 * A temporary preview login is deliberately excluded. It's a sales tool that
 * exists for a few days on a demo storefront, not somebody's colleague, and
 * listing it here would invite an owner to manage or count it as headcount.
 */
export function listStaff(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.staffUser.findMany({
      where: { previewExpiresAt: null },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        restaurantId: true,
        authUserId: true,
        role: true,
        email: true,
        username: true,
        displayName: true,
        createdAt: true,
      },
    }),
  );
}
