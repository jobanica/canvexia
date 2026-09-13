import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";

/**
 * Platform marketing email, sent through Resend.
 *
 * One provider account belongs to the platform (same shape as the Xendit and
 * Upload-Post keys): credentials live encrypted in platform_settings and are
 * only ever read server-side. Plain `fetch` rather than an SDK — it's two
 * endpoints, and it keeps the dependency list where it is.
 */

const API = "https://api.resend.com";

export interface EmailCreds {
  apiKey: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

export interface EmailStatus {
  configured: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}

/** Decrypted credentials, or null when email hasn't been set up. */
export async function getEmailCreds(): Promise<EmailCreds | null> {
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { emailCredsEnc: true },
      }),
    );
    if (!row?.emailCredsEnc) return null;
    const c = decryptJson<EmailCreds>(row.emailCredsEnc);
    return c.apiKey && c.fromEmail ? c : null;
  } catch {
    return null;
  }
}

/** Status for the settings screen — never returns the API key. */
export async function getEmailStatus(): Promise<EmailStatus> {
  const c = await getEmailCreds();
  return {
    configured: !!c,
    fromName: c?.fromName ?? "",
    fromEmail: c?.fromEmail ?? "",
    replyTo: c?.replyTo ?? "",
  };
}

/** Save (or clear, with an empty apiKey) the platform email credentials. */
export async function setEmailCreds(creds: EmailCreds): Promise<void> {
  const enc = creds.apiKey ? encryptJson(creds) : null;
  await systemDb((tx) =>
    tx.platformSetting.upsert({
      where: { id: "platform" },
      create: { id: "platform", emailCredsEnc: enc },
      update: { emailCredsEnc: enc },
    }),
  );
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendOutcome {
  to: string;
  ok: boolean;
  providerRef?: string;
  error?: string;
}

/**
 * Sends up to 100 messages in one call (Resend's batch limit). Returns one
 * outcome per input, in order, so the caller can record exactly who got it —
 * a whole-batch failure marks every recipient failed rather than silently
 * reporting success.
 */
export async function sendBatch(
  creds: EmailCreds,
  emails: OutgoingEmail[],
): Promise<SendOutcome[]> {
  if (emails.length === 0) return [];
  const from = creds.fromName ? `${creds.fromName} <${creds.fromEmail}>` : creds.fromEmail;

  try {
    const res = await fetch(`${API}/emails/batch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        emails.map((e) => ({
          from,
          to: [e.to],
          subject: e.subject,
          text: e.text,
          html: e.html,
          ...(creds.replyTo ? { reply_to: creds.replyTo } : {}),
        })),
      ),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      return emails.map((e) => ({ to: e.to, ok: false, error: `${res.status}: ${detail}` }));
    }

    const json = (await res.json()) as { data?: { id?: string }[] };
    return emails.map((e, i) => ({ to: e.to, ok: true, providerRef: json.data?.[i]?.id }));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Send failed";
    return emails.map((e) => ({ to: e.to, ok: false, error }));
  }
}
