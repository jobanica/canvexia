import type { Prisma } from "@prisma/client";

/**
 * Fixed-window counting, shared.
 *
 * The counting is in the database and not in memory for the reason
 * apps/servd's limiter has always given: every serverless invocation is a
 * fresh process, so an in-memory counter resets constantly and enforces
 * nothing. That argument applies verbatim to canvexia.com's waitlist form,
 * which is why this moved here instead of being written a second time — and
 * why the brief's "simple in-memory or Upstash" is answered with neither. No
 * new dependency, paid or otherwise.
 *
 * What stays in each app: the bucket names, the allowances, and reading the
 * client IP out of the request. What is shared is the one thing that must not
 * drift — the window arithmetic and the upsert.
 */

/** One hour. A window shorter than this is a nuisance, longer is a memory. */
export const RATE_WINDOW_MS = 60 * 60 * 1000;

export type RateHit = {
  /** Hits in the current window INCLUDING this one. */
  count: number;
  /** When the current window ends. */
  resetAt: Date;
};

/**
 * Count one hit against (bucket, key) and report the running total.
 *
 * Deliberately returns a number rather than a verdict: the allowance belongs to
 * the caller, and a shared function that also decided the limit would need a
 * registry of every app's buckets.
 */
export async function hitRateLimitIn(
  tx: Prisma.TransactionClient,
  bucket: string,
  key: string,
  windowMs: number = RATE_WINDOW_MS,
): Promise<RateHit> {
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  const windowAt = new Date(start);
  const row = await tx.rateLimit.upsert({
    where: { bucket_key_windowAt: { bucket, key, windowAt } },
    create: { bucket, key, windowAt, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return { count: row.count, resetAt: new Date(start + windowMs) };
}

/** Hash an IP so requesters can be told apart without being identified. */
export async function hashKey(raw: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
