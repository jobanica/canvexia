"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { deactivateSeat, inviteSeat, resendInvite, revokeInvite, type InviteActor } from "./team";
import { drainOutbox } from "@/server/email/outbox";

export type TeamState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  /**
   * The invite link, shown once.
   *
   * SHOWN EVEN WHEN THE EMAIL WENT OUT. The link is the thing that works;
   * inboxes lose mail, and an admin sitting next to the new hire should be able
   * to hand it over rather than wait for a drain tick.
   *
   * `delivery` is the honest three-way answer, and it exists because the first
   * version of this screen said "Invite sent" for all three:
   *   sent   — it left for the recipient's mail server just now;
   *   queued — it is written down and will be retried, but has NOT gone yet;
   *   none   — nothing was queued or the provider refused it. Use the link.
   */
  | {
      status: "invited";
      email: string;
      token: string;
      delivery: "sent" | "queued" | "none";
      /** The provider's complaint, for an admin who can act on it. */
      detail?: string;
    };

async function admin() {
  // Also refuses an HQ "view as" session, which resolves as an admin seat and
  // would otherwise pass the capability check.
  return requireWritablePartner("team.write");
}

/**
 * Send the invitation NOW, rather than on the next fifteen-minute tick.
 *
 * An invitation is the one queued email somebody is standing there waiting for
 * — usually next to the person they just invited — so it drains its own row in
 * this request. Same sending path, same claim-before-send; the only difference
 * is that it does not wait.
 *
 * Returns what actually happened, because "Invite sent" when it has not been
 * sent is exactly the message that sends somebody looking through their spam
 * folder for an email that was never going to arrive.
 */
async function sendNow(
  emailId: string | null,
): Promise<{ delivery: "sent" | "queued" | "none"; detail?: string }> {
  if (!emailId) return { delivery: "none" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://canvexia.com";
  try {
    const result = await drainOutbox(appUrl, { onlyIds: [emailId] });
    if (result.sent > 0) return { delivery: "sent" };
    if (!result.configured) {
      return {
        delivery: "none",
        detail: "No email provider is set up on the platform yet.",
      };
    }
    // Claimed and refused: the row keeps its error and will be retried, but the
    // admin needs to know now — a bounced domain or a dead API key is not
    // something the next tick fixes by itself.
    return {
      delivery: result.failed > 0 ? "none" : "queued",
      detail: result.errors[0],
    };
  } catch {
    // The row is queued and the cron will pick it up; we just cannot say it
    // went.
    return { delivery: "queued" };
  }
}

/** The inviter and their brand, as the invitation email needs them. */
function actorOf(who: NonNullable<Awaited<ReturnType<typeof admin>>>): InviteActor {
  return {
    partnerId: who.partnerId,
    email: who.email,
    name: who.partner.user.name,
    partnerName: who.partner.name,
  };
}

export async function inviteSeatAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const who = await admin();
  if (!who) return { status: "error", message: "Only an admin can invite people." };

  const email = String(formData.get("email") ?? "");
  const result = await inviteSeat(actorOf(who), email, String(formData.get("role") ?? ""));
  if (!result.ok) return { status: "error", message: result.message };

  const delivery = await sendNow(result.emailId);
  revalidatePath("/partner/team");
  return {
    status: "invited",
    email: email.trim().toLowerCase(),
    token: result.token,
    ...delivery,
  };
}

export async function resendInviteAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const who = await admin();
  if (!who) return { status: "error", message: "Only an admin can do that." };

  const result = await resendInvite(actorOf(who), String(formData.get("inviteId") ?? ""));
  if (!result.ok) return { status: "error", message: result.message };

  const delivery = await sendNow(result.emailId);
  revalidatePath("/partner/team");
  // The new link comes back for the same reason the first one does, and the
  // copy has to say the old one is dead — an admin who resent because the first
  // email bounced will otherwise keep passing the old link around.
  return { status: "invited", email: "", token: result.token, ...delivery };
}

export async function revokeInviteAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const who = await admin();
  if (!who) return { status: "error", message: "Only an admin can do that." };
  const result = await revokeInvite(who, String(formData.get("inviteId") ?? ""));
  if (!result.ok) return { status: "error", message: result.message ?? "Could not revoke." };
  revalidatePath("/partner/team");
  return { status: "done", message: "Invite revoked." };
}

export async function deactivateSeatAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const who = await admin();
  if (!who) return { status: "error", message: "Only an admin can do that." };
  const result = await deactivateSeat(who, String(formData.get("seatId") ?? ""));
  if (!result.ok) return { status: "error", message: result.message ?? "Could not do that." };
  revalidatePath("/partner/team");
  return { status: "done", message: "Seat deactivated. Their history is kept." };
}
