"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { hasFeature } from "@/server/billing/feature-gate";
import { uploadMenuImageBytes } from "@/server/storage/menu-images";
import {
  createProfile,
  generateConnectUrl,
  getProfile,
  publish,
  sanitizePlatforms,
  UploadPostError,
} from "@/server/social/upload-post";

export type SocialState = { ok?: boolean; error?: string } | null;

async function requireScheduler() {
  const { restaurantId } = await requireManagerAction();
  if (!(await hasFeature(restaurantId, "contentScheduler"))) {
    throw new Error("The content scheduler isn't unlocked for this account.");
  }
  return restaurantId;
}

/**
 * The Upload-Post profile name for this restaurant, creating it on first use.
 * Derived from the slug plus a short random suffix so it stays unique across
 * the whole Upload-Post account even if two restaurants share a slug shape.
 */
async function ensureProfile(restaurantId: string): Promise<string> {
  const r = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { slug: true, uploadPostUser: true } }),
  );
  if (r.uploadPostUser) return r.uploadPostUser;

  const username = `${r.slug.slice(0, 24)}-${randomBytes(3).toString("hex")}`;
  await createProfile(username);
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({ where: { id: restaurantId }, data: { uploadPostUser: username }, select: { id: true } }),
  );
  return username;
}

export type ConnectResult = { url: string } | { error: string };

/** A link the owner opens to connect their Facebook / Instagram / TikTok. */
export async function startSocialConnect(): Promise<ConnectResult> {
  let restaurantId: string;
  try {
    restaurantId = await requireScheduler();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not allowed." };
  }
  try {
    const username = await ensureProfile(restaurantId);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return { url: await generateConnectUrl(username, `${base}/admin/content?connected=1`) };
  } catch (e) {
    return {
      error: e instanceof UploadPostError ? e.message : "Couldn't start the connection. Please try again.",
    };
  }
}

/** Which platforms this restaurant has linked (empty when nothing is connected). */
export async function getConnectedPlatforms(): Promise<string[]> {
  try {
    const restaurantId = await requireScheduler();
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { uploadPostUser: true } }),
    );
    if (!r.uploadPostUser) return [];
    return (await getProfile(r.uploadPostUser)).connected;
  } catch {
    return [];
  }
}

/**
 * Compose a post: publish it now, or hand Upload-Post a scheduled date. The row
 * is written either way so the owner has a history even if the API later fails.
 */
export async function schedulePost(_prev: SocialState, formData: FormData): Promise<SocialState> {
  let restaurantId: string;
  try {
    restaurantId = await requireScheduler();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not allowed." };
  }

  const caption = String(formData.get("caption") ?? "").trim().slice(0, 2000);
  const platforms = sanitizePlatforms(formData.getAll("platforms").map(String));
  const whenRaw = String(formData.get("scheduledFor") ?? "").trim();
  if (!caption) return { error: "Write a caption first." };
  if (platforms.length === 0) return { error: "Pick at least one platform." };

  // Datetime-local has no timezone — it's the owner's Manila wall clock.
  let scheduledFor: Date | null = null;
  if (whenRaw) {
    const d = new Date(`${whenRaw}:00+08:00`);
    if (Number.isNaN(d.getTime())) return { error: "That date and time didn't look right." };
    if (d.getTime() < Date.now() - 60_000) return { error: "Pick a time in the future." };
    scheduledFor = d;
  }

  // Optional image — stored in our own bucket so Upload-Post can fetch it.
  let mediaUrl: string | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return { error: "That image is too large (max 8 MB)." };
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      mediaUrl = await uploadMenuImageBytes(restaurantId, bytes, ext, file.type || "image/jpeg");
    } catch {
      return { error: "Couldn't upload that image. Please try again." };
    }
  }

  try {
    const username = await ensureProfile(restaurantId);
    const { requestId } = await publish({ username, caption, platforms, photoUrl: mediaUrl, scheduledFor });
    await tenantDb(restaurantId, (tx) =>
      tx.socialPost.create({
        data: {
          restaurantId,
          caption,
          mediaUrl,
          platforms: platforms.join(","),
          scheduledFor,
          status: scheduledFor ? "scheduled" : "posted",
          providerRef: requestId,
          postedAt: scheduledFor ? null : new Date(),
        },
        select: { id: true },
      }),
    );
  } catch (e) {
    // Record the failure so the owner can see what happened, then report it.
    const message = e instanceof UploadPostError ? e.message : "Couldn't send that post. Please try again.";
    try {
      await tenantDb(restaurantId, (tx) =>
        tx.socialPost.create({
          data: {
            restaurantId,
            caption,
            mediaUrl,
            platforms: platforms.join(","),
            scheduledFor,
            status: "failed",
            error: message.slice(0, 500),
          },
          select: { id: true },
        }),
      );
    } catch { /* history is best-effort */ }
    return { error: message };
  }

  revalidatePath("/admin/content");
  return { ok: true };
}

/** Remove a post from the in-app history (does not recall it from Upload-Post). */
export async function deleteSocialPost(formData: FormData): Promise<void> {
  const restaurantId = await requireScheduler();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await tenantDb(restaurantId, (tx) => tx.socialPost.deleteMany({ where: { id } }));
  revalidatePath("/admin/content");
}
