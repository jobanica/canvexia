import "server-only";
import { createHash } from "node:crypto";
import { normalizeMobile } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writePartnerAudit } from "@/server/audit/log";

/**
 * "Forget me."
 *
 * THE ONLY IRREVERSIBLE OPERATION IN A8, and it is deliberate: a deletion
 * request is not a suggestion. It removes the contact row, the conversation,
 * and the per-recipient rows of any campaign that went to them, and it leaves
 * behind a SHA-256 of the number so an import cannot quietly put them back.
 *
 * A HASH, NOT THE NUMBER. Storing the number would mean keeping a table of
 * exactly the people who asked to be forgotten — the opposite of forgetting
 * them — while a hash still answers the only question that matters at import
 * time: "has this person asked us to stop holding their details?"
 *
 * WHAT IS NOT DELETED, and why: the audit row recording the deletion, and the
 * campaign totals. The audit row names no number — it names the hash — and a
 * campaign that sent 400 messages still sent 400. Rewriting history to make a
 * past campaign look smaller would be a different kind of lie.
 */

export function mobileHash(e164: string): string {
  return createHash("sha256").update(e164).digest("hex");
}

/** Has this number asked this partner to forget them? */
export async function isForgotten(partnerId: string, rawMobile: string): Promise<boolean> {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return false;
  try {
    const row = await systemDb((tx) =>
      tx.smsTombstone.findFirst({
        where: { partnerId, mobileHash: mobileHash(mobile) },
        select: { id: true },
      }),
    );
    return !!row;
  } catch {
    // FAILS CLOSED. If we cannot tell whether somebody asked to be forgotten,
    // the safe answer is to act as though they did — the cost is one contact
    // not being added, against the cost of texting somebody who asked us not
    // to.
    return true;
  }
}

export type ForgetResult =
  | { ok: true; messages: number }
  | { ok: false; message: string };

export async function forgetContact(input: {
  partnerId: string;
  contactId: string;
  /** Typed out by the person doing it, and checked against the row. */
  confirmMobile: string;
  actorEmail: string;
  reason?: string | null;
}): Promise<ForgetResult> {
  const typed = normalizeMobile(input.confirmMobile);
  if (!typed) return { ok: false, message: "Type the number to confirm." };

  try {
    return await systemDb(async (tx) => {
      const contact = await tx.smsContact.findFirst({
        where: { id: input.contactId, partnerId: input.partnerId },
        select: { id: true, mobile: true },
      });
      if (!contact) return { ok: false as const, message: "We can't find that contact." };
      if (contact.mobile !== typed) {
        // The confirmation is the whole safety mechanism, so it is exact.
        return {
          ok: false as const,
          message: "That number doesn't match this contact. Nothing was deleted.",
        };
      }

      const hash = mobileHash(contact.mobile);

      // The tombstone goes in FIRST. If anything after it fails, the number is
      // still blocked from re-import — the failure mode is "deleted less than
      // we meant to", never "forgot to remember that they asked".
      await tx.smsTombstone.upsert({
        where: { partnerId_mobileHash: { partnerId: input.partnerId, mobileHash: hash } },
        create: {
          partnerId: input.partnerId,
          mobileHash: hash,
          reason: input.reason?.slice(0, 300) ?? null,
          createdBy: input.actorEmail,
        },
        update: {},
      });

      const messages = await tx.smsThreadMessage.deleteMany({
        where: { partnerId: input.partnerId, smsContactId: contact.id },
      });
      // Campaign rows lose the number and the body; the COUNT of what a
      // campaign sent stays true.
      await tx.smsMessage.updateMany({
        where: { smsContactId: contact.id },
        data: { smsContactId: null, toPhone: null, body: null },
      });
      await tx.smsAutomationLog.deleteMany({
        where: { partnerId: input.partnerId, smsContactId: contact.id },
      });
      await tx.smsContact.delete({ where: { id: contact.id } });

      // The audit row names the HASH, not the number. An audit trail that
      // records what somebody asked to have deleted has not deleted it.
      await writePartnerAudit(tx, input.partnerId, {
        actorEmail: input.actorEmail,
        action: "sms.forgotten",
        entityType: "sms_contact",
        entityId: contact.id,
        after: { mobileHash: hash, messagesDeleted: messages.count },
      });

      return { ok: true as const, messages: messages.count };
    });
  } catch {
    return { ok: false, message: "Could not complete that deletion." };
  }
}
