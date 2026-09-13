import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/** Daily generation cap (runaway/spend guard). Configurable via env. */
export const DAILY_CAP = Math.max(1, Number(process.env.SERVD_CONTENT_DAILY_CAP ?? 50));

/** How many generations have been logged since local midnight. Best-effort. */
export async function generationsToday(): Promise<number> {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return await systemDb((tx) =>
      tx.contentGenerationLog.count({ where: { createdAt: { gte: start } } }),
    );
  } catch {
    return 0; // table not migrated yet → don't block on the cap
  }
}

export interface GenerationLogEntry {
  brandId?: string | null;
  model: string;
  mode: "single" | "batch";
  inputTokens: number;
  outputTokens: number;
  scriptId?: string | null;
  ok: boolean;
}

/** Record one generation for spend visibility + the daily cap. Best-effort. */
export async function logGeneration(entry: GenerationLogEntry): Promise<void> {
  try {
    await systemDb((tx) =>
      tx.contentGenerationLog.create({
        data: {
          brandId: entry.brandId ?? null,
          model: entry.model,
          mode: entry.mode,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          scriptId: entry.scriptId ?? null,
          ok: entry.ok,
        },
        select: { id: true },
      }),
    );
  } catch {
    /* logging is best-effort — never fail a generation because logging failed */
  }
}

/** Aggregate token spend over the last `days` days (for the cost panel). */
export async function usageSummary(days = 30): Promise<{
  count: number;
  inputTokens: number;
  outputTokens: number;
  today: number;
}> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return await systemDb(async (tx) => {
      const [agg, today] = await Promise.all([
        tx.contentGenerationLog.aggregate({
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _sum: { inputTokens: true, outputTokens: true },
        }),
        tx.contentGenerationLog.count({ where: { createdAt: { gte: startOfDay } } }),
      ]);
      return {
        count: agg._count._all,
        inputTokens: agg._sum.inputTokens ?? 0,
        outputTokens: agg._sum.outputTokens ?? 0,
        today,
      };
    });
  } catch {
    return { count: 0, inputTokens: 0, outputTokens: 0, today: 0 };
  }
}
