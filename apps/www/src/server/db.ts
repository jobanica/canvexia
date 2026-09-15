import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process.
 *
 * Next's dev server reloads modules on every edit; without the global cache
 * each reload opens a new pool and Postgres runs out of connections within a
 * few minutes. Same pattern, and the same reason, as apps/servd and
 * apps/resceta — three processes against one database (D25), each holding its
 * own client.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
