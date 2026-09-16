"use server";

import { revalidatePath } from "next/cache";
import { requireHqAction } from "@/server/hq/auth";
import { getEmailCreds, setEmailCreds } from "@/server/email/provider";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeHqAudit } from "@/server/audit/log";

export type HqEmailState = { ok?: boolean; message?: string; error?: string } | null;

/**
 * CANVEXIA's own sending credentials.
 *
 * WHY THIS EXISTS WHEN `/super-admin/email` ALREADY DID. That screen belongs to
 * Servd's console. The key it saves is the one that sends CANVEXIA's partner
 * invitations — so configuring CANVEXIA's email meant signing into a different
 * product's admin, which is not a thing anybody should have to know.
 *
 * ONE ACCOUNT, TWO BRANDS, and that is deliberate rather than an oversight: the
 * platform holds a single Resend account with both `canvexia.com` and
 * `servdph.com` verified on it, and the from-address decides which brand a
 * message appears to come from. Saving here and saving there write the same
 * row — this is a second door, not a second configuration.
 */
export async function saveHqEmailAction(
  _prev: HqEmailState,
  formData: FormData,
): Promise<HqEmailState> {
  const user = await requireHqAction("settings.email");

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const fromName = String(formData.get("fromName") ?? "").trim().slice(0, 80);
  const fromEmail = String(formData.get("fromEmail") ?? "").trim().toLowerCase();
  const replyTo = String(formData.get("replyTo") ?? "").trim().toLowerCase();

  if (fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return { error: "That from-address doesn't look right." };
  }
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    return { error: "That reply-to address doesn't look right." };
  }

  // An empty key means "keep what's saved". The form never shows the key back,
  // so a blank field must not silently wipe a working configuration — the same
  // rule the Servd screen follows.
  const existing = await getEmailCreds();
  const key = apiKey || existing?.apiKey || "";
  if (!key) return { error: "Add the sending API key." };
  if (!fromEmail) return { error: "Add the address emails should come from." };

  try {
    await setEmailCreds({ apiKey: key, fromName, fromEmail, replyTo });
  } catch {
    // The likeliest cause by far, and worth naming: without the encryption key
    // the credentials cannot be stored at all.
    return {
      error:
        "Could not save that — the deployment has no CREDENTIALS_ENCRYPTION_KEY, so secrets cannot be encrypted.",
    };
  }

  await systemDb((tx) =>
    writeHqAudit(tx, {
      actorEmail: user.email,
      action: "settings.email",
      entityType: "platform_settings",
      entityId: "platform",
      // NEVER the key. Whether one was replaced, and the address it sends from.
      after: { fromEmail, fromName, keyReplaced: !!apiKey },
    }),
  );

  revalidatePath("/hq/settings/email");
  return { ok: true, message: apiKey ? "Saved. New key in use." : "Saved." };
}
