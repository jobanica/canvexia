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

/** Write an audit row inside an existing transaction. Never throws. */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        restaurantId,
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
  } catch {
    /* audit_logs not migrated yet — skip, never block the real write */
  }
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
