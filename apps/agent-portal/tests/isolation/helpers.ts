import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Raw scopes for the DB-backed tests. Deliberately NOT the app's own
 * scoped-db: these tests are about what Postgres refuses, so they set the
 * GUCs by hand and run as app_user with no where clauses.
 *
 * Skips without DATABASE_URL, like every other DB-backed suite here.
 */
export const hasDb = !!process.env.DATABASE_URL;
export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;

export function asSuper<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

function asRole<T>(guc: string, value: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('role', 'app_user', true), set_config('${guc}', '${value}', true)`,
    );
    return fn(tx);
  });
}

export const asAgent = <T>(agentId: string, fn: (tx: Tx) => Promise<T>) =>
  asRole("app.current_agent_id", agentId, fn);
export const asVerifier = <T>(fn: (tx: Tx) => Promise<T>) => asRole("app.portal_role", "verifier", fn);
export const asAdmin = <T>(fn: (tx: Tx) => Promise<T>) => asRole("app.portal_role", "admin", fn);
