"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { discoverRestaurants, type DiscoverResponse } from "./discover";
import { scrapeContacts } from "./enrich";
import {
  PROSPECT_STATUSES,
  type ProspectResult,
  type ProspectStatus,
} from "@/lib/prospecting/types";

const PATH = "/super-admin/prospecting";

/** Search OpenStreetMap for restaurants in a city/area (super-admin only). */
export async function searchProspects(query: string): Promise<DiscoverResponse> {
  await requireOwnerAction();
  return discoverRestaurants(query);
}

function leadData(r: ProspectResult) {
  return {
    id: randomUUID(),
    source: r.source,
    sourceId: r.sourceId,
    name: r.name,
    address: r.address,
    latitude: r.latitude,
    longitude: r.longitude,
    phone: r.phone,
    website: r.website,
    email: r.email,
    facebook: r.facebook,
    status: "new",
  };
}

/** Save one discovered venue as a lead (idempotent on source+sourceId). */
export async function saveProspect(r: ProspectResult): Promise<{ ok?: boolean; error?: string }> {
  await requireOwnerAction();
  try {
    await systemDb(async (tx) => {
      const existing = await tx.prospectLead.findFirst({
        where: { source: r.source, sourceId: r.sourceId },
        select: { id: true },
      });
      if (!existing) await tx.prospectLead.create({ data: leadData(r) });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the lead." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Save every venue from a search at once. Skips ones already saved. */
export async function saveAllProspects(
  results: ProspectResult[],
): Promise<{ ok?: boolean; saved?: number; error?: string }> {
  await requireOwnerAction();
  let saved = 0;
  try {
    await systemDb(async (tx) => {
      for (const r of results) {
        const existing = await tx.prospectLead.findFirst({
          where: { source: r.source, sourceId: r.sourceId },
          select: { id: true },
        });
        if (existing) continue;
        await tx.prospectLead.create({ data: leadData(r) });
        saved++;
      }
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save the leads." };
  }
  revalidatePath(PATH);
  return { ok: true, saved };
}

/** Scrape a saved lead's website for a missing email / Facebook page. */
export async function enrichProspect(
  id: string,
): Promise<{ ok?: boolean; email?: string | null; facebook?: string | null; error?: string }> {
  await requireOwnerAction();
  const lead = await systemDb((tx) =>
    tx.prospectLead.findUnique({ where: { id }, select: { website: true } }),
  );
  if (!lead?.website) return { error: "No website on file to scrape." };

  const { email, facebook } = await scrapeContacts(lead.website);
  await systemDb((tx) =>
    tx.prospectLead.update({
      where: { id },
      data: {
        ...(email ? { email } : {}),
        ...(facebook ? { facebook } : {}),
        enrichedAt: new Date(),
      },
    }),
  );
  revalidatePath(PATH);
  return { ok: true, email, facebook };
}

/** Move a lead through the pipeline (new → contacted → … → converted). */
export async function setProspectStatus(id: string, status: ProspectStatus): Promise<void> {
  await requireOwnerAction();
  if (!PROSPECT_STATUSES.includes(status)) return;
  await systemDb((tx) => tx.prospectLead.update({ where: { id }, data: { status } }));
  revalidatePath(PATH);
}

/** Save a free-text note against a lead. */
export async function setProspectNotes(id: string, notes: string): Promise<void> {
  await requireOwnerAction();
  await systemDb((tx) =>
    tx.prospectLead.update({ where: { id }, data: { notes: notes.slice(0, 1000) || null } }),
  );
  revalidatePath(PATH);
}

/** Remove a lead. */
export async function deleteProspect(id: string): Promise<void> {
  await requireOwnerAction();
  await systemDb((tx) => tx.prospectLead.delete({ where: { id } }));
  revalidatePath(PATH);
}
