import "server-only";
import { isPartnerUserRole, type PartnerUserRole } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";
import { listPartnerMerchants, type PartnerMerchant } from "./merchants";

/**
 * One staff member's record, and what they are carrying.
 *
 * `systemDb` with an explicit `partnerId` in every `where`, not `partnerDb`.
 * The staff tables have a SEAT arm in RLS (A7.1), so a manager reading a
 * colleague's record under `partnerDb` would be refused by the policy for the
 * ordinary case — the policy is a floor for direct access, and the screen's own
 * rule is the permission check at the gate. That is the same trade `/hq` makes,
 * and the `where` clause is what makes it safe: every query below names the
 * partner.
 */
export interface StaffProfile {
  id: string;
  email: string;
  name: string | null;
  role: PartnerUserRole;
  status: string;
  mobile: string | null;
  zone: string | null;
  startDate: Date | null;
  photoPath: string | null;
  acceptedAt: Date | null;
  lastSeenAt: Date | null;
  /**
   * Present ONLY when the reader holds `hr.view_all`.
   *
   * Undefined rather than null when withheld, and not selected from the
   * database at all — a value that reaches the server action is a value one
   * `console.log` away from a log file.
   */
  emergency?: { name: string | null; mobile: string | null };
}

export async function getStaffProfile(
  partnerId: string,
  staffId: string,
  opts: { includeEmergency: boolean },
): Promise<StaffProfile | null> {
  const row = await systemDb((tx) =>
    tx.partnerUser.findFirst({
      where: { id: staffId, partnerId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        mobile: true,
        zone: true,
        startDate: true,
        photoPath: true,
        acceptedAt: true,
        lastSeenAt: true,
        // Conditional SELECT, not a conditional render. Prisma takes a boolean
        // here, so the columns are simply not in the query when withheld.
        emergencyName: opts.includeEmergency,
        emergencyMobile: opts.includeEmergency,
      },
    }),
  );
  if (!row) return null;

  const { emergencyName, emergencyMobile, ...rest } = row as typeof row & {
    emergencyName?: string | null;
    emergencyMobile?: string | null;
  };

  return {
    ...rest,
    role: (isPartnerUserRole(rest.role) ? rest.role : "support") as PartnerUserRole,
    ...(opts.includeEmergency
      ? { emergency: { name: emergencyName ?? null, mobile: emergencyMobile ?? null } }
      : {}),
  };
}

/** Everything assigned to one seat: merchants across both products, prospects. */
export interface StaffBook {
  merchants: (PartnerMerchant & { as: "sales" | "support" })[];
  prospects: { id: string; businessName: string; stage: string }[];
}

export async function getStaffBook(
  partnerId: string,
  staffId: string,
): Promise<StaffBook> {
  const [all, restaurants, pharmacies, prospects] = await Promise.all([
    listPartnerMerchants(partnerId),
    systemDb((tx) =>
      tx.restaurant
        .findMany({
          where: {
            partnerId,
            OR: [{ assignedSalesUserId: staffId }, { assignedSupportUserId: staffId }],
          },
          select: { id: true, assignedSalesUserId: true },
        })
        .catch(() => [] as { id: string; assignedSalesUserId: string | null }[]),
    ),
    systemDb((tx) =>
      tx.pharmacy
        .findMany({
          where: {
            partnerId,
            OR: [{ assignedSalesUserId: staffId }, { assignedSupportUserId: staffId }],
          },
          select: { id: true, assignedSalesUserId: true },
        })
        .catch(() => [] as { id: string; assignedSalesUserId: string | null }[]),
    ),
    systemDb((tx) =>
      tx.prospect
        .findMany({
          where: { partnerId, assignedToId: staffId },
          select: { id: true, businessName: true, stage: true },
          orderBy: { businessName: "asc" },
        })
        .catch(() => [] as { id: string; businessName: string; stage: string }[]),
    ),
  ]);

  const role = new Map<string, "sales" | "support">();
  for (const r of restaurants) {
    role.set(`servd:${r.id}`, r.assignedSalesUserId === staffId ? "sales" : "support");
  }
  for (const p of pharmacies) {
    role.set(`pharmacy:${p.id}`, p.assignedSalesUserId === staffId ? "sales" : "support");
  }

  return {
    merchants: all
      .filter((m) => role.has(m.key))
      .map((m) => ({ ...m, as: role.get(m.key)! })),
    prospects: prospects.map((p) => ({ ...p, stage: String(p.stage) })),
  };
}

