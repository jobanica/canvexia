import { Prisma } from "@prisma/client";
import { GUC, SUPER_ADMIN_ON } from "@servd/core";
import { prisma } from "@/server/db";

/**
 * SCOPED DATABASE ACCESS for the agent portal.
 *
 *   agentDb(agentId, fn)  — one agent. Postgres returns their own rows and
 *                           nothing of any other agent's.
 *   staffDb(role, fn)     — portal staff. 'admin' reads and writes every
 *                           agent-portal table; 'verifier' may review receipts
 *                           and nothing else. Neither reaches any product's
 *                           tables.
 *   systemDb(fn)          — trusted system context: the signed product API,
 *                           the public application form, identity lookup.
 *                           Bypasses every policy, so it is for callers that
 *                           have no portal login to scope by, not for making a
 *                           query return rows.
 *
 * The policies are in packages/db/prisma/rls.sql, "Agent portal (D37)".
 * Same mechanics as Servd's and Resceta's scoped-db: SET LOCAL role app_user
 * (no BYPASSRLS) plus one GUC, inside the transaction, in one round-trip.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Tx = Prisma.TransactionClient;
export type StaffRole = "admin" | "verifier";

const TX_OPTS = { timeout: 15_000 } as const;

/**
 * $executeRawUnsafe because PgBouncer in transaction mode recycles named
 * prepared statements across backends (42P05). The only interpolated value is
 * checked against a UUID pattern or a two-item allow-list first.
 */
function scopeStatement(gucName: string, value: string): string {
  return (
    `SELECT set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')` +
    ` THEN 'app_user' ELSE current_setting('role') END, true),` +
    ` set_config('${gucName}', '${value}', true)`
  );
}

export async function agentDb<T>(agentId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(agentId)) throw new Error("agentDb: invalid agentId");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(scopeStatement(GUC.agentId, agentId));
    return fn(tx);
  }, TX_OPTS);
}

export async function staffDb<T>(role: StaffRole, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (role !== "admin" && role !== "verifier") throw new Error("staffDb: invalid role");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(scopeStatement(GUC.portalRole, role));
    return fn(tx);
  }, TX_OPTS);
}

export async function systemDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select set_config('${GUC.superAdmin}', '${SUPER_ADMIN_ON}', true)`);
    return fn(tx);
  }, TX_OPTS);
}
