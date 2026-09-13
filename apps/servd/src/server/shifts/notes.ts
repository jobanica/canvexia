"use server";

import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";

/** Shift handover notes — left by one shift for the next. */
export interface ShiftNoteRow {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export async function listShiftNotes(): Promise<ShiftNoteRow[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin", "kitchen"]);
  } catch {
    return [];
  }
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // last 3 days
    const rows = await tenantDb(staff.restaurantId, (tx) =>
      tx.shiftNote.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, authorName: true, body: true, createdAt: true },
      }),
    );
    return rows.map((r) => ({ id: r.id, authorName: r.authorName, body: r.body, createdAt: r.createdAt.toISOString() }));
  } catch {
    return []; // not migrated yet
  }
}

const schema = z.object({ body: z.string().trim().min(1, "Write a note.").max(1000) });

export async function addShiftNote(body: string): Promise<{ ok: boolean; notes?: ShiftNoteRow[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const parsed = schema.safeParse({ body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const me = await tx.staffUser.findFirst({ where: { id: staff.staffUserId }, select: { displayName: true, email: true } });
      await tx.shiftNote.create({
        data: {
          restaurantId: staff.restaurantId,
          authorStaffId: staff.staffUserId,
          authorName: me?.displayName || me?.email || "Staff",
          body: parsed.data.body,
        },
      });
    });
  } catch {
    return { ok: false, error: "Couldn't save. Make sure the shift-notes migration has been run." };
  }
  return { ok: true, notes: await listShiftNotes() };
}
