import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process.
 *
 * Next's dev server reloads modules on every edit; without the global cache
 * each reload opens a new pool and Postgres runs out of connections within a
 * few minutes. Same pattern as apps/servd/src/server/db.ts, and the same
 * reason.
 *
 * Resceta and Servd share one schema and one database (D25) but hold separate
 * clients, because they are separate processes. Nothing is shared at runtime
 * except the database itself.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
