"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { getEmployeeSession } from "@/server/hr/employee-auth";
import { uploadClockPhoto } from "@/server/storage/clock-photos";

export interface MyStatus {
  name: string;
  clockedIn: boolean;
  since: string | null;
}

export async function getMyStatus(): Promise<MyStatus | null> {
  const s = await getEmployeeSession();
  if (!s) return null;
  return tenantDb(s.restaurantId, async (tx) => {
    const open = await tx.timeEntry.findFirst({
      where: { employeeId: s.employeeId, clockOut: null },
      orderBy: { clockIn: "desc" },
      select: { clockIn: true },
    });
    return { name: s.fullName, clockedIn: !!open, since: open?.clockIn.toISOString() ?? null };
  });
}

/** Employee clock in/out with a required selfie (face verification). */
export async function employeeClockSelfie(
  photoDataUrl: string,
): Promise<{ ok: boolean; status?: "in" | "out"; error?: string }> {
  const s = await getEmployeeSession();
  if (!s) return { ok: false, error: "Please sign in again." };
  if (!photoDataUrl?.startsWith("data:image/")) {
    return { ok: false, error: "A photo is required to clock in." };
  }

  let path: string;
  try {
    path = await uploadClockPhoto(s.restaurantId, s.employeeId, photoDataUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Photo upload failed." };
  }

  try {
    const status = await tenantDb(s.restaurantId, async (tx) => {
      const open = await tx.timeEntry.findFirst({
        where: { employeeId: s.employeeId, clockOut: null },
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
          restaurantId: s.restaurantId,
          employeeId: s.employeeId,
          clockIn: new Date(),
          source: "selfie",
          clockInPhotoUrl: path,
        },
      });
      return "in" as const;
    });
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't record attendance." };
  }
}

export interface MyEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  source: string;
}

/** The employee's recent attendance (last 30 entries). */
export async function getMyAttendance(): Promise<MyEntry[]> {
  const s = await getEmployeeSession();
  if (!s) return [];
  const rows = await tenantDb(s.restaurantId, (tx) =>
    tx.timeEntry.findMany({
      where: { employeeId: s.employeeId },
      orderBy: { clockIn: "desc" },
      take: 30,
      select: { id: true, clockIn: true, clockOut: true, source: true },
    }),
  );
  return rows.map((r) => ({
    id: r.id,
    clockIn: r.clockIn.toISOString(),
    clockOut: r.clockOut?.toISOString() ?? null,
    source: r.source,
  }));
}

export interface MyLeave {
  types: { id: string; name: string }[];
  balances: { type: string; balance: number }[];
  requests: { id: string; type: string; startDate: string; endDate: string; status: string }[];
}

export async function getMyLeave(): Promise<MyLeave | null> {
  const s = await getEmployeeSession();
  if (!s) return null;
  return tenantDb(s.restaurantId, async (tx) => {
    const [types, balances, requests] = await Promise.all([
      tx.leaveType.findMany({ select: { id: true, name: true } }),
      tx.leaveBalance.findMany({
        where: { employeeId: s.employeeId },
        select: { balance: true, leaveType: { select: { name: true } } },
      }),
      tx.leaveRequest.findMany({
        where: { employeeId: s.employeeId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          status: true,
          leaveType: { select: { name: true } },
        },
      }),
    ]);
    return {
      types,
      balances: balances.map((b) => ({ type: b.leaveType.name, balance: b.balance })),
      requests: requests.map((r) => ({
        id: r.id,
        type: r.leaveType.name,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        status: r.status,
      })),
    };
  });
}

/** Employee files their own leave request (pending admin approval). */
export async function requestMyLeave(
  leaveTypeId: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await getEmployeeSession();
  if (!s) return { ok: false, error: "Please sign in again." };
  if (!leaveTypeId || !startDate || !endDate) return { ok: false, error: "Fill in all fields." };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return { ok: false, error: "Please pick valid dates." };
  }
  try {
    await tenantDb(s.restaurantId, (tx) =>
      tx.leaveRequest.create({
        data: {
          restaurantId: s.restaurantId,
          employeeId: s.employeeId,
          leaveTypeId,
          startDate: start,
          endDate: end,
          status: "pending",
        },
      }),
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't submit your request." };
  }
}
