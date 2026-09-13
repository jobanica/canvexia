"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { audit } from "@/server/audit/log";
import { notifyOrdersChanged } from "@/server/realtime/notify";

/**
 * Turn a raw DB error into something actionable. The floor-plan columns
 * (tables.status/posX/posY) and the audit_logs table ship in a manual
 * migration; if it hasn't been run, writes fail with "column/relation does not
 * exist" — surface that instead of a silent no-op.
 */
function humanizeDbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/does not exist|Unknown (arg|column)|P2022|42703|42P01/i.test(msg)) {
    return "Floor plan isn't set up on the database yet — run the add-floor-plan-and-audit.sql migration in Supabase, then try again.";
  }
  return msg;
}

/**
 * Visual floor plan. A table's occupancy is derived from its open unpaid orders
 * (the source of truth), while needs_cleaning / reserved / empty are explicit
 * statuses staff set. The two combine into the effective status shown on the
 * floor. Server-authoritative; tenant-scoped via RLS.
 */

export type EffectiveStatus = "empty" | "occupied" | "needs_cleaning" | "reserved";

export interface FloorTable {
  id: string;
  tableNumber: string;
  status: EffectiveStatus;
  storedStatus: EffectiveStatus;
  posX: number | null;
  posY: number | null;
  seats: number | null;
  openOrders: number;
  outstanding: number; // centavos owed across open unpaid orders
}

const OPEN = ["new", "preparing", "done"] as const;

/** Floor plan: seating tables (excludes the counter QR) with live occupancy. */
export async function getFloorPlan(restaurantId: string): Promise<FloorTable[]> {
  // Tables with the floor columns (best-effort — columns may lag pre-migration).
  let tables: { id: string; tableNumber: string; status?: string; posX?: number | null; posY?: number | null; seats?: number | null }[];
  try {
    tables = await tenantDb(restaurantId, (tx) =>
      tx.table.findMany({
        where: { isCounter: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, tableNumber: true, status: true, posX: true, posY: true, seats: true },
      }),
    );
  } catch {
    tables = await tenantDb(restaurantId, (tx) =>
      tx.table.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, tableNumber: true } }),
    );
  }

  // Open unpaid orders per table → occupancy + amount owed. discountAmount /
  // creditApplied ship in later migrations, so fall back to bare columns if
  // they're not present yet (never let this 500 the floor plan).
  type OrderRow = { tableId: string | null; total: number; discountAmount?: number; creditApplied?: number };
  let orders: OrderRow[];
  const where: Prisma.OrderWhereInput = {
    status: { in: [...OPEN] },
    paymentStatus: { in: ["unpaid", "failed"] },
    tableId: { not: null },
  };
  try {
    orders = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({ where, select: { tableId: true, total: true, discountAmount: true, creditApplied: true } }),
    );
  } catch {
    orders = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({ where, select: { tableId: true, total: true } }),
    );
  }
  const byTable = new Map<string, { count: number; outstanding: number }>();
  for (const o of orders) {
    if (!o.tableId) continue;
    const cur = byTable.get(o.tableId) ?? { count: 0, outstanding: 0 };
    cur.count += 1;
    cur.outstanding += Math.max(0, o.total - (o.discountAmount ?? 0) - (o.creditApplied ?? 0));
    byTable.set(o.tableId, cur);
  }

  return tables.map((t) => {
    const live = byTable.get(t.id);
    const stored = (t.status as EffectiveStatus | undefined) ?? "empty";
    const openOrders = live?.count ?? 0;
    // Open orders win; a stale "occupied" with no orders falls back to empty.
    const status: EffectiveStatus =
      openOrders > 0 ? "occupied" : stored === "occupied" ? "empty" : stored;
    return {
      id: t.id,
      tableNumber: t.tableNumber,
      status,
      storedStatus: stored,
      posX: t.posX ?? null,
      posY: t.posY ?? null,
      seats: t.seats ?? null,
      openOrders,
      outstanding: live?.outstanding ?? 0,
    };
  });
}

const STATUS = z.enum(["empty", "needs_cleaning", "reserved"]);

/** Staff override of a table's status (empty / needs cleaning / reserved). */
export async function setTableStatus(
  tableId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const parsed = STATUS.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  // The status change is the only thing that must succeed. Keep it in its own
  // transaction so a missing audit_logs table can't poison and roll it back.
  let before: { status: string | null } | null = null;
  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      before = await tx.table.findFirst({ where: { id: tableId }, select: { status: true } });
      await tx.table.update({ where: { id: tableId }, data: { status: parsed.data } });
    });
  } catch (e) {
    return { ok: false, error: humanizeDbError(e) };
  }

  // Audit + realtime are best-effort — never let them fail the status change.
  try {
    await audit(staff.restaurantId, {
      actorStaffId: staff.staffUserId,
      actorEmail: staff.email,
      action: "table.status",
      entityType: "table",
      entityId: tableId,
      before: before ?? undefined,
      after: { status: parsed.data },
    });
  } catch {
    /* audit_logs not migrated — ignore */
  }
  try {
    await notifyOrdersChanged(staff.restaurantId);
  } catch {
    /* realtime unavailable — ignore */
  }
  revalidatePath("/admin/floor");
  return { ok: true };
}

const POS = z.object({
  tableId: z.string().min(1),
  x: z.coerce.number().int().min(0).max(10000),
  y: z.coerce.number().int().min(0).max(10000),
});

/** Save a table's position on the floor-plan canvas (admin only). */
export async function setTablePosition(input: {
  tableId: string;
  x: number;
  y: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { restaurantId } = await requireManagerAction();
  const parsed = POS.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid position." };
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.table.update({
        where: { id: parsed.data.tableId },
        data: { posX: parsed.data.x, posY: parsed.data.y },
      }),
    );
  } catch (e) {
    return { ok: false, error: humanizeDbError(e) };
  }
  return { ok: true };
}
