import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import {
  computeHours,
  grossPay,
  absenceDeduction,
  lateDeduction,
} from "@/lib/hr/hours";
import { getPayrollConfig, computeStatutory } from "@/server/hr/payroll-config";

export interface PayrollRow {
  employeeId: string;
  name: string;
  payType: "hourly" | "daily" | "monthly";
  hours: number;
  ot: number;
  base: number; // monthly salary, daily gross, or hourly gross
  absentDays: number;
  absenceDeduction: number;
  lateMinutes: number;
  lateDeduction: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  bir: number;
  thirteenthAccrual: number;
  otherDeductions: number; // manual one-off deductions in this period
  otherItems: { label: string; amount: number }[];
  net: number;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

interface Raw {
  employees: { id: string; fullName: string; payType: "hourly" | "daily" | "monthly"; payRate: number }[];
  entries: { employeeId: string; clockIn: Date; clockOut: Date | null; breakMinutes: number }[];
  shifts: { employeeId: string | null; startsAt: Date }[];
  deductions: { employeeId: string; label: string; amount: number }[];
}

async function load(restaurantId: string, from: Date, to: Date): Promise<Raw> {
  return tenantDb(restaurantId, async (tx) => {
    const [employees, entries, shifts] = await Promise.all([
      tx.employee.findMany({
        where: { status: "active" },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, payType: true, payRate: true },
      }),
      tx.timeEntry.findMany({
        where: { clockIn: { gte: from, lte: to } },
        orderBy: { clockIn: "asc" },
        select: { employeeId: true, clockIn: true, clockOut: true, breakMinutes: true },
      }),
      tx.shift.findMany({
        where: { startsAt: { gte: from, lte: to }, employeeId: { not: null } },
        orderBy: { startsAt: "asc" },
        select: { employeeId: true, startsAt: true },
      }),
    ]);
    // Manual one-off deductions dated inside the period. Best-effort so an
    // un-migrated table just means no extra deductions.
    let deductions: { employeeId: string; label: string; amount: number }[] = [];
    try {
      deductions = await tx.payrollDeduction.findMany({
        where: { appliedOn: { gte: from, lte: to } },
        orderBy: { appliedOn: "asc" },
        select: { employeeId: true, label: true, amount: true },
      });
    } catch {
      /* payroll_deductions not migrated yet */
    }
    return { employees, entries, shifts, deductions };
  });
}

/** Per-employee derived attendance for a period. */
function deriveByEmployee(raw: Raw, graceMinutes: number) {
  const hours = new Map<string, { hours: number; ot: number }>();
  const presentDays = new Map<string, Set<string>>();
  const firstIn = new Map<string, Date>(); // key emp:day
  for (const e of raw.entries) {
    const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
    const cur = hours.get(e.employeeId) ?? { hours: 0, ot: 0 };
    hours.set(e.employeeId, { hours: cur.hours + h.hours, ot: cur.ot + h.overtime });
    const dk = dayKey(e.clockIn);
    (presentDays.get(e.employeeId) ?? presentDays.set(e.employeeId, new Set()).get(e.employeeId)!).add(dk);
    const k = `${e.employeeId}:${dk}`;
    if (!firstIn.has(k)) firstIn.set(k, e.clockIn);
  }

  const scheduledDays = new Map<string, Set<string>>();
  const shiftStart = new Map<string, Date>(); // key emp:day
  for (const s of raw.shifts) {
    if (!s.employeeId) continue;
    const dk = dayKey(s.startsAt);
    (scheduledDays.get(s.employeeId) ?? scheduledDays.set(s.employeeId, new Set()).get(s.employeeId)!).add(dk);
    const k = `${s.employeeId}:${dk}`;
    if (!shiftStart.has(k)) shiftStart.set(k, s.startsAt);
  }

  return { hours, presentDays, firstIn, scheduledDays, shiftStart, graceMinutes };
}

