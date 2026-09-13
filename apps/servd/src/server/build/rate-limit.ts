import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Fixed-window rate limiting for the PUBLIC builder.
 *
 * /build writes to the database with no session behind it, so without a limit
 * it's a free spam and storage-abuse endpoint. Counting lives in the database
 * rather than in memory because every serverless invocation is a fresh process
 * — an in-memory counter would reset constantly and enforce nothing.
 *
 * The client IP is hashed before it's stored: we need to tell requesters apart,
 * we don't need to know who they are.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export type Bucket =
  | "build:create"
  | "build:write"
  | "build:upload"
  | "build:activate"
  | "landing:event";

/** Per-hour allowance for each bucket, per IP. */
const LIMITS: Record<Bucket, number> = {
  "build:create": 5, // new previews started
  "build:write": 300, // edits (menu rows add up fast — this is generous on purpose)
  "build:upload": 40, // logo + item photos
  "build:activate": 10, // invoice attempts
  // Landing beacons: generous, because one visitor legitimately fires several
  // (a view plus a click, and they may come back). This is a graffiti guard on
  // the founder's ad numbers, not a gate on anything that matters.
  "landing:event": 200,
};

/** Hashed client IP, or "unknown" behind a proxy that strips everything. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Counts one hit and reports whether the caller is over the limit. Fails OPEN:
 * if the table isn't migrated yet (or the write errors) we let the request
 * through rather than breaking the funnel — this is abuse control, not an
 * authorization boundary.
 */
export async function rateLimit(bucket: Bucket): Promise<{ ok: boolean; error?: string }> {
  const key = await clientKey();
  const windowAt = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);
  try {
    const row = await systemDb((tx) =>
      tx.rateLimit.upsert({
        where: { bucket_key_windowAt: { bucket, key, windowAt } },
        create: { bucket, key, windowAt, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      }),
    );
    if (row.count > LIMITS[bucket]) {
      return { ok: false, error: "You're going a bit fast. Please try again in a little while." };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/** Drops spent windows. Called from the nightly cron. */
export async function pruneRateLimits(): Promise<number> {
  try {
    const res = await systemDb((tx) =>
      tx.rateLimit.deleteMany({ where: { windowAt: { lt: new Date(Date.now() - 2 * WINDOW_MS) } } }),
    );
    return res.count;
  } catch {
    return 0;
  }
}
