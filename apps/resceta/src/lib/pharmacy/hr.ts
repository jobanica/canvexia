import { manilaDayIso } from "./range";

/**
 * TIMESHEETS, LATENESS AND GROSS PAY.
 *
 * Derived from the append-only punch log — there is no hours table. A punch is
 * never edited, so the only way to change a timesheet is to punch again, and
 * both punches stay visible. That is the property that makes a payroll dispute
 * answerable.
 *
 * Pure and dependency-free on purpose: this decides what somebody is paid, and
 * it should be testable without a database, a session or a clock.
 */

export type PayType = "hourly" | "daily" | "monthly";

export const PAY_TYPE_LABEL: Record<PayType, string> = {
  hourly: "Hourly",
  daily: "Daily",
  monthly: "Monthly",
};

export const LEAVE_LABEL: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  emergency: "Emergency",
  unpaid: "Unpaid",
  maternity: "Maternity",
  paternity: "Paternity",
};

export interface Punch {
  employeeId: string;
  kind: "clock_in" | "clock_out";
  createdAt: Date;
}

export interface EmployeeForPayroll {
  id: string;
  fullName: string;
  payType: PayType;
  payRateCentavos: number;
  workStartMinute: number;
  graceMinutes: number;
  isActive: boolean;
}

export interface DayEntry {
  /** Manila calendar day, `YYYY-MM-DD`. */
  day: string;
  clockIn: Date | null;
  clockOut: Date | null;
  /** Worked hours, two decimals. Zero when the pair is incomplete. */
  hours: number;
  late: boolean;
  lateByMinutes: number;
  /** A day clocked in and never clocked out. Shown, never silently zeroed. */
  unpaired: boolean;
}

export interface Timesheet {
  employee: EmployeeForPayroll;
  days: DayEntry[];
  daysPresent: number;
  totalHours: number;
  lateCount: number;
  lateMinutes: number;
  unpairedDays: number;
}

/** Minutes past Manila midnight for an instant. */
export function manilaMinuteOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + 8 * 60 * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** "09:30" → 570. Anything unparsable is 9am rather than midnight. */
export function parseWorkStart(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return 540;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return 540;
  return h * 60 + min;
}

/** 570 → "09:30". */
export function formatWorkStart(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Build a timesheet per employee.
 *
 * FIRST IN, LAST OUT per Manila day. Somebody who punches out for lunch and
 * back in again has worked the span, not two disjoint pieces — and treating the
 * middle pair as a second day would double-count them as present twice.
 *
 * AN UNPAIRED DAY IS NOT ZERO HOURS, it is a day somebody forgot to clock out.
 * Paying it as zero is a silent deduction; it is surfaced as `unpaired` so the
 * person running payroll fixes it rather than the system guessing.
 */
export function buildTimesheets(
  employees: EmployeeForPayroll[],
  punches: Punch[],
): Timesheet[] {
  const byEmployee = new Map<string, Map<string, { firstIn: Date | null; lastOut: Date | null }>>();

  for (const p of [...punches].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const day = manilaDayIso(p.createdAt);
    let days = byEmployee.get(p.employeeId);
    if (!days) byEmployee.set(p.employeeId, (days = new Map()));
    const slot = days.get(day) ?? { firstIn: null, lastOut: null };
    if (p.kind === "clock_in") {
      if (!slot.firstIn) slot.firstIn = p.createdAt;
    } else {
      slot.lastOut = p.createdAt;
    }
    days.set(day, slot);
  }

  return employees.map((employee) => {
    const slots = byEmployee.get(employee.id);
    const startMinute = employee.workStartMinute + employee.graceMinutes;
    const days: DayEntry[] = [];

    for (const [day, slot] of [...(slots?.entries() ?? [])].sort()) {
      const paired = slot.firstIn !== null && slot.lastOut !== null;
      // Clamped at zero: a clock-out before the clock-in is a bad pair, and
      // negative hours would quietly reduce somebody's pay.
      const hours = paired
        ? Math.max(0, (slot.lastOut!.getTime() - slot.firstIn!.getTime()) / 3_600_000)
        : 0;

      let late = false;
      let lateByMinutes = 0;
      if (slot.firstIn) {
        const inMinute = manilaMinuteOfDay(slot.firstIn);
        if (inMinute > startMinute) {
          late = true;
          lateByMinutes = inMinute - startMinute;
        }
      }

      days.push({
        day,
        clockIn: slot.firstIn,
        clockOut: slot.lastOut,
        hours: Math.round(hours * 100) / 100,
        late,
        lateByMinutes,
        unpaired: slot.firstIn !== null && slot.lastOut === null,
      });
    }

    return {
      employee,
      days,
      daysPresent: days.filter((d) => d.clockIn).length,
      totalHours: Math.round(days.reduce((t, d) => t + d.hours, 0) * 100) / 100,
      lateCount: days.filter((d) => d.late).length,
      lateMinutes: days.reduce((t, d) => t + d.lateByMinutes, 0),
      unpairedDays: days.filter((d) => d.unpaired).length,
    };
  });
}

export interface PayslipRow {
  employee: EmployeeForPayroll;
  daysPresent: number;
  totalHours: number;
  grossCentavos: number;
  unpairedDays: number;
  lateMinutes: number;
}

/**
 * Gross pay for the period.
 *
 * A MONTHLY RATE IS THE PERIOD'S RATE, not a per-day figure. This register is
 * built for one pay period; paying a monthly employee their monthly rate is
 * correct for a monthly period and wrong for a weekly one, so the screen says
 * which period it covers rather than pretending to prorate. Prorating would
 * require a working-days calendar and holiday rules, and a half-built version
 * of those would be more wrong, more quietly.
 */
export function grossFor(
  payType: PayType,
  rateCentavos: number,
  daysPresent: number,
  totalHours: number,
): number {
  switch (payType) {
    case "hourly":
      return Math.round(rateCentavos * totalHours);
    case "daily":
      return rateCentavos * daysPresent;
    case "monthly":
      return rateCentavos;
  }
}

export function buildPayroll(timesheets: Timesheet[]): PayslipRow[] {
  return timesheets
    .filter((t) => t.employee.isActive)
    .map((t) => ({
      employee: t.employee,
      daysPresent: t.daysPresent,
      totalHours: t.totalHours,
      grossCentavos: grossFor(
        t.employee.payType,
        t.employee.payRateCentavos,
        t.daysPresent,
        t.totalHours,
      ),
      unpairedDays: t.unpairedDays,
      lateMinutes: t.lateMinutes,
    }));
}

/** Whole days of leave, inclusive of both ends. */
export function leaveDays(start: Date, end: Date): number {
  const a = Date.parse(`${manilaDayIso(start)}T00:00:00+08:00`);
  const b = Date.parse(`${manilaDayIso(end)}T00:00:00+08:00`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}
