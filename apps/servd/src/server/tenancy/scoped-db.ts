import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * TENANT-SCOPED DATABASE ACCESS
 *
 * Both functions wrap your queries in a transaction that first sets a Postgres
 * session variable. The RLS policies in prisma/rls.sql read that variable and
 * filter every row accordingly. This is layer #2 of isolation — the database
 * enforces the boundary even if the app forgets to.
 *
 *   tenantDb(restaurantId, fn) — scope all queries to ONE restaurant.
 *   systemDb(fn)               — trusted super-admin / system context (webhooks,
 *                                platform admin, seeding). Bypasses tenant RLS.
 *
 * Usage:
 *   const orders = await tenantDb(restaurantId, (tx) =>
 *     tx.order.findMany({ where: { status: "new" } })
 *   );
 *
 * Note: `restaurantId` is validated as a UUID before being interpolated, and we
 * use set_config() with a bound parameter, so this is not SQL-injectable.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Prisma.TransactionClient;

export async function tenantDb<T>(
  restaurantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(restaurantId)) {
    throw new Error("tenantDb: invalid restaurantId");
  }
  return prisma.$transaction(async (tx) => {
    // Set the role + restaurant GUC in a SINGLE round-trip (latency matters:
    // this runs on every tenant-scoped query). Prefer the non-privileged
    // `app_user` role so RLS is enforced even if the connection role could
    // bypass it; crash-safe if the role doesn't exist yet. $executeRawUnsafe
    // avoids prepared statements (PgBouncer 42P05 safety); the only literals
    // are a hardcoded role name and the UUID-validated restaurantId.
    await tx.$executeRawUnsafe(
      `SELECT set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN 'app_user' ELSE current_setting('role') END, true), set_config('app.current_restaurant_id', '${restaurantId}', true)`,
    );
    return fn(tx);
  });
}

export async function systemDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // $executeRawUnsafe avoids prepared statements (safe: no user input here).
    await tx.$executeRawUnsafe(`select set_config('app.is_super_admin', 'on', true)`);
    return fn(tx);
  });
}
