import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import type { ProspectStatus } from "@/lib/prospecting/types";

export interface ProspectLeadRow {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  facebook: string | null;
  status: ProspectStatus;
  notes: string | null;
  enrichedAt: string | null;
  createdAt: string;
}

/** Saved prospecting leads, newest first. Empty if the table isn't migrated yet. */
export async function listProspectLeads(limit = 500): Promise<ProspectLeadRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.prospectLead.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      phone: r.phone,
      website: r.website,
      email: r.email,
      facebook: r.facebook,
      status: r.status as ProspectStatus,
      notes: r.notes,
      enrichedAt: r.enrichedAt ? r.enrichedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return []; // table not migrated yet
  }
}
