"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { SEQUENCE, TOTAL_TOUCHES, addDays, mergeSequence, type SequenceOverride } from "@/lib/crm/sequence";
import { scrapeFacebookPage, type FbInfo } from "./fb-scrape";
import { getCrmSequence, type CrmStage } from "./queries";

const PATH = "/super-admin/crm";

export type CrmActionState = { ok?: boolean; error?: string } | null;

const clientSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(120),
  facebookUrl: z.string().trim().max(300).optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Auto-fill business details from a public Facebook page (best-effort). */
export async function autofillFromFacebook(url: string): Promise<FbInfo | { error: string }> {
  await requireSuperAdmin();
  return scrapeFacebookPage(url);
}

/** Add a client to the CRM (manually). Resilient to a not-yet-migrated address column. */
export async function addClient(_prev: CrmActionState, formData: FormData): Promise<CrmActionState> {
  await requireSuperAdmin();
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    facebookUrl: formData.get("facebookUrl") ?? "",
    contactName: formData.get("contactName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const base = {
    id: randomUUID(),
    name: d.name,
    facebookUrl: d.facebookUrl || null,
    contactName: d.contactName || null,
    phone: d.phone || null,
    email: d.email || null,
    notes: d.notes || null,
    stage: "new",
  };
  try {
    await systemDb((tx) =>
      tx.crmClient.create({ data: { ...base, address: d.address || null }, select: { id: true } }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // address column not migrated yet → retry without it.
    if (/address|column|Unknown arg/i.test(msg)) {
      try {
        await systemDb((tx) => tx.crmClient.create({ data: base, select: { id: true } }));
      } catch (e2) {
        return { error: e2 instanceof Error ? e2.message : "Couldn't add the client." };
      }
    } else {
      return { error: msg || "Couldn't add the client. Run the CRM migration?" };
    }
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Log the next touch (initial message or follow-up) as sent. Advances the
 * sequence and schedules the next follow-up's due date. Records the touch.
 */
export async function logTouch(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  // Use the owner's edited sequence for labels + scheduling (falls back to defaults).
  const sequence = await getCrmSequence();
  try {
    await systemDb(async (tx) => {
      const client = await tx.crmClient.findUnique({
        where: { id },
        select: { step: true, stage: true },
      });
      if (!client) throw new Error("Client not found");
      if (client.stage === "replied" || client.stage === "won") return; // no more outreach

      const newStep = Math.min(client.step + 1, TOTAL_TOUCHES);
      const sent = sequence[newStep - 1]; // the touch just sent (0-based)
      const upcoming = newStep < TOTAL_TOUCHES ? sequence[newStep] : null;
      const now = new Date();
      const nextDueAt = upcoming ? addDays(now, upcoming.waitDays) : null;

      await tx.crmTouch.create({
        data: { id: randomUUID(), clientId: id, step: newStep, label: sent?.label ?? null },
      });
      await tx.crmClient.update({
        where: { id },
        data: { step: newStep, lastTouchAt: now, nextDueAt, stage: "in_sequence" },
        select: { id: true },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't log the message." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Mark that the client replied — removes them from the follow-up queue. */
export async function markReplied(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  try {
    await systemDb((tx) =>
      tx.crmClient.update({
        where: { id },
        data: { stage: "replied", repliedAt: new Date(), nextDueAt: null },
        select: { id: true },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

const STAGES: CrmStage[] = ["new", "in_sequence", "replied", "won", "lost", "revisit"];

/** Days a no-reply prospect waits in the Revisit bucket before re-approaching. */
const REVISIT_DAYS = 30;

/** Set a client's pipeline stage (e.g. won / lost / reopen). */
export async function setStage(id: string, stage: CrmStage): Promise<void> {
  await requireSuperAdmin();
  if (!STAGES.includes(stage)) return;
  if (stage === "revisit") {
    await moveToRevisit(id);
    return;
  }
  // Won/lost/replied stop follow-ups; reopening to in_sequence keeps the schedule.
  const clearDue = stage === "won" || stage === "lost" || stage === "replied";
  const data = {
    stage,
    ...(clearDue ? { nextDueAt: null } : {}),
    ...(stage === "replied" ? { repliedAt: new Date() } : {}),
  };
  // Also clear any revisit date when leaving the revisit bucket (best-effort:
  // the revisitAt column may not be migrated yet).
  try {
    await systemDb((tx) => tx.crmClient.update({ where: { id }, data: { ...data, revisitAt: null }, select: { id: true } }));
  } catch {
    await systemDb((tx) => tx.crmClient.update({ where: { id }, data, select: { id: true } }));
  }
  revalidatePath(PATH);
}

/**
 * Move a no-reply prospect to the Revisit bucket: parks them out of the active
 * pipeline and schedules a re-approach ~30 days out. Best-effort on revisitAt so
 * it still works (as a plain stage move) before the migration is run.
 */
export async function moveToRevisit(id: string, days = REVISIT_DAYS): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  const revisitAt = addDays(new Date(), days);
  try {
    await systemDb((tx) =>
      tx.crmClient.update({ where: { id }, data: { stage: "revisit", nextDueAt: null, revisitAt }, select: { id: true } }),
    );
  } catch {
    try {
      await systemDb((tx) =>
        tx.crmClient.update({ where: { id }, data: { stage: "revisit", nextDueAt: null }, select: { id: true } }),
      );
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't move to revisit." };
    }
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Re-approach a revisit prospect: back to the top of the funnel with a fresh
 * initial message (step reset), so they reappear in "Send today".
 */
export async function restartFromRevisit(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  const data = { stage: "new", step: 0, nextDueAt: null, lastTouchAt: null };
  try {
    await systemDb((tx) => tx.crmClient.update({ where: { id }, data: { ...data, revisitAt: null }, select: { id: true } }));
  } catch {
    try {
      await systemDb((tx) => tx.crmClient.update({ where: { id }, data, select: { id: true } }));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't restart." };
    }
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Update a client's notes. */
export async function updateNotes(id: string, notes: string): Promise<void> {
  await requireSuperAdmin();
  await systemDb((tx) =>
    tx.crmClient.update({
      where: { id },
      data: { notes: notes.slice(0, 2000) || null },
      select: { id: true },
    }),
  );
  revalidatePath(PATH);
}

const sequenceStepSchema = z.object({
  step: z.coerce.number().int().min(1).max(TOTAL_TOUCHES),
  label: z.string().trim().max(80).optional().or(z.literal("")),
  waitDays: z.coerce.number().int().min(0).max(90).optional(),
  message: z.string().trim().min(1, "Message can't be empty").max(2000),
});

/**
 * Save the owner-edited follow-up sequence (message text, label, wait days per
 * step). Stored as overrides on the single platform_settings row; structural
 * fields (step order, break-up flag) stay fixed. Best-effort: if the column
 * isn't migrated yet we surface a clear error instead of crashing.
 */
export async function saveCrmSequence(
  steps: SequenceOverride[],
): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  const parsed = z.array(sequenceStepSchema).max(TOTAL_TOUCHES).safeParse(steps);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid messages." };
  }
  // Normalise through the merge helper so what we store is exactly what we use.
  const merged = mergeSequence(
    parsed.data.map((s) => ({
      step: s.step,
      label: s.label || undefined,
      waitDays: s.waitDays,
      message: s.message,
    })),
  );
  const overrides: SequenceOverride[] = merged.map((s) => ({
    step: s.step,
    label: s.label,
    waitDays: s.waitDays,
    message: s.message,
  }));
  try {
    await systemDb((tx) =>
      tx.platformSetting.upsert({
        where: { id: "platform" },
        create: { id: "platform", crmSequence: overrides as object },
        update: { crmSequence: overrides as object },
      }),
    );
  } catch (e) {
    return {
      error:
        e instanceof Error && /crmSequence|column/i.test(e.message)
          ? "Add the crmSequence column first (run prisma/manual/add-crm-sequence.sql)."
          : e instanceof Error
            ? e.message
            : "Couldn't save the messages.",
    };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Reset the follow-up sequence back to the built-in defaults. */
export async function resetCrmSequence(): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  try {
    // Empty array → mergeSequence() falls back to the built-in defaults.
    await systemDb((tx) =>
      tx.platformSetting.upsert({
        where: { id: "platform" },
        create: { id: "platform", crmSequence: [] },
        update: { crmSequence: [] },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't reset." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Remove a client (and their touch history) from the CRM. */
export async function deleteClient(id: string): Promise<void> {
  await requireSuperAdmin();
  await systemDb((tx) => tx.crmClient.delete({ where: { id } }));
  revalidatePath(PATH);
}

const prospectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  facebookUrl: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.string().trim().max(160).nullish(),
  website: z.string().trim().max(300).nullish(),
});
type ProspectInput = z.infer<typeof prospectSchema>;

function crmCreateData(d: ProspectInput) {
  return {
    id: randomUUID(),
    name: d.name,
    facebookUrl: d.facebookUrl || null,
    phone: d.phone || null,
    email: d.email || null,
    notes: d.website ? `Website: ${d.website}` : null,
    stage: "new",
    source: "prospecting",
  };
}

/** Add a discovered prospect straight into the CRM (deduped by name). */
export async function addProspectToCrm(
  input: z.input<typeof prospectSchema>,
): Promise<{ ok?: boolean; duplicate?: boolean; error?: string }> {
  await requireSuperAdmin();
  const parsed = prospectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid prospect." };
  const d = parsed.data;
  try {
    const created = await systemDb(async (tx) => {
      const existing = await tx.crmClient.findFirst({ where: { name: d.name }, select: { id: true } });
      if (existing) return false;
      await tx.crmClient.create({ data: crmCreateData(d), select: { id: true } });
      return true;
    });
    if (!created) return { ok: true, duplicate: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add to CRM. Run the CRM migration?" };
  }
  revalidatePath(PATH);
  revalidatePath("/super-admin/prospecting");
  return { ok: true };
}

/** Add many prospects at once (skips any already in the CRM, by name). */
export async function addProspectsToCrm(
  inputs: z.input<typeof prospectSchema>[],
): Promise<{ ok?: boolean; added?: number; skipped?: number; error?: string }> {
  await requireSuperAdmin();
  let added = 0;
  let skipped = 0;
  try {
    await systemDb(async (tx) => {
      for (const raw of inputs) {
        const parsed = prospectSchema.safeParse(raw);
        if (!parsed.success) {
          skipped++;
          continue;
        }
        const d = parsed.data;
        const existing = await tx.crmClient.findFirst({ where: { name: d.name }, select: { id: true } });
        if (existing) {
          skipped++;
          continue;
        }
        await tx.crmClient.create({ data: crmCreateData(d), select: { id: true } });
        added++;
      }
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add to CRM. Run the CRM migration?" };
  }
  revalidatePath(PATH);
  revalidatePath("/super-admin/prospecting");
  return { ok: true, added, skipped };
}
