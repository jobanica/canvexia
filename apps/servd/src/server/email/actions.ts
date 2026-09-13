"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { setEmailCreds, getEmailCreds, sendBatch } from "./provider";
import { countSegment } from "./audience";
import { isSegment, type SegmentKey } from "@/lib/email/segments";
import { sendCampaign } from "./campaigns";
import type { SendReport } from "./campaigns";
import { renderEmail, buildRecipientLinks } from "@/lib/email/render";

const PATH = "/super-admin/email";

// ---------------------------------------------------------------- credentials

const credsSchema = z.object({
  apiKey: z.string().trim().max(200),
  fromName: z.string().trim().max(80),
  fromEmail: z.string().trim().email("Enter a valid sending address").or(z.literal("")),
  replyTo: z.string().trim().email("Enter a valid reply-to address").or(z.literal("")),
});

export type EmailSettingsState = { ok?: boolean; error?: string } | null;

/** Save the platform's sending credentials (super-admin only). */
export async function saveEmailSettings(
  _prev: EmailSettingsState,
  formData: FormData,
): Promise<EmailSettingsState> {
  await requireOwnerAction();
  const parsed = credsSchema.safeParse({
    apiKey: formData.get("apiKey") ?? "",
    fromName: formData.get("fromName") ?? "",
    fromEmail: formData.get("fromEmail") ?? "",
    replyTo: formData.get("replyTo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  const { apiKey, fromName, fromEmail, replyTo } = parsed.data;
  if (apiKey && !fromEmail) {
    return { error: "Add the address emails should come from." };
  }

  // An empty key means "keep what's saved" — the form never shows it back, so
  // a blank field must not silently wipe a working configuration.
  const existing = await getEmailCreds();
  const key = apiKey || existing?.apiKey || "";
  if (!key) return { error: "Add your sending API key." };

  await setEmailCreds({ apiKey: key, fromName, fromEmail, replyTo });
  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------------- sending

const campaignSchema = z.object({
  subject: z.string().trim().min(3, "Write a subject line").max(150),
  body: z.string().trim().min(10, "Write your message").max(20_000),
  segment: z.string().refine(isSegment, "Choose who this goes to"),
});

export type CampaignState =
  | { ok: true; report: SendReport }
  | { ok: false; error: string }
  | null;

/** Send a campaign to a segment. */
export async function sendEmailCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  await requireOwnerAction();
  const parsed = campaignSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
    segment: formData.get("segment"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const res = await sendCampaign({
    subject: parsed.data.subject,
    body: parsed.data.body,
    segment: parsed.data.segment as SegmentKey,
  });
  revalidatePath(PATH);
  return res.ok ? { ok: true, report: res.report } : { ok: false, error: res.error };
}

/**
 * Send one copy to the founder before blasting it. Uses the real renderer, so
 * what lands in the inbox is exactly what the segment would get — merge tags,
 * unsubscribe footer and all.
 */
export async function sendTestEmail(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  await requireOwnerAction();
  const to = String(formData.get("testTo") ?? "").trim();
  if (!z.string().email().safeParse(to).success) {
    return { ok: false, error: "Enter a valid address to send the test to." };
  }
  const parsed = campaignSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
    segment: formData.get("segment"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const creds = await getEmailCreds();
  if (!creds) return { ok: false, error: "Add your sending key first." };

  // Stand-in recipient shaped like a real unpaid lead, so the test lands with
  // a real activate link and shows exactly what the segment would receive.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const links = buildRecipientLinks(base, {
    status: "preview",
    slug: "your-restaurant",
    buildToken: "sample-build-token",
  });
  const { text, html } = renderEmail(
    parsed.data.body,
    { name: "Brew Mate Cafe", email: to, ...links },
    `${base}/unsubscribe/test-preview`,
  );
  const [outcome] = await sendBatch(creds, [
    { to, subject: `[TEST] ${parsed.data.subject}`, text, html },
  ]);

  return outcome?.ok
    ? { ok: true, report: { campaignId: "test", recipients: 1, sent: 1, failed: 0 } }
    : { ok: false, error: outcome?.error ?? "Couldn't send the test." };
}

/** Live recipient count for the composer's segment picker. */
export async function getSegmentCount(segment: string): Promise<number> {
  await requireOwnerAction();
  return isSegment(segment) ? countSegment(segment) : 0;
}
