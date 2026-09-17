"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireWritablePartner } from "@/server/partners/auth";
import { writeSeatAudit } from "@/server/audit/log";

export type PartnerReplyState = { ok?: boolean; error?: string } | null;

/**
 * A PARTNER ANSWERS THEIR OWN MERCHANT.
 *
 * `support.tickets` — the permission the A7 grid has carried since it was
 * written, with a comment saying it had no screen anywhere in the repository.
 * This is that screen. Admin, ops_manager and support hold it by default;
 * sales does not, which is right: answering for a shop that already exists is
 * support's job, not a salesperson's.
 *
 * OWNERSHIP IS IN THE WHERE CLAUSE, not checked and then acted on. `updateMany`
 * with both the id and the partner id means a request naming somebody else's
 * message updates zero rows and is reported as gone, rather than passing a
 * check that ran against a row this partner could not see anyway.
 *
 * `repliedByPartnerId` is stamped so the merchant can tell who is talking to
 * them. Servd's own replies leave it null, and the two are indistinguishable
 * without it.
 *
 * The reply lands in the SAME column the merchant's dashboard already reads, so
 * nothing on their side needed building — it appears where Servd's replies
 * always appeared, which is where they are already looking.
 *
 * The audit row is INSIDE the transaction, like every other seat action: an
 * answer that was sent with no record of who sent it is the thing the log
 * exists to prevent.
 */
export async function replyToMerchantFeedback(
  _prev: PartnerReplyState,
  formData: FormData,
): Promise<PartnerReplyState> {
  const who = await requireWritablePartner("support.tickets");
  if (!who) return { error: "Your seat can't answer merchant messages." };

  const id = String(formData.get("id") ?? "").trim();
  const reply = String(formData.get("reply") ?? "").trim();
  if (!id) return { error: "No message selected." };
  if (reply.length < 2) return { error: "Write your reply first." };
  if (reply.length > 4000) return { error: "That's too long — keep it under 4000 characters." };

  try {
    const done = await systemDb(async (tx) => {
      const hit = await tx.platformFeedback.updateMany({
        // Both, always. The partner id comes from the session; the id came off
        // the form.
        where: { id, partnerId: who.partnerId },
        data: {
          reply,
          repliedAt: new Date(),
          // Cleared so the merchant's own unread dot lights up again — this is
          // a new answer even if they had read a previous one.
          replyReadAt: null,
          resolved: true,
          repliedByPartnerId: who.partnerId,
        },
      });
      if (hit.count === 0) return false;

      await writeSeatAudit(tx, who, {
        action: "partner.feedback_replied",
        entityType: "platform_feedback",
        entityId: id,
        // WHAT happened, never what was said. A support conversation is not
        // something the audit log needs a copy of.
        after: { replied: true },
      });
      return true;
    });
    if (!done) return { error: "That message is no longer in your inbox." };
  } catch {
    return {
      error:
        "Couldn't save the reply — run packages/db/prisma/manual/partner-feedback-inbox.sql, then try again.",
    };
  }

  revalidatePath("/partner/feedback");
  revalidatePath("/partner");
  // The merchant reads it in their own dashboard chrome.
  revalidatePath("/admin", "layout");
  return { ok: true };
}
