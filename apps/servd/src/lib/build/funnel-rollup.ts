import { manilaDayKey } from "@/lib/time/manila";

/**
 * Pure roll-up of DIY funnel events into per-day buckets. Kept free of the
 * database so the bucketing — the part that's easy to get wrong — is testable.
 *
 * Days are MANILA days: the server runs in UTC, so a build started at 1 AM
 * Manila must land on that day, not on the UTC day before it.
 */

export interface FunnelDay {
  day: string; // "YYYY-MM-DD" (Manila)
  started: number;
  reachedPreview: number;
  requested: number;
  activated: number;
}

export interface FunnelEvents {
  previewCreatedAt: Date | null;
  previewReachedAt: Date | null;
  activationRequestedAt: Date | null;
  activatedAt: Date | null;
}

export function emptyFunnelDay(day: string): FunnelDay {
  return { day, started: 0, reachedPreview: 0, requested: 0, activated: 0 };
}

/** `days` consecutive Manila days starting at `from`, with each event counted. */
export function rollupFunnel(rows: FunnelEvents[], from: Date, days: number): FunnelDay[] {
  const byDay = new Map<string, FunnelDay>();
  for (let i = 0; i < days; i++) {
    const key = manilaDayKey(new Date(from.getTime() + i * 86_400_000));
    byDay.set(key, emptyFunnelDay(key));
  }

  const bump = (at: Date | null, field: keyof Omit<FunnelDay, "day">) => {
    if (!at) return;
    const row = byDay.get(manilaDayKey(at));
    if (row) row[field]++; // outside the window → ignored, never miscounted
  };

  for (const r of rows) {
    bump(r.previewCreatedAt, "started");
    bump(r.previewReachedAt, "reachedPreview");
    bump(r.activationRequestedAt, "requested");
    bump(r.activatedAt, "activated");
  }

  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Column-wise totals across the window. */
export function totalFunnel(days: FunnelDay[]): FunnelDay {
  return days.reduce(
    (t, d) => ({
      day: "total",
      started: t.started + d.started,
      reachedPreview: t.reachedPreview + d.reachedPreview,
      requested: t.requested + d.requested,
      activated: t.activated + d.activated,
    }),
    emptyFunnelDay("total"),
  );
}
