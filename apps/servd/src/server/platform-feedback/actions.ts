"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireStaff, } from "@/server/tenancy/current-user";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { sendFeedbackReplyEmail } from "@/server/email/transactional";

export type FeedbackState = { ok?: boolean; error?: string } | null;

/** A restaurant user sends feedback / a recommendation about Servd itself. */
export async function submitPlatformFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { error: "Please sign in to send feedback." };
  }
  const message = String(formData.get("message") ?? "").trim();
  const ratingRaw = Number(formData.get("rating") ?? 0);
  const rating = ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  if (message.length < 3) return { error: "Please write your feedback first." };

  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { id: staff.restaurantId },
        select: { name: true, displayName: true },
      }),
    );
    await systemDb((tx) =>
      tx.platformFeedback.create({
        data: {
          restaurantId: staff.restaurantId,
          restaurantName: r?.displayName || r?.name || null,
          authorEmail: staff.email,
          rating,
          message,
        },
      }),
    );
  } catch {
    return { error: "Couldn't send your feedback. Please try again." };
  }
  return { ok: true };
}

/** Super-admin: mark a feedback item resolved / unresolved. */
export async function setFeedbackResolved(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const id = String(formData.get("id"));
  const resolved = formData.get("resolved") === "true";
  await systemDb((tx) =>
    tx.platformFeedback.update({ where: { id }, data: { resolved }, select: { id: true } }),
  );
  revalidatePath("/super-admin/feedback");
}

export type ReplyState = { ok?: boolean; error?: string } | null;

/**
 * Answer a restaurant owner's feedback.
 *
 * The reply reaches them in TWO places, and the order matters. It is written to
 * the feedback row first, which is the channel that always works: the owner
 * reads it in the dashboard they sent it from, whatever their email address is.
 * Only then is an email attempted, and only to a real inbox — plenty of these
 * accounts sign in with a synthetic address at staff.servdph.com that nobody
 * ever reads, and mailing those would look like a delivered answer that was
 * never delivered.
 *
 * Sending an answer also resolves the item. Something answered is dealt with;
 * leaving it in the open list would mean re-reading it to find out it wasn't.
 */
export async function replyToFeedback(
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  await requireOwnerAction();
  const id = String(formData.get("id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  if (!id) return { error: "No message selected." };
  if (reply.length < 2) return { error: "Write your reply first." };
  if (reply.length > 4000) return { error: "That's too long — keep it under 4000 characters." };

  let row: { authorEmail: string | null; restaurantName: string | null; message: string } | null = null;
  try {
    row = await systemDb((tx) =>
      tx.platformFeedback.findFirst({
        where: { id },
        select: { authorEmail: true, restaurantName: true, message: true },
      }),
    );
  } catch {
    /* fall through — the write below is what matters */
  }

  try {
    await systemDb((tx) =>
      tx.platformFeedback.update({
        where: { id },
        data: { reply, repliedAt: new Date(), replyReadAt: null, resolved: true },
        select: { id: true },
      }),
    );
  } catch {
    return {
      error: "Couldn't save the reply — run prisma/manual/add-feedback-reply.sql, then try again.",
    };
  }

  // Best-effort, and after the reply is safely stored. A mail failure must not
  // lose an answer the owner can already read in their dashboard.
  if (row?.authorEmail && isRealInbox(row.authorEmail)) {
    try {
      await sendFeedbackReplyEmail(row.authorEmail, row.message, reply);
    } catch {
      /* they'll still see it in the dashboard */
    }
  }

  revalidatePath("/super-admin/feedback");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * A DIY account's login is synthetic (`slug@staff.servdph.com`) — a real row in
 * Supabase auth, but not an inbox anybody opens. Mailing one is worse than not
 * mailing: it looks answered and isn't.
 */
function isRealInbox(email: string): boolean {
  const domain = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";
  return email.includes("@") && !email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

/** Owner-side: mark the replies read, so the dot on their sidebar clears. */
export async function markFeedbackRepliesRead(): Promise<void> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return;
  }
  try {
    await systemDb((tx) =>
      tx.platformFeedback.updateMany({
        where: { restaurantId: staff.restaurantId, reply: { not: null }, replyReadAt: null },
        data: { replyReadAt: new Date() },
      }),
    );
  } catch {
    /* not migrated — nothing to mark */
  }
  revalidatePath("/admin", "layout");
}
