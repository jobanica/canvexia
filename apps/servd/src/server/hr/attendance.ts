import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { startOfManilaDay } from "@/lib/orders/order-number";
import { manilaDayKey } from "@/lib/time/manila";

export interface AttendanceToday {
  totalActive: number;
  presentCount: number;
  onClockNow: { id: string; name: string; since: string; hoursSoFar: number }[];
  clockedInToday: { id: string; name: string; firstIn: string }[];
  notClockedIn: { id: string; name: string }[];
}

/** Live attendance snapshot for today: who's on the clock, who's in, who's out. */
export async function getAttendanceToday(restaurantId: string): Promise<AttendanceToday> {
  // "Today" is the restaurant's local (Manila) day, not the server's UTC day —
  // otherwise clock-ins early in the Manila morning land in the wrong day.
  const start = startOfManilaDay();
  const now = Date.now();

  return tenantDb(restaurantId, async (tx) => {
    const [employees, entriesToday, openNow] = await Promise.all([
      tx.employee.findMany({
        where: { status: "active" },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
      tx.timeEntry.findMany({
        where: { clockIn: { gte: start } },
        orderBy: { clockIn: "asc" },
        select: { employeeId: true, clockIn: true, employee: { select: { fullName: true } } },
      }),
      tx.timeEntry.findMany({
        where: { clockOut: null },
        orderBy: { clockIn: "asc" },
        select: { employeeId: true, clockIn: true, employee: { select: { fullName: true } } },
      }),
    ]);

    const firstInByEmp = new Map<string, { name: string; firstIn: Date }>();
    for (const e of entriesToday) {
      if (!firstInByEmp.has(e.employeeId)) {
        firstInByEmp.set(e.employeeId, { name: e.employee.fullName, firstIn: e.clockIn });
      }
    }

    const onClockNow = openNow.map((e) => ({
      id: e.employeeId,
      name: e.employee.fullName,
      since: e.clockIn.toISOString(),
      hoursSoFar: Math.round(((now - e.clockIn.getTime()) / 3600000) * 10) / 10,
    }));

    const presentIds = new Set(firstInByEmp.keys());
    const clockedInToday = [...firstInByEmp.entries()].map(([id, v]) => ({
      id,
      name: v.name,
      firstIn: v.firstIn.toISOString(),
    }));
    const notClockedIn = employees
      .filter((e) => !presentIds.has(e.id))
      .map((e) => ({ id: e.id, name: e.fullName }));

    return {
      totalActive: employees.length,
      presentCount: presentIds.size,
      onClockNow,
      clockedInToday,
      notClockedIn,
    };
  });
}

export interface LateRow {
  name: string;
  date: string; // YYYY-MM-DD (Manila)
  shiftStart: string; // ISO
  clockIn: string; // ISO
  minutesLate: number;
}

// Bucket by the restaurant's local (Manila) calendar day so a shift and its
// clock-in match even when the UTC date rolls over mid-evening.
const dayKey = manilaDayKey;

/**
 * Late arrivals over a date range: an employee's first clock-in of a day vs the
 * start of their scheduled shift that day (+ a grace period).
 */
export async function getLateReport(
  restaurantId: string,
  from: Date,
  to: Date,
  graceMinutes = 5,
): Promise<LateRow[]> {
  return tenantDb(restaurantId, async (tx) => {
    const [entries, shifts] = await Promise.all([
      tx.timeEntry.findMany({
        where: { clockIn: { gte: from, lte: to } },
        orderBy: { clockIn: "asc" },
        select: { employeeId: true, clockIn: true, employee: { select: { fullName: true } } },
      }),
      tx.shift.findMany({
        where: { startsAt: { gte: from, lte: to }, employeeId: { not: null } },
        orderBy: { startsAt: "asc" },
        select: { employeeId: true, startsAt: true },
      }),
    ]);

    // Earliest scheduled shift per employee+day.
    const shiftStart = new Map<string, Date>();
    for (const s of shifts) {
      if (!s.employeeId) continue;
      const key = `${s.employeeId}:${dayKey(s.startsAt)}`;
      if (!shiftStart.has(key)) shiftStart.set(key, s.startsAt);
    }

    // Earliest clock-in per employee+day.
    const firstIn = new Map<string, { name: string; clockIn: Date }>();
    for (const e of entries) {
      const key = `${e.employeeId}:${dayKey(e.clockIn)}`;
      if (!firstIn.has(key)) firstIn.set(key, { name: e.employee.fullName, clockIn: e.clockIn });
    }

    const rows: LateRow[] = [];
    for (const [key, v] of firstIn) {
      const start = shiftStart.get(key);
      if (!start) continue; // no scheduled shift that day → can't be "late"
      const lateMs = v.clockIn.getTime() - start.getTime();
      const minutesLate = Math.round(lateMs / 60000);
      if (minutesLate > graceMinutes) {
        rows.push({
          name: v.name,
          date: key.split(":")[1],
          shiftStart: start.toISOString(),
          clockIn: v.clockIn.toISOString(),
          minutesLate,
        });
      }
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.minutesLate - a.minutesLate));
    return rows;
  });
}
