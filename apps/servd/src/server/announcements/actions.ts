"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";

export type AnnouncementState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  title: z.string().trim().min(3, "Give it a title").max(120),
  body: z.string().trim().min(3, "Say what happened").max(4000),
  level: z.enum(["info", "warning", "incident"]).default("info"),
});

/**
 * Write an announcement and send it to everyone.
 *
 * "Send to all" is what publishing MEANS here — there is no per-restaurant
 * targeting, because the thing being announced is always about the platform.
 * That keeps the model to two tables and the badge to one count.
 */
export async function publishAnnouncement(
  _prev: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  await requireOwnerAction();
  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    level: formData.get("level") ?? "info",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid announcement" };

  // Drafts exist in the schema but aren't offered yet: the button says Send,
  // and a button that says Send should send.
  const draft = formData.get("draft") === "true";

  try {
    await systemDb((tx) =>
      tx.announcement.create({
        data: {
          id: randomUUID(),
          title: parsed.data.title,
          body: parsed.data.body,
          level: parsed.data.level,
          publishedAt: draft ? null : new Date(),
        },
        select: { id: true },
      }),
    );
  } catch {
    return {
      error: "Couldn't save it — run prisma/manual/add-announcements.sql, then try again.",
    };
  }

  revalidatePath("/super-admin/announcements");
  // Every admin dashboard shows the badge, so the layout that renders it has to
  // be re-fetched rather than served from cache.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Unsend one. Keeps the text, clears the badge it was causing. */
export async function unpublishAnnouncement(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await systemDb((tx) =>
      tx.announcement.update({ where: { id }, data: { publishedAt: null }, select: { id: true } }),
    );
  } catch {
    /* not migrated yet */
  }
  revalidatePath("/super-admin/announcements");
  revalidatePath("/admin", "layout");
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await systemDb((tx) => tx.announcement.delete({ where: { id } }));
  } catch {
    /* not migrated yet */
  }
  revalidatePath("/super-admin/announcements");
  revalidatePath("/admin", "layout");
}

/**
 * Mark everything published as read for whoever is looking.
 *
 * Called when the announcements page is opened — the badge is "you haven't
 * seen this", and they're looking at it. createMany with skipDuplicates so
 * re-opening the page is a no-op rather than a unique-constraint error.
 */
export async function markAnnouncementsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return;

  try {
    await systemDb(async (tx) => {
      const unread = await tx.announcement.findMany({
        where: { publishedAt: { not: null }, reads: { none: { staffUserId: user.staffUserId } } },
        select: { id: true },
      });
      if (unread.length === 0) return;
      await tx.announcementRead.createMany({
        data: unread.map((a) => ({
          id: randomUUID(),
          announcementId: a.id,
          staffUserId: user.staffUserId,
        })),
        skipDuplicates: true,
      });
    });
  } catch {
    /* not migrated yet — the badge just stays */
  }
  revalidatePath("/admin", "layout");
}
