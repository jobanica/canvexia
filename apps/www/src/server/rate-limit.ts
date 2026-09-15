import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { hitRateLimitIn, RATE_WINDOW_MS } from "@servd/db";
import { systemDb } from "./scoped-db";

/**
 * One bucket, one allowance: the waitlist form.
 *
 * The counter is in the database (@servd/db) rather than in memory, because
 * every serverless invocation is a fresh process and an in-memory counter
 * enforces nothing — the same reason apps/servd's public builder has counted in
 * Postgres since it was written. The brief offered "simple in-memory or
 * Upstash"; this is neither, and adds no dependency.
 *
 * Ten an hour per IP. Generous enough that a household, an office or a phone
 * behind carrier-grade NAT can all apply, tight enough that a script filling
 * the table is a nuisance rather than a night's work. FAILS OPEN: this is abuse
 * control, not an authorization boundary, and a limiter that breaks the form
 * when the table is missing has done more damage than the abuse it prevents.
 */
const LIMIT = 10;

async function clientKey(): Promise<string> {
  const h = await headers();
  const raw =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown";
  // Hashed: we need to tell requesters apart, we do not need to know who they
  // are, and this table would otherwise be a log of who visited the page.
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export async function rateLimitWaitlist(): Promise<{ ok: boolean; message?: string }> {
  try {
    const key = await clientKey();
    const hit = await systemDb((tx) =>
      hitRateLimitIn(tx, "www:waitlist", key, RATE_WINDOW_MS),
    );
    if (hit.count > LIMIT) {
      return {
        ok: false,
        message: "That's a few too many in one go. Try again in a little while.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
