import "server-only";

import { getUploadPostKey } from "@/server/billing/platform-settings";

/**
 * Upload-Post client — one platform API key, one "profile" per restaurant.
 *
 * The restaurant owner links their own Facebook/Instagram/TikTok by visiting a
 * generated connect URL, after which we can publish or schedule on their behalf
 * by naming their profile. We never hold their social credentials.
 */
const API = "https://api.upload-post.com/api";

export { SOCIAL_PLATFORMS, sanitizePlatforms, type SocialPlatform } from "@/lib/social/platforms";
import type { SocialPlatform as Platform } from "@/lib/social/platforms";

export class UploadPostError extends Error {}

async function call(path: string, init: RequestInit): Promise<unknown> {
  const key = await getUploadPostKey();
  if (!key) throw new UploadPostError("Social posting isn't configured on the platform yet.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Apikey ${key}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new UploadPostError(`Upload-Post ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Create the restaurant's profile. Safe to call again — an existing name is fine. */
export async function createProfile(username: string): Promise<void> {
  try {
    await call("/uploadposts/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
  } catch (e) {
    // Already exists → nothing to do. Anything else is a real failure.
    if (e instanceof UploadPostError && /exist/i.test(e.message)) return;
    throw e;
  }
}

export interface ProfileStatus {
  connected: string[]; // platform keys with a linked account
}

/** Which social accounts this profile has linked. */
export async function getProfile(username: string): Promise<ProfileStatus> {
  const json = (await call(`/uploadposts/users/${encodeURIComponent(username)}`, {
    method: "GET",
  })) as { profile?: { social_accounts?: Record<string, unknown> } };
  const accounts = json.profile?.social_accounts ?? {};
  // Upload-Post returns a map of platform → account info ("" / null when unlinked).
  const connected = Object.entries(accounts)
    .filter(([, v]) => !!v && (typeof v !== "string" || v.length > 0))
    .map(([k]) => k);
  return { connected };
}

/**
 * A single-use URL the owner visits to link their social accounts. Valid 48h.
 */
export async function generateConnectUrl(username: string, redirectUrl: string): Promise<string> {
  const json = (await call("/uploadposts/users/generate-jwt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      redirect_url: redirectUrl,
      connect_title: "Connect your social accounts",
      connect_description: "Link the accounts you'd like Servd to post to.",
    }),
  })) as { access_url?: string };
  if (!json.access_url) throw new UploadPostError("Couldn't get a connect link.");
  return json.access_url;
}

export interface PublishInput {
  username: string;
  caption: string;
  platforms: Platform[];
  /** Public URL of an image to attach. Omitted → a text-only post. */
  photoUrl?: string | null;
  /** When to publish. Omitted/past → publish now. */
  scheduledFor?: Date | null;
}

/**
 * Publish now or schedule. Photos go to /upload_photos, text-only to
 * /upload_text — both multipart, both accept an ISO `scheduled_date`.
 */
export async function publish(input: PublishInput): Promise<{ requestId: string | null }> {
  const form = new FormData();
  form.set("user", input.username);
  form.set("title", input.caption);
  for (const p of input.platforms) form.append("platform[]", p);
  if (input.scheduledFor && input.scheduledFor.getTime() > Date.now()) {
    form.set("scheduled_date", input.scheduledFor.toISOString());
  }
  if (input.photoUrl) form.append("photos[]", input.photoUrl);

  const json = (await call(input.photoUrl ? "/upload_photos" : "/upload_text", {
    method: "POST",
    body: form,
  })) as { request_id?: string };
  return { requestId: json.request_id ?? null };
}
