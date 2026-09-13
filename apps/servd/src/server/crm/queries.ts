import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { mergeSequence, type SequenceOverride, type SequenceStep } from "@/lib/crm/sequence";

export type CrmStage = "new" | "in_sequence" | "replied" | "won" | "lost" | "revisit";

/**
 * The effective follow-up sequence = defaults merged with the owner's saved
 * overrides. Falls back to defaults if the column isn't migrated yet, so the
 * CRM keeps working before the migration is run.
 */
export async function getCrmSequence(): Promise<SequenceStep[]> {
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { crmSequence: true },
      }),
    );
    return mergeSequence(row?.crmSequence as SequenceOverride[] | null | undefined);
  } catch {
    return mergeSequence(null); // column not migrated → defaults
  }
}

export interface CrmClientRow {
  id: string;
  name: string;
  facebookUrl: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  stage: CrmStage;
  step: number;
  lastTouchAt: string | null;
  nextDueAt: string | null;
  repliedAt: string | null;
  revisitAt: string | null;
  demoRestaurantId: string | null;
  source: string;
  createdAt: string;
}

// Columns that exist on every CRM DB version (address ships in a later migration).
const BASE_SELECT = {
  id: true,
  name: true,
  facebookUrl: true,
  contactName: true,
  phone: true,
  email: true,
  notes: true,
  stage: true,
  step: true,
  lastTouchAt: true,
  nextDueAt: true,
  repliedAt: true,
  source: true,
  createdAt: true,
} as const;

type BaseRow = {
  id: string;
  name: string;
  facebookUrl: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  stage: string;
  step: number;
  lastTouchAt: Date | null;
  nextDueAt: Date | null;
  repliedAt: Date | null;
  source: string;
  createdAt: Date;
};

function mapRow(
  r: BaseRow,
  address: string | null,
  revisitAt: Date | null,
  demoRestaurantId: string | null,
): CrmClientRow {
  return {
    id: r.id,
    name: r.name,
    facebookUrl: r.facebookUrl,
    contactName: r.contactName,
    phone: r.phone,
    email: r.email,
    address,
    notes: r.notes,
    stage: r.stage as CrmStage,
    step: r.step,
    lastTouchAt: r.lastTouchAt?.toISOString() ?? null,
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    revisitAt: revisitAt?.toISOString() ?? null,
    demoRestaurantId,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

/** All CRM clients, newest first. Resilient to not-yet-migrated later columns. */
export async function listClients(limit = 1000): Promise<CrmClientRow[]> {
  // Newest schema (address + revisitAt + demoRestaurantId).
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { ...BASE_SELECT, address: true, revisitAt: true, demoRestaurantId: true },
      }),
    );
    return rows.map((r) => mapRow(r, r.address, r.revisitAt, r.demoRestaurantId));
  } catch {
    /* demoRestaurantId / revisitAt not migrated yet → try address + revisitAt */
  }
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { ...BASE_SELECT, address: true, revisitAt: true },
      }),
    );
    return rows.map((r) => mapRow(r, r.address, r.revisitAt, null));
  } catch {
    /* revisitAt column not migrated yet → try address-only */
  }
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { ...BASE_SELECT, address: true },
      }),
    );
    return rows.map((r) => mapRow(r, r.address, null, null));
  } catch {
    /* address column not migrated yet → base columns only */
  }
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: BASE_SELECT }),
    );
    return rows.map((r) => mapRow(r, null, null, null));
  } catch {
    return []; // table not migrated yet
  }
}