export async function getPayroll(
  restaurantId: string,
  from: Date,
  to: Date,
  graceMinutes = 5,
): Promise<PayrollRow[]> {
  const raw = await load(restaurantId, from, to);
  const d = deriveByEmployee(raw, graceMinutes);
  const cfg = await getPayrollConfig(restaurantId);

  // Manual deductions grouped per employee.
  const manual = new Map<string, { label: string; amount: number }[]>();
  for (const d of raw.deductions) {
    const list = manual.get(d.employeeId) ?? [];
    list.push({ label: d.label, amount: d.amount });
    manual.set(d.employeeId, list);
  }

  return raw.employees.map((e) => {
    const otherItems = manual.get(e.id) ?? [];
    const otherDeductions = otherItems.reduce((s, x) => s + x.amount, 0);
    const agg = d.hours.get(e.id) ?? { hours: 0, ot: 0 };
    const scheduled = d.scheduledDays.get(e.id) ?? new Set<string>();
    const present = d.presentDays.get(e.id) ?? new Set<string>();

    let absentDays = 0;
    let lateMinutes = 0;
    for (const day of scheduled) {
      if (!present.has(day)) {
        absentDays++;
        continue;
      }
      const start = d.shiftStart.get(`${e.id}:${day}`);
      const inAt = d.firstIn.get(`${e.id}:${day}`);
      if (start && inAt) {
        const late = Math.round((inAt.getTime() - start.getTime()) / 60000);
        if (late > graceMinutes) lateMinutes += late;
      }
    }

    if (e.payType === "monthly") {
      const base = e.payRate;
      const absDed = absenceDeduction(base, absentDays);
      const lateDed = lateDeduction(base, lateMinutes);
      const stat = computeStatutory(base, cfg);
      return {
        employeeId: e.id,
        name: e.fullName,
        payType: "monthly" as const,
        hours: agg.hours,
        ot: agg.ot,
        base,
        absentDays,
        absenceDeduction: absDed,
        lateMinutes,
        lateDeduction: lateDed,
        sss: stat.sss,
        philhealth: stat.philhealth,
        pagibig: stat.pagibig,
        bir: stat.bir,
        thirteenthAccrual: stat.thirteenthAccrual,
        otherDeductions,
        otherItems,
        net: Math.max(0, base - absDed - lateDed - stat.total - otherDeductions),
      };
    }
    if (e.payType === "daily") {
      // Daily: paid the day rate for each day actually present (no absence
      // deduction — you simply don't pay for days not worked).
      const gross = e.payRate * present.size;
      const stat = computeStatutory(gross, cfg);
      return {
        employeeId: e.id,
        name: e.fullName,
        payType: "daily" as const,
        hours: agg.hours,
        ot: agg.ot,
        base: gross,
        absentDays,
        absenceDeduction: 0,
        lateMinutes,
        lateDeduction: 0,
        sss: stat.sss,
        philhealth: stat.philhealth,
        pagibig: stat.pagibig,
        bir: stat.bir,
        thirteenthAccrual: stat.thirteenthAccrual,
        otherDeductions,
        otherItems,
        net: Math.max(0, gross - stat.total - otherDeductions),
      };
    }

    // Hourly: paid for hours worked; statutory deductions on the gross.
    const gross = grossPay("hourly", e.payRate, agg.hours);
    const stat = computeStatutory(gross, cfg);
    return {
      employeeId: e.id,
      name: e.fullName,
      payType: "hourly" as const,
      hours: agg.hours,
      ot: agg.ot,
      base: gross,
      absentDays: 0,
      absenceDeduction: 0,
      lateMinutes,
      lateDeduction: 0,
      sss: stat.sss,
      philhealth: stat.philhealth,
      pagibig: stat.pagibig,
      bir: stat.bir,
      thirteenthAccrual: stat.thirteenthAccrual,
      otherDeductions,
      otherItems,
      net: Math.max(0, gross - stat.total - otherDeductions),
    };
  });
}

export interface PayslipDay {
  date: string;
  scheduled: boolean;
  shiftStart: string | null;
  clockIn: string | null;
  hours: number;
  lateMinutes: number;
  absent: boolean;
}

export interface Payslip {
  row: PayrollRow;
  days: PayslipDay[];
}

/** A single employee's payslip detail for the period. */
export async function getPayslip(
  restaurantId: string,
  employeeId: string,
  from: Date,
  to: Date,
  graceMinutes = 5,
): Promise<Payslip | null> {
  const all = await getPayroll(restaurantId, from, to, graceMinutes);
  const row = all.find((r) => r.employeeId === employeeId);
  if (!row) return null;

  const raw = await load(restaurantId, from, to);
  const d = deriveByEmployee(raw, graceMinutes);
  const scheduled = d.scheduledDays.get(employeeId) ?? new Set<string>();
  const present = d.presentDays.get(employeeId) ?? new Set<string>();
  const hoursByDay = new Map<string, number>();
  for (const e of raw.entries) {
    if (e.employeeId !== employeeId) continue;
    const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
    const dk = dayKey(e.clockIn);
    hoursByDay.set(dk, (hoursByDay.get(dk) ?? 0) + h.hours);
  }

  const allDays = new Set<string>([...scheduled, ...present]);
  const days: PayslipDay[] = [...allDays]
    .sort()
    .map((day) => {
      const start = d.shiftStart.get(`${employeeId}:${day}`) ?? null;
      const inAt = d.firstIn.get(`${employeeId}:${day}`) ?? null;
      const isScheduled = scheduled.has(day);
      const isPresent = present.has(day);
      let late = 0;
      if (start && inAt) {
        const l = Math.round((inAt.getTime() - start.getTime()) / 60000);
        if (l > graceMinutes) late = l;
      }
      return {
        date: day,
        scheduled: isScheduled,
        shiftStart: start?.toISOString() ?? null,
        clockIn: inAt?.toISOString() ?? null,
        hours: Math.round((hoursByDay.get(day) ?? 0) * 100) / 100,
        lateMinutes: late,
        absent: isScheduled && !isPresent,
      };
    });

  return { row, days };
}
