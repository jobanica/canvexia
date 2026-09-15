"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPartner, requirePartnerCapability } from "@/server/partners/auth";
import { deactivateSeat, inviteSeat, revokeInvite } from "./team";

export type TeamState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string }
  /** The invite link, shown once. There is nowhere to email it from yet. */
  | { status: "invited"; email: string; token: string };

async function admin() {
  const partner = await getCurrentPartner();
  if (!partner || partner.status !== "approved") return null;
  try {
    requirePartnerCapability(partner, "team.write");
  } catch {
    return null;
  }
  return { partnerId: partner.id, email: partner.user.email };
}

export async function inviteSeatAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const who = await admin();
  if (!who) return { status: "error", message: "Only an admin can invite people." };

  const email = String(formData.get("email") ?? "");
  const result = await inviteSeat(who, email, String(formData.get("role") ?? ""));
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/partner/team");
  // Handed back rather than emailed: this deployment cannot send mail
  // (CREDENTIALS_ENCRYPTION_KEY is unset), and an invite that silently goes
  // nowhere is worse than one the admin has to pass on themselves.
  return { status: "invited", email: email.trim().toLowerCase(), token: result.token };
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