/**
 * The activity feed: `staff_events` and the audit trail, as one list.
 *
 * TWO SOURCES ON PURPOSE. `staff_events` holds what a person DID, including the
 * things that changed nothing — a call placed, a visit where the owner was out.
 * `audit_logs` holds what CHANGED. Neither alone is the answer to "what has this
 * person been doing", and merging them in the reader rather than writing
 * everything into one table keeps the audit log reviewable.
 */
export interface ActivityRow {
  at: Date;
  source: "event" | "audit";
  kind: string;
  detail: string;
}

export async function getStaffActivity(
  partnerId: string,
  staff: { id: string; email: string },
  range: { from: Date; to: Date },
  limit = 200,
): Promise<ActivityRow[]> {
  const [events, audits] = await Promise.all([
    systemDb((tx) =>
      tx.staffEvent
        .findMany({
          where: {
            partnerId,
            partnerUserId: staff.id,
            occurredAt: { gte: range.from, lte: range.to },
          },
          select: { kind: true, occurredAt: true, subjectType: true, detail: true },
          orderBy: { occurredAt: "desc" },
          take: limit,
        })
        .catch(() => []),
    ),
    systemDb((tx) =>
      tx.auditLog
        .findMany({
          where: {
            partnerId,
            actorEmail: staff.email,
            createdAt: { gte: range.from, lte: range.to },
          },
          select: { action: true, entityType: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
        .catch(() => []),
    ),
  ]);

  const rows: ActivityRow[] = [
    ...events.map((e) => ({
      at: e.occurredAt,
      source: "event" as const,
      kind: e.kind,
      detail: describe(e.kind, e.subjectType, e.detail),
    })),
    ...audits.map((a) => ({
      at: a.createdAt,
      source: "audit" as const,
      kind: a.action,
      detail: a.entityType,
    })),
  ];
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows.slice(0, limit);
}

const EVENT_COPY: Record<string, string> = {
  "prospect.added": "Added a prospect",
  "prospect.stage": "Moved a prospect",
  "call.logged": "Logged a call",
  "visit.logged": "Logged a visit",
  "demo.built": "Built a demo",
  "trial.started": "Started a trial",
  "merchant.converted": "Converted a merchant",
  "ticket.closed": "Closed a ticket",
  "attendance.check_in": "Checked in",
  "attendance.check_out": "Checked out",
};

function describe(kind: string, subjectType: string | null, detail: unknown): string {
  const base = EVENT_COPY[kind] ?? kind;
  const name =
    detail && typeof detail === "object" && "name" in detail
      ? String((detail as { name: unknown }).name)
      : null;
  if (name) return `${base}: ${name}`;
  return subjectType ? `${base} (${subjectType})` : base;
}

/**
 * The counts under the activity tab. Derived from the same range.
 *
 * Separate query rather than counting the rows above, because the feed is
 * capped at 200 and a count that only counts what fits on the page is a count
 * that quietly stops growing.
 */
export async function getStaffCounts(
  partnerId: string,
  staffId: string,
  range: { from: Date; to: Date },
): Promise<{ kind: string; count: number }[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.staffEvent.groupBy({
        by: ["kind"],
        where: {
          partnerId,
          partnerUserId: staffId,
          occurredAt: { gte: range.from, lte: range.to },
        },
        _count: { _all: true },
      }),
    );
    return rows
      .map((r) => ({ kind: r.kind, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}
