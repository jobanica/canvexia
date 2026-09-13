import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

export interface OutreachVideoRow {
  id: string;
  crmClientId: string;
  clientName: string;
  status: string;
  hasFinal: boolean;
  errorMessage: string | null;
  createdAt: string;
}

/** Recent outreach videos with the prospect's name (for the history list). */
export async function listOutreachVideos(limit = 100): Promise<OutreachVideoRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.outreachVideo.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          crmClientId: true,
          status: true,
          finalPath: true,
          errorMessage: true,
          createdAt: true,
          crmClient: { select: { name: true } },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      crmClientId: r.crmClientId,
      clientName: r.crmClient?.name ?? "—",
      status: r.status,
      hasFinal: !!r.finalPath,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return []; // table not migrated yet
  }
}
