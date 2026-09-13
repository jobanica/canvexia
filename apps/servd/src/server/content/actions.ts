"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getOrCreateBrand } from "@/server/content/brand";
import { isScriptStatus, cleanMetric, type ScriptStatus } from "@/lib/content/stats";

const CALENDAR_PATH = "/super-admin/content-engine/calendar";
const LIBRARY_PATH = "/super-admin/content-engine/library";
const SETTINGS_PATH = "/super-admin/content-engine/settings";
const ROOT_PATH = "/super-admin/content-engine";

/**
 * Reschedule a script to a given day (or clear its schedule). Super-admin only.
 * `isoDate` is a yyyy-mm-dd day string; null removes it from the calendar.
 */
export async function rescheduleScript(
  id: string,
  isoDate: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  await requireOwnerAction();
  if (!id) return { error: "Missing script." };

  let when: Date | null = null;
  if (isoDate) {
    // Anchor to local noon so the date doesn't drift across timezones.
    const d = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return { error: "Invalid date." };
    when = d;
  }

  try {
    await systemDb((tx) =>
      tx.contentScript.update({
        where: { id },
        data: { scheduledFor: when },
        select: { id: true },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't reschedule." };
  }
  revalidatePath(CALENDAR_PATH);
  return { ok: true };
}

/**
 * Inline-edit a script's performance numbers + status (library). Setting status
 * to POSTED stamps postedAt if it wasn't already.
 */
export async function updateScriptStats(
  id: string,
  patch: { saves?: unknown; shares?: unknown; dms?: unknown; status?: unknown },
): Promise<{ ok?: boolean; error?: string }> {
  await requireOwnerAction();
  if (!id) return { error: "Missing script." };

  const data: {
    saves?: number | null;
    shares?: number | null;
    dms?: number | null;
    status?: ScriptStatus;
    postedAt?: Date;
  } = {};
  if ("saves" in patch) data.saves = cleanMetric(patch.saves);
  if ("shares" in patch) data.shares = cleanMetric(patch.shares);
  if ("dms" in patch) data.dms = cleanMetric(patch.dms);
  if ("status" in patch) {
    if (!isScriptStatus(patch.status)) return { error: "Invalid status." };
    data.status = patch.status;
    if (patch.status === "POSTED") data.postedAt = new Date();
  }
  if (Object.keys(data).length === 0) return { ok: true };

  try {
    await systemDb((tx) => tx.contentScript.update({ where: { id }, data, select: { id: true } }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  revalidatePath(LIBRARY_PATH);
  return { ok: true };
}

/** Edit the brand voice prompt + jab ratio (settings). */
export async function updateBrandVoice(
  systemPrompt: string,
  jabRatio: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireOwnerAction();
  const prompt = (systemPrompt ?? "").trim();
  if (prompt.length < 20) return { error: "The brand prompt looks too short." };
  const ratio = Math.max(1, Math.min(6, Math.round(Number(jabRatio) || 3)));
  const brand = await getOrCreateBrand();
  if (!brand) return { error: "Run the Content Engine migration first." };
  try {
    await systemDb((tx) =>
      tx.contentBrandProfile.update({
        where: { id: brand.id },
        data: { systemPrompt: prompt, jabRatio: ratio },
        select: { id: true },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  revalidatePath(SETTINGS_PATH);
  revalidatePath(ROOT_PATH);
  return { ok: true };
}

/** Add a pillar (settings). */
export async function addPillar(input: {
  kind: "JAB" | "RIGHT_HOOK";
  name: string;
  description: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireOwnerAction();
  const name = (input.name ?? "").trim();
  const description = (input.description ?? "").trim();
  if (input.kind !== "JAB" && input.kind !== "RIGHT_HOOK") return { error: "Invalid kind." };
  if (name.length < 2) return { error: "Name is required." };
  if (description.length < 5) return { error: "Description is required." };
  const brand = await getOrCreateBrand();
  if (!brand) return { error: "Run the Content Engine migration first." };
  try {
    await systemDb((tx) =>
      tx.contentPillar.create({
        data: { brandId: brand.id, kind: input.kind, name, description, active: true },
        select: { id: true },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add the pillar." };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Edit / toggle a pillar (settings). */
export async function updatePillar(
  id: string,
  patch: { name?: string; description?: string; active?: boolean },
): Promise<{ ok?: boolean; error?: string }> {
  await requireOwnerAction();
  if (!id) return { error: "Missing pillar." };
  const data: { name?: string; description?: string; active?: boolean } = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 2) return { error: "Name is required." };
    data.name = n;
  }
  if (patch.description !== undefined) {
    const d = patch.description.trim();
    if (d.length < 5) return { error: "Description is required." };
    data.description = d;
  }
  if (patch.active !== undefined) data.active = patch.active;
  if (Object.keys(data).length === 0) return { ok: true };
  try {
    await systemDb((tx) => tx.contentPillar.update({ where: { id }, data, select: { id: true } }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
