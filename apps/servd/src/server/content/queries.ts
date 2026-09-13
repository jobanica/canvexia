import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import type { ScriptType, GeneratedScript } from "@/lib/content/script";

export interface ScheduledScriptRow {
  id: string;
  title: string;
  type: ScriptType;
  platform: string;
  lengthSec: number;
  pillarName: string | null;
  status: string;
  scheduledFor: string | null; // ISO
  createdAt: string;
}

const ROW_SELECT = {
  id: true,
  title: true,
  type: true,
  platform: true,
  lengthSec: true,
  status: true,
  scheduledFor: true,
  createdAt: true,
  pillar: { select: { name: true } },
} as const;

type RawRow = {
  id: string;
  title: string;
  type: ScriptType;
  platform: string;
  lengthSec: number;
  status: string;
  scheduledFor: Date | null;
  createdAt: Date;
  pillar: { name: string } | null;
};

function toRow(r: RawRow): ScheduledScriptRow {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    platform: r.platform,
    lengthSec: r.lengthSec,
    pillarName: r.pillar?.name ?? null,
    status: r.status,
    scheduledFor: r.scheduledFor?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Scripts scheduled within the next `days` days (for the calendar), plus any
 * scheduled-but-overdue ones. Empty if the tables aren't migrated yet.
 */
export async function listScheduledScripts(days = 14): Promise<ScheduledScriptRow[]> {
  try {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + days);
    const rows = await systemDb((tx) =>
      tx.contentScript.findMany({
        where: { scheduledFor: { not: null, lt: end } },
        orderBy: { scheduledFor: "asc" },
        select: ROW_SELECT,
      }),
    );
    return (rows as RawRow[]).map(toRow);
  } catch {
    return [];
  }
}

/** Recently generated scripts (used by the library + as a fallback list). */
export async function listRecentScripts(limit = 50): Promise<ScheduledScriptRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.contentScript.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: ROW_SELECT,
      }),
    );
    return (rows as RawRow[]).map(toRow);
  } catch {
    return [];
  }
}

export interface LibraryScriptRow extends ScheduledScriptRow {
  pillarId: string | null;
  saves: number | null;
  shares: number | null;
  dms: number | null;
  postedAt: string | null;
  script: GeneratedScript; // reconstructed for Copy-as-Markdown / preview
}

const LIBRARY_SELECT = {
  ...ROW_SELECT,
  pillarId: true,
  saves: true,
  shares: true,
  dms: true,
  postedAt: true,
  hook: true,
  body: true,
  cta: true,
  production: true,
} as const;

/** Full library: every script with performance fields + the script body. */
export async function listLibraryScripts(limit = 200): Promise<LibraryScriptRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.contentScript.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: LIBRARY_SELECT,
      }),
    );
    return (rows as unknown as Array<RawRow & {
      pillarId: string | null;
      saves: number | null;
      shares: number | null;
      dms: number | null;
      postedAt: Date | null;
      hook: GeneratedScript["hook"];
      body: GeneratedScript["body"];
      cta: GeneratedScript["cta"];
      production: GeneratedScript["production"];
    }>).map((r) => ({
      ...toRow(r),
      pillarId: r.pillarId,
      saves: r.saves,
      shares: r.shares,
      dms: r.dms,
      postedAt: r.postedAt?.toISOString() ?? null,
      script: {
        title: r.title,
        hook: r.hook,
        body: r.body,
        cta: r.cta ?? null,
        production: r.production,
      },
    }));
  } catch {
    return [];
  }
}
