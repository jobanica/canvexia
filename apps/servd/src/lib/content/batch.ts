import type { ScriptType } from "./script";

/**
 * Pure J-J-J-H batch planning. Builds a sequence of N posts where each block of
 * (jabRatio jabs + 1 right hook) repeats, round-robining across the available
 * pillars of each kind so coverage spreads evenly. Scheduling is expressed as a
 * day offset from a start date (the route turns it into real dates) to keep this
 * function pure + unit-testable.
 */

export interface BatchPillarRef {
  id: string;
  name: string;
}

export interface BatchPlanItem {
  index: number;
  type: ScriptType;
  pillarId: string | null;
  pillarName: string | null;
  dayOffset: number;
}

export function buildBatchPlan(opts: {
  totalCount: number;
  jabRatio: number;
  jabPillars: BatchPillarRef[];
  hookPillars: BatchPillarRef[];
  cadenceDays?: number;
}): BatchPlanItem[] {
  const ratio = Math.max(1, Math.floor(opts.jabRatio || 3));
  const cadence = Math.max(1, Math.floor(opts.cadenceDays ?? 1));
  const total = Math.max(0, Math.floor(opts.totalCount));
  const blockLen = ratio + 1; // `ratio` jabs then 1 hook

  const items: BatchPlanItem[] = [];
  let jabPtr = 0;
  let hookPtr = 0;

  for (let i = 0; i < total; i++) {
    const isHook = i % blockLen === ratio;
    if (isHook) {
      const p = opts.hookPillars.length
        ? opts.hookPillars[hookPtr % opts.hookPillars.length]
        : null;
      hookPtr++;
      items.push({
        index: i,
        type: "RIGHT_HOOK",
        pillarId: p?.id ?? null,
        pillarName: p?.name ?? null,
        dayOffset: i * cadence,
      });
    } else {
      const p = opts.jabPillars.length ? opts.jabPillars[jabPtr % opts.jabPillars.length] : null;
      jabPtr++;
      items.push({
        index: i,
        type: "JAB",
        pillarId: p?.id ?? null,
        pillarName: p?.name ?? null,
        dayOffset: i * cadence,
      });
    }
  }
  return items;
}

/** Count jabs vs hooks in a plan (for the UI ratio readout + tests). */
export function planRatio(plan: BatchPlanItem[]): { jabs: number; hooks: number } {
  return {
    jabs: plan.filter((p) => p.type === "JAB").length,
    hooks: plan.filter((p) => p.type === "RIGHT_HOOK").length,
  };
}
