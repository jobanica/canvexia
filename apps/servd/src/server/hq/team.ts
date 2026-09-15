import "server-only";
import { parseHqRole, type HqUserRole } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * HQ seats, and the whole audit log.
 *
 * ONE HONEST GAP, stated up front because the screen has to be honest about it
 * too: inviting an HQ user here creates the `platform_admins` row, not the
 * Supabase auth user. This codebase has no server-side user-creation path that
 * does not involve the service-role key minting a password, and the partner
 * portal made the same call — its invitations hand over a token rather than
 * creating an account.
 *
 * So the flow is: create the auth user in Supabase, paste their id here. That
 * is one manual step for a handful of people who work at CANVEXIA, and it is
 * the same step `bootstrap-hq-admin.sql` describes for the first seat.
 */

export interface HqSeat {
  id: string;
  email: string;
  displayName: string | null;
  role: HqUserRole;
  status: string;
  authUserId: string;
  invitedBy: string | null;
  invitedByEmail: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export async function listHqSeats(): Promise<HqSeat[]> {
  return systemDb(async (tx) => {
    const rows = await tx.platformAdmin.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        authUserId: true,
        invitedBy: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r.email]));
    return rows.map((r) => ({
      ...r,
      role: parseHqRole(r.role),
      invitedByEmail: r.invitedBy ? (byId.get(r.invitedBy) ?? null) : null,
    }));
  });
}

// ----------------------------------------------------------------------------
// The audit log.
// ----------------------------------------------------------------------------

export interface AuditFilter {
  actor?: string;
  partnerId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AuditEntryRow {
  id: string;
  actorType: string | null;
  actorEmail: string | null;
  partnerId: string | null;
  partnerName: string | null;
  restaurantId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

/**
 * Every actor, every partner, every app.
 *
 * `systemDb`, which is the only context that can read an audit row with no
 * restaurantId — the tenant policy on audit_logs resolves through
 * restaurants."partnerId", and an HQ action has neither.
 */
export async function searchAudit(f: AuditFilter = {}): Promise<{
  rows: AuditEntryRow[];
  actions: string[];
  actors: string[];
}> {
  const take = Math.min(f.limit ?? 200, 1000);

  return systemDb(async (tx) => {
    const [rows, partners, distinct] = await Promise.all([
      tx.auditLog
        .findMany({
          where: {
            ...(f.actor ? { actorEmail: { contains: f.actor, mode: "insensitive" } } : {}),
            ...(f.partnerId ? { partnerId: f.partnerId } : {}),
            // startsWith, not equals: "partner." finds every partner action,
            // which is how somebody actually narrows a log they are reading.
            ...(f.action ? { action: { startsWith: f.action } } : {}),
            ...(f.entityType ? { entityType: f.entityType } : {}),
            ...(f.from || f.to
              ? {
                  createdAt: {
                    ...(f.from ? { gte: new Date(`${f.from}T00:00:00+08:00`) } : {}),
                    ...(f.to ? { lt: new Date(`${f.to}T00:00:00+08:00`) } : {}),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            actorType: true,
            actorEmail: true,
            partnerId: true,
            restaurantId: true,
            action: true,
            entityType: true,
            entityId: true,
            reason: true,
            before: true,
            after: true,
            createdAt: true,
          },
        })
        .catch(() => []),
      tx.partner.findMany({ select: { id: true, name: true } }),
      // The filter options, from the log itself rather than a hand-kept list —
      // an action added next month appears in the dropdown the first time it is
      // recorded, instead of being invisible until somebody remembers.
      tx.auditLog
        .findMany({
          distinct: ["action"],
          orderBy: { action: "asc" },
          select: { action: true },
          take: 200,
        })
        .catch(() => []),
    ]);

    const nameBy = new Map(partners.map((p) => [p.id, p.name]));

    return {
      rows: rows.map((r) => ({
        ...r,
        partnerName: r.partnerId ? (nameBy.get(r.partnerId) ?? null) : null,
      })),
      // Grouped to the prefix: "partner.suspended" and "partner.approved" offer
      // one entry, because a 60-item dropdown is not a filter.
      actions: [...new Set(distinct.map((d) => d.action.split(".")[0] + "."))].sort(),
      actors: [...new Set(rows.map((r) => r.actorEmail).filter((e): e is string => !!e))].sort(),
    };
  });
}

// ----------------------------------------------------------------------------
// The impersonation log.
// ----------------------------------------------------------------------------

export interface ImpersonationRow {
  id: string;
  hqAdminEmail: string;
  partnerId: string;
  partnerName: string;
  reason: string | null;
  createdAt: Date;
  usedAt: Date | null;
  endedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Seconds the session actually lasted, or null if it never started. */
  durationSeconds: number | null;
  state: "unused" | "expired" | "live" | "ended" | "revoked";
}

export async function listImpersonations(limit = 100): Promise<ImpersonationRow[]> {
  const now = Date.now();
  return systemDb(async (tx) => {
    const rows = await tx.impersonationGrant
      .findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          hqAdminEmail: true,
          partnerId: true,
          reason: true,
          createdAt: true,
          usedAt: true,
          endedAt: true,
          expiresAt: true,
          revokedAt: true,
          partner: { select: { name: true } },
        },
      })
      .catch(() => []);

    return rows.map((r) => {
      // A session that was opened and never explicitly ended stops at its
      // expiry — the cookie is useless past it, so that IS the duration.
      // Reporting "still open" for a grant from last month would be wrong.
      const stopped = r.endedAt ?? (r.usedAt ? new Date(Math.min(now, r.expiresAt.getTime())) : null);
      return {
        id: r.id,
        hqAdminEmail: r.hqAdminEmail,
        partnerId: r.partnerId,
        partnerName: r.partner.name,
        reason: r.reason,
        createdAt: r.createdAt,
        usedAt: r.usedAt,
        endedAt: r.endedAt,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
        durationSeconds:
          r.usedAt && stopped ? Math.max(0, Math.round((stopped.getTime() - r.usedAt.getTime()) / 1000)) : null,
        state: r.revokedAt
          ? "revoked"
          : r.endedAt
            ? "ended"
            : !r.usedAt
              ? r.expiresAt.getTime() <= now
                ? "expired"
                : "unused"
              : r.expiresAt.getTime() <= now
                ? "expired"
                : "live",
      };
    });
  });
}
