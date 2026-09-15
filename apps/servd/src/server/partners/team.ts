import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { PARTNER_USER_ROLES, isPartnerUserRole, type PartnerUserRole } from "@servd/core";
import { partnerDb } from "@/server/tenancy/scoped-db";

/**
 * Seats and invitations.
 *
 * THE TOKEN IS NEVER STORED. `partner_invites.tokenHash` holds a SHA-256; the
 * token itself is shown once, to the person creating the invite, and would be
 * emailed if this deployment could send mail. A leaked database therefore
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

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  expired: boolean;
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
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  ]);

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
    invites: invites.map((i: Omit<InviteRow, "expired">) => ({
      ...i,
      expired: i.expiresAt.getTime() < now,
    })),
  };
}

const INVITE_DAYS = 14;

export async function inviteSeat(
  actor: { partnerId: string; email: string },
  email: string,
  role: string,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { ok: false, message: "That email doesn't look right." };
  }
  if (!isPartnerUserRole(role)) {
    return { ok: false, message: `Choose one of: ${PARTNER_USER_ROLES.join(", ")}.` };
  }

  // Shown once, never stored.
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    await partnerDb(actor.partnerId, async (tx) => {
      const existing = await tx.partnerUser.findFirst({
        where: { email: clean },
        select: { id: true, status: true },
      });
      if (existing && existing.status !== "deactivated") {
        throw new Error("SEAT_EXISTS");
      }
      await tx.partnerInvite.create({
        data: {
          partnerId: actor.partnerId,
          email: clean,
          role,
          tokenHash,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "team.invite",
          entityType: "partner_invite",
          // The EMAIL and the role, never the token.
          after: { email: clean, role },
        },
      });
    });
    return { ok: true, token };
  } catch (e) {
    if (e instanceof Error && e.message === "SEAT_EXISTS") {
      return { ok: false, message: "That person already has a seat." };
    }
    return { ok: false, message: "Could not send that invite." };
  }
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
      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "team.revoke_invite",
          entityType: "partner_invite",
          entityId: inviteId,
        },
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
      await tx.auditLog.create({
        data: {
          actorType: "partner",
          partnerId: actor.partnerId,
          actorEmail: actor.email,
          action: "team.deactivate",
          entityType: "partner_user",
          entityId: seatId,
          before: { email: seat.email, role: seat.role, status: seat.status },
          after: { status: "deactivated" },
        },
      });
      return { ok: true };
    });
  } catch {
    return { ok: false, message: "Could not deactivate that seat." };
  }
}
