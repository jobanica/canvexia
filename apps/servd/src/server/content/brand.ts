import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_PILLARS } from "@/lib/content/defaults";

export interface BrandPillar {
  id: string;
  kind: "JAB" | "RIGHT_HOOK";
  name: string;
  description: string;
  active: boolean;
}

export interface BrandProfile {
  id: string;
  name: string;
  systemPrompt: string;
  jabRatio: number;
  pillars: BrandPillar[];
}

const PILLAR_SELECT = {
  id: true,
  kind: true,
  name: true,
  description: true,
  active: true,
} as const;

/**
 * The single Servd brand profile, provisioned lazily on first use (the repo
 * runs migrations manually, so we can't rely on a seed having been run). Returns
 * null if the Content Engine tables aren't migrated yet — callers show a notice.
 */
export async function getOrCreateBrand(): Promise<BrandProfile | null> {
  try {
    return await systemDb(async (tx) => {
      const existing = await tx.contentBrandProfile.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, systemPrompt: true, jabRatio: true },
      });
      if (existing) {
        const pillars = await tx.contentPillar.findMany({
          where: { brandId: existing.id },
          orderBy: { kind: "asc" },
          select: PILLAR_SELECT,
        });
        return { ...existing, pillars };
      }
      // First run — create Servd + its starter pillars.
      const created = await tx.contentBrandProfile.create({
        data: {
          name: "Servd",
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          jabRatio: 3,
          pillars: { create: DEFAULT_PILLARS },
        },
        select: { id: true, name: true, systemPrompt: true, jabRatio: true },
      });
      const pillars = await tx.contentPillar.findMany({
        where: { brandId: created.id },
        orderBy: { kind: "asc" },
        select: PILLAR_SELECT,
      });
      return { ...created, pillars };
    });
  } catch {
    // Tables not migrated yet (run prisma/manual/add-content-engine.sql).
    return null;
  }
}
