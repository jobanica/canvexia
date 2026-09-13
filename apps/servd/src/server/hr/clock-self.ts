"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { uploadClockPhoto } from "@/server/storage/clock-photos";

const ROLES = ["kitchen", "cashier", "manager", "admin"] as const;

export interface ClockStatus {
  name: string;
  clockedIn: boolean;
  since: string | null;
}

/** Current clock status for the signed-in staff member. */
export async function getMyClockStatus(): Promise<ClockStatus> {
  const staff = await requireStaff([...ROLES]);
  return tenantDb(staff.restaurantId, async (tx) => {
    const emp = await tx.employee.findFirst({ where: { staffUserId: staff.staffUserId } });
    if (!emp) return { name: staff.email, clockedIn: false, since: null };
    const open = await tx.timeEntry.findFirst({
      where: { employeeId: emp.id, clockOut: null },
      orderBy: { clockIn: "desc" },
    });
    return {
      name: emp.fullName,
      clockedIn: !!open,
      since: open?.clockIn.toISOString() ?? null,
    };
  });
}

/**
 * Self clock-in/out with a required selfie. Resolves (or auto-creates) the
 * employee linked to this login, stores the photo, and toggles the time entry —
 * which then appears in HR → Timesheets.
 */
export async function clockSelfie(
  photoDataUrl: string,
): Promise<{ ok: boolean; status?: "in" | "out"; name?: string; error?: string }> {
  let staff;
  try {
    staff = await requireStaff([...ROLES]);
  } catch {
    return { ok: false, error: "Please sign in first." };
  }
  if (!photoDataUrl?.startsWith("data:image/")) {
    return { ok: false, error: "A photo is required to clock in." };
  }

  // Resolve or create the employee record for this login.
  const emp = await tenantDb(staff.restaurantId, async (tx) => {
    const existing = await tx.employee.findFirst({ where: { staffUserId: staff.staffUserId } });
    if (existing) return existing;
    return tx.employee.create({
      data: { restaurantId: staff.restaurantId, staffUserId: staff.staffUserId, fullName: staff.email },
    });
  });

  let path: string;
  try {
    path = await uploadClockPhoto(staff.restaurantId, emp.id, photoDataUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Photo upload failed." };
  }

  const status = await tenantDb(staff.restaurantId, async (tx) => {
    const open = await tx.timeEntry.findFirst({
      where: { employeeId: emp.id, clockOut: null },
      orderBy: { clockIn: "desc" },
    });
    if (open) {
      await tx.timeEntry.update({
        where: { id: open.id },
        data: { clockOut: new Date(), clockOutPhotoUrl: path },
      });
      return "out" as const;
    }
    await tx.timeEntry.create({
      data: {
        restaurantId: staff.restaurantId,
        employeeId: emp.id,
        clockIn: new Date(),
        source: "selfie",
        clockInPhotoUrl: path,
      },
    });
    return "in" as const;
  });

  return { ok: true, status, name: emp.fullName };
}
