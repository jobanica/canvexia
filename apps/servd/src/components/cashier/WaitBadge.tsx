"use client";

import { waitingFrom, waitingLabel, waitTone } from "@/lib/orders/waiting";

const TONE = {
  fresh: "bg-plum-ink/5 text-plum-ink/55",
  warn: "bg-mango/20 text-plum-ink",
  late: "bg-guava/15 text-guava",
} as const;

/**
 * How long this order has been waiting, at the till.
 *
 * The kitchen has always had a clock on every ticket; the cashier hadn't, and
 * they're the one being asked "how much longer?" by somebody standing at the
 * counter. Same thresholds as the kitchen deliberately — a ticket the cook sees
 * as late must not read as fine here.
 *
 * Renders nothing for an advance order that isn't due yet: it was placed days
 * early on purpose, and "waiting 2880m" in red is a false alarm.
 */
export function WaitBadge({
  createdAt,
  scheduledFor,
  nowMs,
  className = "",
}: {
  createdAt: string;
  scheduledFor?: string | null;
  nowMs: number;
  className?: string;
}) {
  const from = waitingFrom(createdAt, scheduledFor, nowMs);
  if (!from) return null;

  const tone = waitTone(from, nowMs);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tone]} ${className}`}
      title={
        scheduledFor
          ? "Time since this order was due"
          : "Time since the order came in"
      }
    >
      ⏱ {waitingLabel(from, nowMs)}
      {tone === "late" && " waiting"}
    </span>
  );
}
