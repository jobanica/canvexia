import "server-only";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Staff performance — attendance, hours, and lateness per employee over a
 * period, plus restaurant-level service KPIs (handling time, order value,
 * items/order as an upsell proxy). Read-only; tenant-scoped.
 */
export interface StaffPerfRow {
  employeeId: string;
  name: string;
  daysWorked: number;
  hours: number; // worked hours (net of breaks)
  lateCount: number;
  lateMinutes: number;
  leaveDays: number;
}

export interface ServiceKpis {
  ordersServed: number;
  avgHandlingMin: number; // created → served
  paidOrders: number;
  avgOrderValue: number; // centavos
  avgItemsPerOrder: number;
}

export interface StaffPerformance {
  rows: StaffPerfRow[];
  ops: ServiceKpis;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function getStaffPerformance(
  restaurantId: string,
  from: Date,
  to: Date,
  graceMinutes = 5,
): Promise<StaffPerformance> {
  return tenantDb(restaurantId, async (tx) => {
    const [employees, entries, shifts, leaves] = await Promise.all([
      tx.employee.findMany({ where: { status: "active" }, select: { id: true, fullName: true } }),
      tx.timeEntry.findMany({
        where: { clockIn: { gte: from, lte: to } },
        select: { employeeId: true, clockIn: true, clockOut: true, breakMinutes: true },
      }),
      tx.shift.findMany({
        where: { startsAt: { gte: from, lte: to }, employeeId: { not: null } },
        select: { employeeId: true, startsAt: true },
      }),
      tx.leaveRequest.findMany({
        where: { status: "approved", startDate: { lte: to }, endDate: { gte: from } },
        select: { employeeId: true, startDate: true, endDate: true },
      }),
    ]);

    // Earliest scheduled shift per employee+day (for lateness).
    const shiftStart = new Map<string, Date>();
    for (const s of shifts) {
      if (!s.employeeId) continue;
      const key = `${s.employeeId}:${dayKey(s.startsAt)}`;
      if (!shiftStart.has(key)) shiftStart.set(key, s.startsAt);
    }

    const acc = new Map<string, { days: Set<string>; hours: number; lateCount: number; lateMinutes: number; firstIn: Map<string, Date> }>();
    const get = (id: string) => {
      if (!acc.has(id)) acc.set(id, { days: new Set(), hours: 0, lateCount: 0, lateMinutes: 0, firstIn: new Map() });
      return acc.get(id)!;
    };

    for (const e of entries) {
      const a = get(e.employeeId);
      const dk = dayKey(e.clockIn);
      a.days.add(dk);
      if (e.clockOut) {
        const mins = (e.clockOut.getTime() - e.clockIn.getTime()) / 60000 - (e.breakMinutes ?? 0);
        a.hours += Math.max(0, mins) / 60;
      }
      const fk = `${e.employeeId}:${dk}`;
      if (!a.firstIn.has(fk) || e.clockIn < a.firstIn.get(fk)!) a.firstIn.set(fk, e.clockIn);
    }

    // Lateness: compare each employee's first clock-in to their scheduled start.
    for (const [id, a] of acc) {
      for (const [fk, clockIn] of a.firstIn) {
        const start = shiftStart.get(fk);
        if (!start) continue;
        const minutesLate = Math.round((clockIn.getTime() - start.getTime()) / 60000);
        if (minutesLate > graceMinutes) {
          a.lateCount += 1;
          a.lateMinutes += minutesLate;
        }
      }
      void id;
    }

    // Approved leave days within the window, per employee.
    const leaveDays = new Map<string, number>();
    for (const l of leaves) {
      const s = l.startDate > from ? l.startDate : from;
      const e = l.endDate < to ? l.endDate : to;
      const days = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
      leaveDays.set(l.employeeId, (leaveDays.get(l.employeeId) ?? 0) + days);
    }

    const rows: StaffPerfRow[] = employees
      .map((emp) => {
        const a = acc.get(emp.id);
        return {
          employeeId: emp.id,
          name: emp.fullName,
          daysWorked: a ? a.days.size : 0,
          hours: a ? Math.round(a.hours * 10) / 10 : 0,
          lateCount: a?.lateCount ?? 0,
          lateMinutes: a?.lateMinutes ?? 0,
          leaveDays: leaveDays.get(emp.id) ?? 0,
        };
      })
      .sort((x, y) => y.daysWorked - x.daysWorked || x.name.localeCompare(y.name));

    // Service KPIs from orders.
    let ops: ServiceKpis = { ordersServed: 0, avgHandlingMin: 0, paidOrders: 0, avgOrderValue: 0, avgItemsPerOrder: 0 };
    try {
      const served = await tx.order.findMany({
        where: { servedAt: { gte: from, lte: to } },
        select: { createdAt: true, servedAt: true },
      });
      const handlingMins = served
        .filter((o) => o.servedAt)
        .map((o) => (o.servedAt!.getTime() - o.createdAt.getTime()) / 60000)
        .filter((m) => m >= 0 && m < 24 * 60); // ignore stale/garbage
      const avgHandlingMin = handlingMins.length
        ? Math.round(handlingMins.reduce((s, m) => s + m, 0) / handlingMins.length)
        : 0;

      const paid = await tx.order.findMany({
        where: { paymentStatus: "paid", createdAt: { gte: from, lte: to } },
        select: { total: true, _count: { select: { items: true } } },
      });
      const avgOrderValue = paid.length ? Math.round(paid.reduce((s, o) => s + o.total, 0) / paid.length) : 0;
      const avgItemsPerOrder = paid.length
        ? Math.round((paid.reduce((s, o) => s + o._count.items, 0) / paid.length) * 10) / 10
        : 0;

      ops = { ordersServed: served.length, avgHandlingMin, paidOrders: paid.length, avgOrderValue, avgItemsPerOrder };
    } catch {
      /* servedAt may lag on a stale DB — leave ops zeroed */
    }

    return { rows, ops };
  });
}
