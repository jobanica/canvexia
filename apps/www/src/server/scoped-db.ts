import "server-only";
import type { Prisma } from "@prisma/client";
import { GUC, SUPER_ADMIN_ON } from "@servd/core";
import { prisma } from "./db";

/**
 * This app has ONE scope, and it is the trusted one.
 *
 * canvexia.com has no accounts, no session and no tenant: the only rows it
 * touches are `territories` (reference data) and `partner_waitlist` (locked to
 * the super-admin context), so the tenant wrappers the other apps carry —
 * restaurantDb, pharmacyDb, partnerDb — would have nothing to scope to and are
 * deliberately absent rather than copied across and left unused.
 *
 * That makes the rule elsewhere ("reach for the narrowest wrapper that can do
 * the job") read strangely here, so it is worth being explicit: systemDb is the
 * narrowest wrapper in this app because this app is a publisher and a form.
 * The moment something here needs to read a merchant's rows, it needs a scope,
 * and this file is the wrong place to bypass one.
 */
type Tx = Prisma.TransactionClient;

export async function systemDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('${GUC.superAdmin}', '${SUPER_ADMIN_ON}', true)`,
    );
    return fn(tx);
  });
}
