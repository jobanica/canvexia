import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Per-IP hourly limits for Resceta's two unauthenticated endpoints: the
 * referral-code check and self-signup. Same table and the same fail-open
 * stance as Servd's builder limiter — abuse control, not authorisation.
 */
const LIMITS = { "resceta:code": 60, "resceta:signup": 10 } as const;

export async function rateLimit(bucket: keyof typeof LIMITS): Promise<boolean> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const windowAt = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  try {
    const row = await systemDb((tx) =>
      tx.rateLimit.upsert({
        where: { bucket_key_windowAt: { bucket, key, windowAt } },
        create: { bucket, key, windowAt, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      }),
    );
    return row.count <= LIMITS[bucket];
  } catch {
    return true;
  }
}
