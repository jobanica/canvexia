"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { requireManagerAction } from "@/server/tenancy/require-admin";

/**
 * Reservations & waitlist. A booking with a time is a reservation; a walk-in
 * with no set time is a waitlist entry. Assigning a table marks it "reserved"
 * on the floor plan; seating/cancelling releases it.
 */

export interface ReservationRow {
  id: string;
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  reservedAt: Date | null;
  status: string;
  tableId: string | null;
  note: string | null;
  source: string | null; // "online" = self-booked from the website
  createdAt: Date;
}

export async function listReservations(restaurantId: string): Promise<ReservationRow[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.reservation.findMany({
        where: { status: { in: ["booked", "waitlisted", "seated"] } },
        orderBy: [{ reservedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          partySize: true,
          reservedAt: true,
          status: true,
          tableId: true,
          note: true,
          createdAt: true,
        },
      }),
    );
    // `source` ships in a later migration — read it best-effort so the list never
    // 500s on a DB that hasn't added the column yet.
    const online = new Set<string>();
    try {
      const tagged = await tenantDb(restaurantId, (tx) =>
        tx.reservation.findMany({ where: { source: "online" }, select: { id: true } }),
      );
      for (const t of tagged) online.add(t.id);
    } catch { /* source column not migrated yet */ }
    return rows.map((r) => ({ ...r, source: online.has(r.id) ? "online" : null }));
  } catch {
    return []; // not migrated yet
  }
}

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z
  .object({
    customerName: z.string().trim().min(1, "Name is required").max(80),
    customerPhone: z.string().trim().max(30).optional().or(z.literal("")),
    partySize: z.coerce.number().int().min(1, "Party size?").max(100),
    kind: z.enum(["reservation", "waitlist"]),
    when: z.string().trim().optional().or(z.literal("")), // datetime-local
    tableId: z.string().trim().max(64).optional().or(z.literal("")),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "reservation" && !v.when) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a date & time.", path: ["when"] });
    }
  });

export async function createReservation(_prev: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  const parsed = schema.safeParse({
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") ?? "",
    partySize: formData.get("partySize"),
    kind: formData.get("kind"),
    when: formData.get("when") ?? "",
    tableId: formData.get("tableId") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const reservedAt = v.kind === "reservation" && v.when ? new Date(v.when) : null;
  const tableId = v.tableId || null;
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.reservation.create({
        data: {
          restaurantId,
          customerName: v.customerName,
          customerPhone: v.customerPhone || null,
          partySize: v.partySize,
          reservedAt,
          status: v.kind === "waitlist" ? "waitlisted" : "booked",
          tableId,
          note: v.note || null,
        },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Couldn't save. Make sure the reservations migration has been run." };
  }
  // Best-effort: mark the chosen table "reserved" on the floor plan. Done in its
  // own step so a not-yet-migrated table.status column can't fail the booking.
  if (tableId) {
    try {
      await tenantDb(restaurantId, (tx) =>
        tx.table.updateMany({ where: { id: tableId }, data: { status: "reserved" } }),
      );
    } catch {
      /* floor-plan migration not run yet — the table just won't show reserved */
    }
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/floor");
  return { ok: true };
}

const STATUS = z.enum(["seated", "cancelled", "no_show"]);

/** Update a reservation's status; releases any held table on the floor. */
export async function setReservationStatus(formData: FormData): Promise<void> {
  const staff = await requireStaff(["cashier", "admin"]);
  const id = String(formData.get("id") ?? "");
  const parsed = STATUS.safeParse(String(formData.get("status") ?? ""));
  if (!parsed.success) return;

  await tenantDb(staff.restaurantId, async (tx) => {
    const r = await tx.reservation.findFirst({ where: { id }, select: { tableId: true } });
    await tx.reservation.update({ where: { id }, data: { status: parsed.data } });
    // Release a reserved table (orders take over occupancy once they're seated).
    if (r?.tableId) {
      await tx.table.updateMany({ where: { id: r.tableId, status: "reserved" }, data: { status: "empty" } });
    }
  });
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/floor");
}

/** Assign (or clear) a table for a reservation; marks the table "reserved". */
export async function assignReservationTable(formData: FormData): Promise<void> {
  const staff = await requireStaff(["cashier", "admin"]);
  const id = String(formData.get("id") ?? "");
  const tableId = String(formData.get("tableId") ?? "");

  await tenantDb(staff.restaurantId, async (tx) => {
    const prev = await tx.reservation.findFirst({ where: { id }, select: { tableId: true } });
    if (prev?.tableId && prev.tableId !== tableId) {
      await tx.table.updateMany({ where: { id: prev.tableId, status: "reserved" }, data: { status: "empty" } });
    }
    await tx.reservation.update({ where: { id }, data: { tableId: tableId || null } });
    if (tableId) {
      await tx.table.updateMany({ where: { id: tableId }, data: { status: "reserved" } });
    }
  });
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/floor");
}
