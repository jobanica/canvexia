"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { createIntroUploadUrl, introPath } from "@/server/outreach/storage";
import { triggerRender } from "@/server/outreach/render";

/**
 * The phone record page has NO login — it's gated solely by the short-lived,
 * single-use record token. Every call re-validates the token server-side
 * (exists, not expired, still awaiting a recording). Only the prospect NAME is
 * exposed (for the teleprompter) — no other prospect data leaks.
 */
interface Valid {
  id: string;
  clientName: string;
}

async function validate(token: string): Promise<Valid | null> {
  if (!token) return null;
  try {
    const row = await systemDb((tx) =>
      tx.outreachVideo.findFirst({
        where: { recordToken: token, status: "awaiting_recording" },
        select: { id: true, recordTokenExpiresAt: true, crmClient: { select: { name: true } } },
      }),
    );
    if (!row) return null;
    if (row.recordTokenExpiresAt && row.recordTokenExpiresAt.getTime() < Date.now()) return null;
    return { id: row.id, clientName: row.crmClient?.name ?? "this restaurant" };
  } catch {
    return null;
  }
}

export interface RecordContext {
  ok: boolean;
  clientName?: string;
}

/** Validate the token and return the prospect name for the teleprompter. */
export async function getRecordContext(token: string): Promise<RecordContext> {
  const v = await validate(token);
  return v ? { ok: true, clientName: v.clientName } : { ok: false };
}

export interface UploadTicket {
  ok: boolean;
  error?: string;
  bucket?: string;
  path?: string;
  token?: string;
}

/** Issue a signed upload URL scoped to this video's intro path. */
export async function issueUploadUrl(token: string): Promise<UploadTicket> {
  const v = await validate(token);
  if (!v) return { ok: false, error: "This link has expired. Ask for a new QR code." };
  try {
    const t = await createIntroUploadUrl(v.id);
    return { ok: true, bucket: t.bucket, path: t.path, token: t.token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't prepare the upload." };
  }
}

/** After the phone uploads: mark it rendering, burn the token, kick off render. */
export async function finishRecording(token: string): Promise<{ ok: boolean; error?: string }> {
  const v = await validate(token);
  if (!v) return { ok: false, error: "This link has expired. Ask for a new QR code." };
  // Single-use: clear the token so the link can't be reused.
  await systemDb((tx) =>
    tx.outreachVideo.updateMany({
      where: { id: v.id },
      data: { status: "rendering", introPath: introPath(v.id), recordToken: null, recordTokenExpiresAt: null },
    }),
  );
  await triggerRender(v.id);
  return { ok: true };
}
