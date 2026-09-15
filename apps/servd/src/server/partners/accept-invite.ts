import "server-only";
import { createHash } from "node:crypto";
import { isPartnerUserRole, type PartnerUserRole } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { writePartnerAudit } from "@/server/audit/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Accepting a staff invitation.
 *
 * The route the partner-portal QA report called the reason nobody could be
 * onboarded: `partner_invites` has existed since A1 and nothing has ever
 * consumed one.
 */

/**
 * Why an invitation cannot be used.
 *
 * FOUR REASONS, NOT ONE. "Invalid link" teaches nobody anything and generates a
 * support message every time; "this invitation was withdrawn" and "this link
 * has already been used" tell the person what to do next, and they are
 * genuinely different situations.
 *
 * It is not an information leak to distinguish them: the token is 24 random
 * bytes, so anyone seeing any of these messages already holds one.
 */
export type InviteProblem = "unknown" | "expired" | "revoked" | "accepted";

export interface InviteView {
  id: string;
  partnerId: string;
  partnerName: string;
  email: string;
  role: PartnerUserRole;
  expiresAt: Date;
}

export const INVITE_MESSAGE: Record<InviteProblem, string> = {
  unknown: "We don't recognise this invitation link. Ask whoever invited you to send a new one.",
  expired: "This invitation has expired. Ask whoever invited you to send a new one.",
  revoked: "This invitation was withdrawn. Ask whoever invited you if that was a mistake.",
  accepted: "This invitation has already been used. Try signing in instead.",
};

/** SHA-256 of the URL token — the column stores the hash, never the token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Look up an invitation without consuming it.
 *
 * `systemDb`, because the person reading this has no session yet — that is the
 * whole point — so there is no partner scope to run under. The lookup is by
 * token hash, which is unguessable, and it returns nothing but what the accept
 * screen renders.
 */
export async function findInvite(
  token: string,
): Promise<{ ok: true; invite: InviteView } | { ok: false; problem: InviteProblem }> {
  if (!token || token.length < 16) return { ok: false, problem: "unknown" };

  let row: {
    id: string;
    partnerId: string;
    email: string;
    role: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    partner: { name: string };
  } | null = null;

  try {
    row = await systemDb((tx) =>
      tx.partnerInvite.findUnique({
        where: { tokenHash: hashToken(token) },
        select: {
          id: true,
          partnerId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          partner: { select: { name: true } },
        },
      }),
    );
  } catch {
    return { ok: false, problem: "unknown" };
  }

  if (!row) return { ok: false, problem: "unknown" };
  // Order matters: a revoked invitation that has also expired should say it was
  // withdrawn, because that is the fact the person needs.
  if (row.revokedAt) return { ok: false, problem: "revoked" };
  if (row.acceptedAt) return { ok: false, problem: "accepted" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, problem: "expired" };

  return {
    ok: true,
    invite: {
      id: row.id,
      partnerId: row.partnerId,
      partnerName: row.partner.name,
      email: row.email,
      // Fails closed, as `parseRole` does: an unreadable role becomes the least
      // privileged seat rather than refusing an otherwise valid invitation.
      role: (isPartnerUserRole(row.role) ? row.role : "sales") as PartnerUserRole,
      expiresAt: row.expiresAt,
    },
  };
}

export type AcceptResult =
  /** `email` so the caller can sign them straight in without re-asking. */
  | { ok: true; role: PartnerUserRole; email: string }
  | { ok: false; message: string };

/**
 * Create the login and the seat, and consume the invitation.
 *
 * THIS IS THE ONE PLACE THE SERVICE-ROLE KEY LEGITIMATELY CREATES A USER, and
 * it is not what the standing rule forbids. That rule is against MINTING
 * PASSWORDS FOR PEOPLE — /hq/team and the bootstrap SQL both refuse to — and
 * here the person chooses their own and holds a 24-byte token authorising it.
 * Creating the account is the thing they came to do.
 *
 * ONE TRANSACTION for the database half. A seat without a login cannot sign in;
 * a login without a seat resolves as nobody and bounces off every screen. Both
 * are worse than the invitation simply not working, so neither is allowed to
 * happen alone.
 *
 * The AUTH user is created BEFORE that transaction and cleaned up if the
 * transaction fails, because Supabase is not in it. The alternative — create
 * the seat first, then the user — leaves a seat pointing at nothing when
 * Supabase is briefly unreachable, and that one is invisible.
 */
export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AcceptResult> {
  const found = await findInvite(input.token);
  if (!found.ok) return { ok: false, message: INVITE_MESSAGE[found.problem] };
  const invite = found.invite;

  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, message: "Tell us your name." };
  // Supabase's own floor is 6. Ten is this codebase's, because these seats can
  // read an operator's whole merchant book.
  if (input.password.length < 10) {
    return { ok: false, message: "Use at least 10 characters for your password." };
  }

  const admin = createSupabaseAdminClient();

  let authUserId: string;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: invite.email,
      password: input.password,
      // Confirmed: holding the token IS the proof of address — it was emailed
      // to it. A second confirmation email would need Supabase's own SMTP,
      // which is not configured, and would strand everybody.
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) {
      // The commonest case by far: they already have a Supabase login from
      // another CANVEXIA seat or a merchant account.
      return {
        ok: false,
        message:
          "There is already an account for that email. Sign in first, then ask for the invitation again.",
      };
    }
    authUserId = data.user.id;
  } catch {
    return { ok: false, message: "We could not create your account. Try again shortly." };
  }

  try {
    await systemDb(async (tx) => {
      // Re-checked INSIDE the transaction. Between findInvite() above and here,
      // the invitation could have been revoked or used by a second tab; the
      // updateMany's own where clause is what makes this race-safe rather than
      // the check being re-run for tidiness.
      const consumed = await tx.partnerInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count === 0) throw new Error("ALREADY_USED");

      await tx.partnerUser.create({
        data: {
          partnerId: invite.partnerId,
          authUserId,
          email: invite.email,
          name,
          role: invite.role,
          status: "active",
          acceptedAt: new Date(),
        },
        select: { id: true },
      });

      await writePartnerAudit(tx, invite.partnerId, {
        actorEmail: invite.email,
        actorRole: invite.role,
        action: "team.invite_accepted",
        entityType: "partner_user",
        // The email and the role, never the token.
        after: { email: invite.email, role: invite.role },
      });
    });
  } catch (e) {
    // Roll the Supabase user back by hand — it is not in the transaction. A
    // login with no seat bounces off every screen with no way to explain itself.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* nothing more to do; the seat was not created either way */
    }
    if (e instanceof Error && e.message === "ALREADY_USED") {
      return { ok: false, message: INVITE_MESSAGE.accepted };
    }
    return { ok: false, message: "We could not finish setting up your account." };
  }

  return { ok: true, role: invite.role, email: invite.email };
}
