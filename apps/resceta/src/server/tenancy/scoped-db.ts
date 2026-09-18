import { Prisma } from "@prisma/client";
import { GUC, MERCHANT_AXES, SUPER_ADMIN_ON } from "@servd/core";
import { prisma } from "@/server/db";

/**
 * TENANT-SCOPED DATABASE ACCESS — the pharmacy axis.
 *
 * The same three wrappers Servd has, against the same database, differing in
 * exactly one thing: the GUC they set is `app.current_pharmacy_id` rather than
 * `app.current_restaurant_id`, because a pharmacy's tenant tables key on
 * `pharmacyId`. Both names come from MERCHANT_AXES so neither is typed out
 * twice.
 *
 *   pharmacyDb(pharmacyId, fn) — scope every query to ONE pharmacy.
 *   partnerDb(partnerId, fn)   — scope to ONE partner: the pharmacies it owns,
 *                                and nothing of any other partner's.
 *   systemDb(fn)               — trusted system context. Bypasses tenant RLS.
 *
 * Reach for the NARROWEST one that can do the job. systemDb is not "the one
 * that works": it turns every policy off, and code that reaches for it to make
 * a query return rows has usually just disabled the thing that was protecting
 * it.
 *
 * Why this file is not in packages/db: it needs a PrismaClient instance, and
 * the instance belongs to the app that owns the process. What IS shared — the
 * GUC names and the axis definitions — lives in @servd/core, which is the part
 * that must not drift. The twenty lines below are the part that may.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tx = Prisma.TransactionClient;

/**
 * Set the non-privileged role and ONE scope GUC in a single round-trip.
 *
 * `app_user` has no BYPASSRLS, so policies are enforced even if the pooled
 * connection role could otherwise ignore them. The CASE keeps this working on a
 * database where rls.sql has not been run yet, instead of failing every query
 * with "role does not exist".
 *
 * $executeRawUnsafe avoids named prepared statements, which PgBouncer in
 * transaction mode recycles across backends and then reports as 42P05. The only
 * interpolated value is `scopeValue`, and the UUID check is what makes that
 * safe — enforcement, not a comment.
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

export async function pharmacyDb<T>(
  pharmacyId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(pharmacyId)) {
    throw new Error("pharmacyDb: invalid pharmacyId");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(scopeStatement(MERCHANT_AXES.pharmacy.guc, pharmacyId));
    return fn(tx);
  });
}

/**
 * Scope every query to one CANVEXIA partner.
 *
 * The policies resolve this through pharmacies."partnerId", so a partner sees
 * its own merchants' rows and none of another partner's — enforced by Postgres,
 * not by remembering a where clause. Identical in shape to Servd's partnerDb,
 * and deliberately so: the partner arm is the one thing every product shares.
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

/**
 * `timeout` is in milliseconds and defaults to PRISMA'S OWN 5 SECONDS.
 *
 * It exists because bulk work — importing a two-thousand-row price list — is
 * real work that cannot be done in five seconds, and the failure it produced
 * was invisible: Prisma kills the transaction, Postgres rolls it back, and the
 * caller sees a generic error with no hint that a CLOCK was the problem.
 *
 * Raising it is not a licence to do slow things in a transaction. A long
 * transaction holds a pooled connection and blocks nothing else usefully, so
 * the bulk paths CHUNK first and raise this second.
 */
export interface TxOptions {
  timeout?: number;
  maxWait?: number;
}

export async function systemDb<T>(
  fn: (tx: Tx) => Promise<T>,
  opts?: TxOptions,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('${GUC.superAdmin}', '${SUPER_ADMIN_ON}', true)`,
      );
      return fn(tx);
    },
    opts?.timeout === undefined && opts?.maxWait === undefined
      ? undefined
      : { timeout: opts.timeout, maxWait: opts.maxWait },
  );
}
