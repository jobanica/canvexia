"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writeSeatAudit } from "@/server/audit/log";
import { forgetContact } from "./sms-forget";

export type SmsSettingsState = { ok?: boolean; message?: string; error?: string } | null;

/**
 * The SMS settings: sender name, opt-out wording, window, cap, automations.
 *
 * `settings.write` AND the admin role. Every one of these decides how the
 * partner's brand behaves towards people who gave them a phone number — the
 * send window and the cap are promises, not preferences — so they sit with the
 * person who answers for the account.
 */
async function admin() {
  const who = await requireWritablePartner("settings.write");
  if (!who || who.partner.user.role !== "admin") return null;
  return who;
}

const int = (formData: FormData, key: string, fallback: number, max: number) => {
  const n = Number(formData.get(key) ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 0), max);
};

export async function saveSmsSettingsAction(
  _prev: SmsSettingsState,
  formData: FormData,
): Promise<SmsSettingsState> {
  const who = await admin();
  if (!who) return { error: "Only the partner admin can change these." };

  const startMin = int(formData, "windowStart", 540, 1439);
  const endMin = int(formData, "windowEnd", 1200, 1440);
  if (startMin >= endMin) {
    return { error: "The window has to start before it ends." };
  }

  const senderName = String(formData.get("senderName") ?? "").trim().slice(0, 11);
  const optOutText = String(formData.get("optOutText") ?? "").trim().slice(0, 160);

  try {
    await systemDb(async (tx) => {
      const before = await tx.partner.findUnique({
        where: { id: who.partnerId },
        select: { smsSenderName: true, smsSenderStatus: true },
      });

      // Changing the sender name RESETS its approval. The aggregator approved a
      // specific string; a different one is unregistered and would be rejected
      // by the network, so pretending it is still approved would produce sends
      // that silently fail.
      const senderChanged = senderName !== (before?.smsSenderName ?? "");
      await tx.partner.update({
        where: { id: who.partnerId },
        data: {
          smsSenderName: senderName || null,
          ...(senderChanged
            ? { smsSenderStatus: senderName ? "pending" : "none" }
            : {}),
          smsOptOutText: optOutText || null,
          smsWindowStartMin: startMin,
          smsWindowEndMin: endMin,
          smsCapCount: int(formData, "capCount", 2, 20),
          smsCapDays: int(formData, "capDays", 7, 90),
          smsAutoWelcome: formData.get("autoWelcome") === "on",
          smsAutoWelcomeText: String(formData.get("autoWelcomeText") ?? "").trim() || null,
          smsAutoVisitDays: int(formData, "autoVisitDays", 0, 60),
          smsAutoVisitText: String(formData.get("autoVisitText") ?? "").trim() || null,
          smsAutoTrialDays: int(formData, "autoTrialDays", 0, 60),
          smsAutoTrialText: String(formData.get("autoTrialText") ?? "").trim() || null,
        },
        select: { id: true },
      });

      await writeSeatAudit(tx, who, {
        action: "sms.settings",
        entityType: "partner",
        entityId: who.partnerId,
        after: { senderName, startMin, endMin },
      });
    });
  } catch {
    return { error: "Could not save that." };
  }

  revalidatePath("/partner/sms/settings");
  return { ok: true, message: "Saved." };
}

/**
 * "Forget this person."
 *
 * ADMIN ONLY, AND IT CANNOT BE UNDONE. The number has to be typed out to
 * confirm, which is checked against the row rather than against what the screen
 * showed — a confirmation you can click through is not a confirmation.
 */
export async function forgetContactAction(
  _prev: SmsSettingsState,
  formData: FormData,
): Promise<SmsSettingsState> {
  const who = await admin();
  if (!who) return { error: "Only the partner admin can delete a contact." };

  const result = await forgetContact({
    partnerId: who.partnerId,
    contactId: String(formData.get("contactId") ?? ""),
    confirmMobile: String(formData.get("confirmMobile") ?? ""),
    actorEmail: who.email,
    reason: String(formData.get("reason") ?? "") || null,
  });
  if (!result.ok) return { error: result.message };

  revalidatePath("/partner/sms/contacts");
  return {
    ok: true,
    message:
      "Deleted. Their number is blocked from being imported again, and nothing of theirs is left.",
  };
}
