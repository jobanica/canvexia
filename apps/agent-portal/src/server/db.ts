import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process — the global cache stops Next's dev server
 * opening a new pool on every reload. Same pattern as apps/servd and
 * apps/resceta, against the same database (D25), in a separate process.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
