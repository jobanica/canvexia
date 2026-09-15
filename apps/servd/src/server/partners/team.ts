import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { PARTNER_USER_ROLES, isPartnerUserRole, type PartnerUserRole } from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import { writePartnerAudit } from "@/server/audit/log";
import { queueInviteEmail } from "./invite-email";

/**
 * Seats and invitations.
 *
 * THE TOKEN IS NEVER STORED. `partner_invites.tokenHash` holds a SHA-256; the
 * token itself is emailed, and also handed back to the admin once as a fallback
 * for the deployment or the inbox that loses it. A leaked database therefore
 * cannot be used to accept invitations — the same reasoning as the hashed IP in
 * rate_limits.
 */
export interface SeatRow {
  id: string;
  email: string;
  name: string | null;
  role: PartnerUserRole;
  status: string;
  acceptedAt: Date | null;
  lastSeenAt: Date | null;
}

/**
 * How far the invitation email got.
 *
 * `none` is not a failure: it is what a deployment with no encryption key
 * produces, and what every invitation created before Part 3 shipped will read
 * as. The screen says "not emailed — copy the link" rather than "failed".
 */
export type InviteDelivery = "none" | "queued" | "sent" | "failed";

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  expired: boolean;
  delivery: InviteDelivery;
  sentAt: Date | null;
  /** The provider's complaint, for a `failed` row. Never a key or a token. */
  error: string | null;
}

export async function listTeam(partnerId: string): Promise<{
  seats: SeatRow[];
  invites: InviteRow[];
}> {
  const [seats, invites] = await partnerDb(partnerId, async (tx) => [
    await tx.partnerUser.findMany({
      orderBy: [{ status: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        acceptedAt: true,
        lastSeenAt: true,
      },
    }),
    await tx.partnerInvite.findMany({
      where: { acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, emailId: true },
    }),
  ]);

  // The delivery status of each invitation email.
  //
  // `systemDb`, because `outbound_emails` is super-only — it holds the address
  // of every person the platform has ever written to, so there is no partner
  // policy to run this under. THE `partnerId` IN THE WHERE CLAUSE IS THEREFORE
  // THE ONLY SCOPE: systemDb turns the policies off, so an id from another
  // partner's invitation would otherwise read that partner's row.
  const emailIds = invites
    .map((i: { emailId: string | null }) => i.emailId)
    .filter((id: string | null): id is string => !!id);

  const emails = new Map<string, { sentAt: Date | null; failedAt: Date | null; error: string | null }>();
  if (emailIds.length > 0) {
    try {
      const rows = await systemDb((tx) =>
        tx.outboundEmail.findMany({
          where: { id: { in: emailIds }, partnerId },
          select: { id: true, sentAt: true, failedAt: true, error: true },
        }),
      );
      for (const r of rows) emails.set(r.id, r);
    } catch {
      /* the invitations still list; they just read as not-yet-sent */
    }
  }

  const now = Date.now();
  return {
    // The column is TEXT with a CHECK, so the client types it as string. A row
    // that somehow held something else would surface here rather than being
    // cast past — `support` is the least-privileged seat, so an unreadable role
    // fails closed.
    seats: seats.map((s: Omit<SeatRow, "role"> & { role: string }) => ({
      ...s,
      role: (isPartnerUserRole(s.role) ? s.role : "support") as PartnerUserRole,
    })),
    invites: invites.map(
      (i: Omit<InviteRow, "expired" | "delivery" | "sentAt" | "error"> & { emailId: string | null }) => {
        const mail = i.emailId ? emails.get(i.emailId) : undefined;
        return {
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt,
          expired: i.expiresAt.getTime() < now,
          delivery: !mail
            ? ("none" as const)
            : mail.sentAt
              ? ("sent" as const)
              : mail.failedAt
                ? ("failed" as const)
                : ("queued" as const),
          sentAt: mail?.sentAt ?? null,
          error: mail?.failedAt ? mail.error : null,
        };
      },
    ),
  };
}

const INVITE_DAYS = 14;

/**
 * Who is inviting, and on whose behalf.
 *
 * The partner's NAME is in here because the recipient has usually never heard
 * of CANVEXIA — they were hired by the operator — so the subject line leads
 * with the operator. See `partnerInviteEmail` in `@servd/core`.
 */
export interface InviteActor {
  partnerId: string;
  email: string;
  /** The inviter's own name, if their seat has one. Falls back to the address. */
  name?: string | null;
  partnerName?: string;
}

export interface InviteSent {
  ok: true;
  /** Shown once. Still handed back even when the email went out — see below. */
  token: string;
  inviteId: string;
  /** False when nothing was queued: no encryption key, or the insert failed. */
  emailed: boolean;
}

export async function inviteSeat(
  actor: InviteActor,
  email: string,
  role: string,
): Promise<InviteSent | { ok: false; message: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { ok: false, message: "That email doesn't look right." };
  }
  if (!isPartnerUserRole(role)) {
    return { ok: false, message: `Choose one of: ${PARTNER_USER_ROLES.join(", ")}.` };
  }

  // Emailed, and shown once. Never stored.
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5);

  let inviteId: string;
  try {
    inviteId = await partnerDb(actor.partnerId, async (tx) => {
      const existing = await tx.partnerUser.findFirst({
        where: { email: clean },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== "deactivated") {
        throw new Error("SEAT_EXISTS");
      }
      const created = await tx.partnerInvite.create({
        data: {
          partnerId: actor.partnerId,
          email: clean,
          role,
          tokenHash,
          expiresAt,
        },
        select: { id: true },
      });
      await writePartnerAudit(tx, actor.partnerId, {
        actorEmail: actor.email,
        action: "team.invite",
        entityType: "partner_invite",
        entityId: created.id,
        // The EMAIL and the role, never the token.
        after: { email: clean, role },
      });
      return created.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SEAT_EXISTS") {
      return { ok: false, message: "That person already has a seat." };
    }
    return { ok: false, message: "Could not send that invite." };
  }

  const emailed = await queueAndLink(actor, {
    id: inviteId,
    email: clean,
    role,
    token,
    expiresAt,
  });
  return { ok: true, token, inviteId, emailed };
}

/**
 * Queue the email for an invitation that has already committed, and write the
 * queued row's id back onto it.
 *
 * TWO STEPS, NOT ONE TRANSACTION, and they are in this order deliberately. A
 * queued email for an invitation that then rolled back would be a live link to
 * a row that does not exist. This order's worst case is an email that went out
 * with no `emailId` recorded — the /team screen then says "not emailed", which
 * under-reports rather than over-reports, and the admin can resend.
 *
 * Never throws. An invitation that exists with nothing sent is a real state
 * this product has to show, not an error to swallow the invitation over.
 */
async function queueAndLink(
  actor: InviteActor,
  invite: { id: string; email: string; role: string; token: string; expiresAt: Date },
): Promise<boolean> {
  const emailId = await queueInviteEmail({
    partnerId: actor.partnerId,
    partnerName: actor.partnerName || "your team",
    email: invite.email,
    role: invite.role,
    token: invite.token,
    invitedBy: actor.name || actor.email,
    expiresAt: invite.expiresAt,
  });
  if (!emailId) return false;

  try {
    await partnerDb(actor.partnerId, (tx) =>
      tx.partnerInvite.updateMany({
        where: { id: invite.id },
        data: { emailId },
      }),
    );
  } catch {
    /* the email is queued and will go out; only the status column is behind */
  }
  return true;
}

/**
 * Send the invitation again, with a NEW token.
 *
 * THE OLD LINK DIES. Resending because the first email was lost should not
 * leave two live links to the same seat — one of them in a mailbox somebody no
 * longer controls. Replacing `tokenHash` is what makes the old one stop
 * working, and it costs nothing: the recipient is being sent a fresh link
 * either way.
 *
 * The clock restarts too. An invitation resent on day 13 that expires tomorrow
 * is the same support message all over again.
 */
export async function resendInvite(
  actor: InviteActor,
  inviteId: string,
): Promise<{ ok: true; token: string; emailed: boolean } | { ok: false; message: string }> {
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 864e5);

  let invite: { id: string; email: string; role: string } | null = null;
  try {
    invite = await partnerDb(actor.partnerId, async (tx) => {
      const row = await tx.partnerInvite.findUnique({
        where: { id: inviteId },
        select: { id: true, email: true, role: true, acceptedAt: true, revokedAt: true },
      });
      if (!row || row.acceptedAt || row.revokedAt) return null;

      await tx.partnerInvite.updateMany({
        where: { id: inviteId, acceptedAt: null, revokedAt: null },
        data: { tokenHash, expiresAt, emailId: null },
      });
      await writePartnerAudit(tx, actor.partnerId, {
        actorEmail: actor.email,
        action: "team.resend_invite",
        entityType: "partner_invite",
        entityId: inviteId,
        after: { email: row.email, role: row.role },
      });
      return { id: row.id, email: row.email, role: row.role };
    });
  } catch {
    return { ok: false, message: "Could not resend that invite." };
  }
  if (!invite) return { ok: false, message: "That invite is already gone." };

  const emailed = await queueAndLink(actor, { ...invite, token, expiresAt });
  return { ok: true, token, emailed };
}

