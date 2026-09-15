import "server-only";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Append-only audit trail: who/what/when with before/after snapshots.
 *
 * What is actually recorded, so this comment can be trusted as the list:
 *   order.void, order.item_void, order.void_closed, order.refund
 *   menu.price_changed, menu.item_updated, menu.item_deleted,
 *   menu.item_available, menu.item_unavailable
 *   giftcard.redeem
 *   delivery.booking_created / _failed / _manual / _cancelled,
 *   delivery.status_changed
 *
 * Anything not on that list is NOT audited — staff and role changes, settings,
 * and plan/billing changes among them.
 *
 * Reused across features — pass the SAME transaction client so the log commits
 * atomically with the change it describes. A log that can survive its own
 * transaction rolling back is worse than no log.
 *
 * Best-effort: if the audit_logs table isn't migrated yet, the write is skipped
 * rather than failing the underlying operation.
 */
export interface AuditEntry {
  actorStaffId?: string | null;
  actorEmail?: string | null;
  action: string; // "order.void", "menu.price_changed", …
  entityType: string; // "order", "order_item", "menu_item", …
  entityId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Who did it, and to whom.
 *
 * `restaurantId` is now OPTIONAL and that is the point of this type existing.
 * An HQ or partner action — approving an operator, reassigning a merchant,
 * adjusting a ledger — has an actor and a subject but no restaurant. The column
 * has been nullable since CANVEXIA; this helper is what finally lets a caller
 * use that, instead of six partner modules each hand-rolling
 * `tx.auditLog.create` because the helper would not take their row.
 *
 * That was the real cost: "every mutation writes an audit row" was a convention
 * enforced by remembering, and the six hand-rolled copies had already drifted
 * on which fields they set.
 */
export type AuditActorType = "merchant" | "partner" | "hq" | "system";

export interface AuditScope {
  restaurantId?: string | null;
  partnerId?: string | null;
  actorType?: AuditActorType;
}

/**
 * Write an audit row inside an existing transaction. Never throws.
 *
 * Pass the SAME transaction client as the change it describes, so the log
 * commits atomically with it. A log that can survive its own transaction
 * rolling back is worse than no log.
 *
 * The second argument takes either a restaurant id — every existing caller
 * passes one, and they keep working unchanged — or a scope object.
 */
async function createAuditRow(
  tx: Prisma.TransactionClient,
  s: AuditScope,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      restaurantId: s.restaurantId ?? null,
      partnerId: s.partnerId ?? null,
      // Defaulted, not required: a row with no actorType is a merchant action by
      // construction, which is what every row written before the column existed
      // is.
      actorType: s.actorType ?? (s.partnerId ? "partner" : "merchant"),
      actorStaffId: entry.actorStaffId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      reason: entry.reason ?? null,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function writeAudit(
  tx: Prisma.TransactionClient,
  scope: string | AuditScope,
  entry: AuditEntry,
): Promise<void> {
  const s: AuditScope = typeof scope === "string" ? { restaurantId: scope } : scope;
  try {
    await createAuditRow(tx, s, entry);
  } catch {
    /* audit_logs not migrated yet — skip, never block the real write */
  }
}

/**
 * An action a partner took in their own portal.
 *
 * THROWS where `writeAudit` swallows, and that difference is the whole reason
 * this is a separate function rather than a default argument.
 *
 * `writeAudit` is best-effort because it guards a merchant's till: a shop that
 * cannot void an order because audit_logs is mid-migration is an outage in a
 * restaurant, and the trade was made deliberately. Nothing here is a till.
 * These are seats being granted, prices being set and merchants changing hands
 * — the brief's rule is "all mutations → audit_log", and a mutation that landed
 * with no row is worse than one that did not land.
 *
 * It also preserves what the six hand-rolled copies already did: they were bare
 * `tx.auditLog.create` calls inside each module's own try/catch, so a failed
 * audit row already failed the operation. Moving them onto a swallowing helper
 * would have quietly changed that.
 */
export async function writePartnerAudit(
  tx: Prisma.TransactionClient,
  partnerId: string,
  entry: AuditEntry & { actorType?: AuditActorType },
): Promise<void> {
  const { actorType, ...rest } = entry;
  await createAuditRow(tx, { partnerId, actorType: actorType ?? "partner" }, rest);
}

/**
 * An action HQ took, in /hq. Throws, for the same reason as above.
 *
 * `partnerId` is the partner the action was ABOUT, not the actor — HQ has no
 * partner. It is set wherever there is one, because the partner-detail Activity
 * tab filters on it, and an HQ action missing from the tab that is supposed to
 * show every action on that partner is a gap nobody would notice until they
 * needed it.
 */
export async function writeHqAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntry & { partnerId?: string | null; restaurantId?: string | null },
): Promise<void> {
  const { partnerId, restaurantId, ...rest } = entry;
  await createAuditRow(tx, { partnerId, restaurantId, actorType: "hq" }, rest);
}

/** Convenience: open a tenant transaction just to record one audit row. */
export async function audit(restaurantId: string, entry: AuditEntry): Promise<void> {
  await tenantDb(restaurantId, (tx) => writeAudit(tx, restaurantId, entry));
}

export interface AuditRow {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

/** Read recent audit entries for the audit-log viewer. Tenant-scoped. */
export async function getAuditLogs(
  restaurantId: string,
  opts?: { limit?: number; action?: string },
): Promise<AuditRow[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.auditLog.findMany({
        where: opts?.action ? { action: { startsWith: opts.action } } : undefined,
        orderBy: { createdAt: "desc" },
        take: Math.min(opts?.limit ?? 200, 1000),
        select: {
          id: true,
          actorEmail: true,
          action: true,
          entityType: true,
          entityId: true,
          reason: true,
          before: true,
          after: true,
          createdAt: true,
        },
      }),
    );
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  } catch {
    return []; // not migrated yet
  }
}
