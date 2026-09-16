import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Segments sent, rolled up per partner per Manila month.
 *
 * WRITTEN BY WHATEVER SENDS, not derived on read. `passthrough_usage` already
 * exists and its own note says why: counting across the message tables for
 * every partner on every page load is a scan that grows forever, while the
 * answer for a closed month never changes.
 *
 * This is the missing half of that design — the table has had a reader since
 * the HQ billing screen shipped and nothing has ever written to it, so every
 * pass-through line has read zero. The rate itself lives in
 * `passthrough_costs` and is NOT set here; see add-sms-wallets.sql §3.
 */

const CHANNEL = "sms";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "2026-09", Manila — the same key `partner_statements` uses. */
export function usageMonth(at: Date = new Date()): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 7);
}

/**
 * Add segments to this partner's month.
 *
 * Best effort and never throws: a rollup that fails must not cost somebody a
 * message that has already gone out. It is an upsert on (partner, month,
 * channel), so concurrent sends add rather than overwrite.
 */
export async function recordSmsUsage(
  partnerId: string,
  segments: number,
  at: Date = new Date(),
): Promise<void> {
  if (segments <= 0) return;
  const month = usageMonth(at);
  try {
    await systemDb((tx) =>
      tx.passthroughUsage.upsert({
        where: { partnerId_month_channel: { partnerId, month, channel: CHANNEL } },
        create: { partnerId, month, channel: CHANNEL, units: segments },
        update: { units: { increment: segments } },
      }),
    );
  } catch {
    /* the message went out; the rollup catches up on the next send */
  }
}