export async function revokeInvite(
  actor: { partnerId: string; email: string },
  inviteId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    return await partnerDb(actor.partnerId, async (tx) => {
      const updated = await tx.partnerInvite.updateMany({
        where: { id: inviteId, acceptedAt: null },
        data: { revokedAt: new Date() },
      });
      if (updated.count === 0) return { ok: false, message: "That invite is already gone." };
      await writePartnerAudit(tx, actor.partnerId, {
        actorEmail: actor.email,
        action: "team.revoke_invite",
        entityType: "partner_invite",
        entityId: inviteId,
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, message: "Could not revoke that." };
  }
}

/**
 * Deactivate a seat. NEVER deletes it.
 *
 * The audit log names an actor, and deleting the row makes every past action by
 * that person anonymous — which is the opposite of what an audit log is for.
 * The last admin cannot be deactivated: a partner with no admin is a partner
 * locked out of their own brand, pricing and team.
 */
export async function deactivateSeat(
  actor: { partnerId: string; email: string },
  seatId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    return await partnerDb(actor.partnerId, async (tx) => {
      const seat = await tx.partnerUser.findUnique({
        where: { id: seatId },
        select: { role: true, email: true, status: true },
      });
      if (!seat || seat.status === "deactivated") {
        return { ok: false, message: "That seat is already gone." };
      }
      if (seat.role === "admin") {
        const admins = await tx.partnerUser.count({
          where: { role: "admin", status: "active" },
        });
        if (admins <= 1) {
          return {
            ok: false,
            message: "That is your only admin. Promote someone else first.",
          };
        }
      }
      await tx.partnerUser.updateMany({
        where: { id: seatId },
        data: { status: "deactivated", deactivatedAt: new Date() },
      });
      await writePartnerAudit(tx, actor.partnerId, {
        actorEmail: actor.email,
        action: "team.deactivate",
        entityType: "partner_user",
        entityId: seatId,
        before: { email: seat.email, role: seat.role, status: seat.status },
        after: { status: "deactivated" },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, message: "Could not deactivate that seat." };
  }
}
