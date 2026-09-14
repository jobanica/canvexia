import { Prisma } from "@prisma/client";
import { GUC, SUPER_ADMIN_ON } from "@servd/core";
import { prisma } from "@/server/db";

/**
 * TENANT-SCOPED DATABASE ACCESS
 *
 * Each of these wraps your queries in a transaction that first sets a Postgres
 * session variable. The RLS policies in packages/db/prisma/rls.sql read that variable and
 * filter every row accordingly. This is layer #2 of isolation — the database
 * enforces the boundary even if the app forgets to.
 *
 *   tenantDb(restaurantId, fn)  — scope all queries to ONE restaurant.
 *   partnerDb(partnerId, fn)    — scope to ONE partner: the merchants it owns,
 *                                 and nothing of any other partner's.
 *   systemDb(fn)                — trusted super-admin / system context (webhooks,
 *                                 platform admin, seeding). Bypasses tenant RLS.
 *
 * Reach for the NARROWEST one that can do the job. systemDb is not "the one that
 * works" — it turns every policy off, and code that reaches for it to make a
 * query return rows has usually just disabled the thing that was protecting it.
 * The partner portal is the live example: it reads through systemDb today, so a
 * forgotten `where partnerId` there is one partner reading another's merchants
 * rather than a 403. Phase 3 moves it onto partnerDb.
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

/**
 * Set the non-privileged role and ONE scope GUC in a single round-trip.
 *
 * Latency matters — this runs before every scoped query — and both settings have
 * to land in the same transaction as the query they protect, so they go in one
 * statement rather than two awaits.
 *
 * `app_user` has no BYPASSRLS, so policies are enforced even if the pooled
 * connection role could otherwise ignore them. The CASE keeps this working on a
 * database where rls.sql has not been run yet, instead of failing every query
 * with "role does not exist".
 *
 * $executeRawUnsafe avoids named prepared statements, which PgBouncer in
 * transaction mode recycles across backends and then reports as 42P05. The only
 * interpolated value is `scopeValue`, and the UUID check below is what makes
 * that safe — enforcement, not a comment.
 */
function scopeStatement(gucName: string, scopeValue: string): string {
  if (!UUID_RE.test(scopeValue)) {
    throw new Error(`scopeStatement: value for ${gucName} is not a UUID`);
  }
  return (
    `SELECT set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')` +
    ` THEN 'app_user' ELSE current_setting('role') END, true),` +
    ` set_config('${gucName}', '${scopeValue}', true)`
  );
}

export async function tenantDb<T>(
  restaurantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(restaurantId)) {
    throw new Error("tenantDb: invalid restaurantId");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(scopeStatement(GUC.restaurantId, restaurantId));
    return fn(tx);
  });
}

/**
 * Scope every query to one CANVEXIA partner.
 *
 * The policies resolve this through restaurants."partnerId", so a partner sees
 * its own merchants' rows and none of another partner's — enforced by Postgres,
 * not by remembering a where clause.
 *
 * Note what this deliberately does NOT grant: the child tables that isolate
 * through a parent (order_items, payments, modifiers, sms_messages) carry no
 * partner arm yet, so under this scope they read as empty rather than as another
 * partner's rows. Empty is the safe direction, and nothing in the portal needs
 * them until the statements work in Phase 4.
 */
export async function partnerDb<T>(
  partnerId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(partnerId)) {
    throw new Error("partnerDb: invalid partnerId");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(scopeStatement(GUC.partnerId, partnerId));
    return fn(tx);
  });
}

export async function systemDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // $executeRawUnsafe avoids prepared statements (safe: no user input here).
    await tx.$executeRawUnsafe(`select set_config('${GUC.superAdmin}', '${SUPER_ADMIN_ON}', true)`);
    return fn(tx);
  });
}
