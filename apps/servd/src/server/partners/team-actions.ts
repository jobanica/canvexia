"use server";

import { revalidatePath } from "next/cache";
import { requireWritablePartner } from "@/server/partners/auth";
import { deactivateSeat, inviteSeat, resendInvite, revokeInvite, type InviteActor } from "./team";

export type TeamState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  /**
   * The invite link, shown once.
   *
   * SHOWN EVEN WHEN THE EMAIL WENT OUT. The link is the thing that works;
   * inboxes lose mail, and an admin sitting next to the new hire should be able
   * to hand it over rather than wait fifteen minutes for a drain tick. `emailed`
   * says which of those two the screen leads with.
   */
  | { status: "invited"; email: string; token: string; emailed: boolean };

async function admin() {
  // Also refuses an HQ "view as" session, which resolves as an admin seat and
  // would otherwise pass the capability check.
  return requireWritablePartner("team.write");
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

  revalidatePath("/partner/team");
  return {
    status: "invited",
    email: email.trim().toLowerCase(),
    token: result.token,
    emailed: result.emailed,
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

  revalidatePath("/partner/team");
  // The new link comes back for the same reason the first one does, and the
  // copy has to say the old one is dead — an admin who resent because the first
  // email bounced will otherwise keep passing the old link around.
  return { status: "invited", email: "", token: result.token, emailed: result.emailed };
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
