"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { qrPngDataUrl } from "@/lib/qr";
import { createDownloadUrl } from "@/server/outreach/storage";
import { triggerRender } from "@/server/outreach/render";

const PATH = "/super-admin/outreach";
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface OutreachStatus {
  id: string;
  status: string;
  hasFinal: boolean;
  errorMessage: string | null;
}

export interface CreateResult {
  ok: boolean;
  error?: string;
  id?: string;
  recordUrl?: string;
  qrDataUrl?: string;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com").replace(/\/$/, "");
}

/** Create an outreach-video row + QR to the phone record page for one prospect. */
export async function createOutreachVideo(crmClientId: string): Promise<CreateResult> {
  await requireOwnerAction();
  const token = randomBytes(24).toString("base64url"); // ~32 chars, unguessable
  const id = randomUUID();
  try {
    await systemDb((tx) =>
      tx.outreachVideo.create({
        data: {
          id,
          crmClientId,
          status: "awaiting_recording",
          recordToken: token,
          recordTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
        select: { id: true },
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/outreach_videos|relation|column/i.test(msg)) {
      return { ok: false, error: "Run prisma/manual/add-outreach-videos.sql in Supabase first." };
    }
    return { ok: false, error: "Couldn't start the outreach video." };
  }
  const recordUrl = `${appUrl()}/record/${token}`;
  const qrDataUrl = await qrPngDataUrl(recordUrl);
  revalidatePath(PATH);
  return { ok: true, id, recordUrl, qrDataUrl };
}

/** Poll one video's status (for the QR modal). */
export async function getOutreachStatus(id: string): Promise<OutreachStatus | null> {
  await requireOwnerAction();
  try {
    const v = await systemDb((tx) =>
      tx.outreachVideo.findUnique({
        where: { id },
        select: { id: true, status: true, finalPath: true, errorMessage: true },
      }),
    );
    if (!v) return null;
    return { id: v.id, status: v.status, hasFinal: !!v.finalPath, errorMessage: v.errorMessage };
  } catch {
    return null;
  }
}

/** Signed download URL for the finished MP4. */
export async function getOutreachDownloadUrl(id: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireOwnerAction();
  const v = await systemDb((tx) =>
    tx.outreachVideo.findUnique({ where: { id }, select: { finalPath: true, status: true } }),
  ).catch(() => null);
  if (!v?.finalPath) return { ok: false, error: "The video isn't ready yet." };
  const url = await createDownloadUrl(v.finalPath);
  if (!url) return { ok: false, error: "Couldn't create a download link." };
  return { ok: true, url };
}

/** Re-run rendering with the existing recording (after a failure). */
export async function retryOutreachRender(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireOwnerAction();
  const v = await systemDb((tx) =>
    tx.outreachVideo.findUnique({ where: { id }, select: { introPath: true } }),
  ).catch(() => null);
  if (!v?.introPath) return { ok: false, error: "No recording to render — record again." };
  await systemDb((tx) =>
    tx.outreachVideo.updateMany({ where: { id }, data: { status: "rendering", errorMessage: null } }),
  );
  await triggerRender(id);
  revalidatePath(PATH);
  return { ok: true };
}

/** Remove an outreach video row. */
export async function deleteOutreachVideo(id: string): Promise<void> {
  await requireOwnerAction();
  await systemDb((tx) => tx.outreachVideo.deleteMany({ where: { id } }));
  revalidatePath(PATH);
}
