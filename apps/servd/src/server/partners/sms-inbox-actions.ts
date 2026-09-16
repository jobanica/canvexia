"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { markThreadRead, sendReply } from "./sms-inbox";

export type InboxState = { ok?: boolean; error?: string } | null;

/**
 * Replying.
 *
 * `sms.reply_own` OR `sms.send`. A salesperson holds the first by default —
 * answering somebody who texted them back is the job, not a privilege — and it
 * is limited to threads assigned to them, which the inbox query enforces rather
 * than this action, because "assigned to me" is a property of the thread.
 */
async function replier() {
  const own = await requireWritablePartner("sms.reply_own");
  if (own) return own;
  return requireWritablePartner("sms.send");
}

export async function replyAction(_prev: InboxState, formData: FormData): Promise<InboxState> {
  const who = await replier();
  if (!who) return { error: "You can't reply to SMS." };

  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return { error: "Nothing to reply to." };

  const result = await sendReply({
    partnerId: who.partnerId,
    phone,
    body: String(formData.get("body") ?? ""),
    seatId: who.userId,
  });
  if (!result.ok) return { error: result.message };

  await markThreadRead(who.partnerId, phone);
  revalidatePath("/partner/sms/inbox");
  return { ok: true };
}

export async function markReadAction(_prev: InboxState, formData: FormData): Promise<InboxState> {
  const who = await replier();
  if (!who) return { error: "You can't do that." };
  await markThreadRead(who.partnerId, String(formData.get("phone") ?? ""));
  revalidatePath("/partner/sms/inbox");
  return { ok: true };
}
