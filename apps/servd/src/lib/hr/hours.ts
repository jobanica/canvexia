/**
 * Pure attendance + payroll-prep math (testable, no statutory PH rates).
 * Overtime is hours beyond 8 in a single time entry; the OT multiplier and any
 * SSS/PhilHealth/Pag-IBIG/BIR/13th-month rules are intentionally NOT applied
 * here — full compliant payroll is a separate later phase.
 */

export interface WorkedHours {
  hours: number; // total worked (after break)
  regular: number; // up to 8
  overtime: number; // beyond 8
}

export function computeHours(
  clockIn: Date,
  clockOut: Date | null,
  breakMinutes = 0,
): WorkedHours {
  if (!clockOut) return { hours: 0, regular: 0, overtime: 0 };
  const minutes = (clockOut.getTime() - clockIn.getTime()) / 60000 - breakMinutes;
  const hours = Math.max(0, minutes / 60);
  const regular = Math.min(hours, 8);
  const overtime = Math.max(0, hours - 8);
  return {
    hours: round2(hours),
    regular: round2(regular),
    overtime: round2(overtime),
  };
}

/**
 * Gross pay for a period (centavos). Hourly = rate × hours; monthly = flat rate
 * for the period. Statutory deductions are NOT applied.
 */
export function grossPay(
  payType: "hourly" | "monthly",
  payRate: number,
  totalHours: number,
): number {
  if (payType === "monthly") return payRate;
  return Math.round(payRate * totalHours);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Fixed-salary deduction math (centavos) ------------------------------
// Standard PH-ish assumptions; deductions only apply when shifts are scheduled.
export const PAYROLL_WORKDAYS_PER_MONTH = 26;
export const PAYROLL_HOURS_PER_DAY = 8;

/** A monthly salary's equivalent daily rate (centavos). */
export function dailyRate(monthlyRate: number): number {
  return Math.round(monthlyRate / PAYROLL_WORKDAYS_PER_MONTH);
}

/** Deduction for an absent scheduled day (centavos). */
export function absenceDeduction(monthlyRate: number, absentDays: number): number {
  return dailyRate(monthlyRate) * Math.max(0, absentDays);
}

/** Deduction for accumulated late minutes (centavos), pro-rated from daily rate. */
export function lateDeduction(monthlyRate: number, lateMinutes: number): number {
  if (lateMinutes <= 0) return 0;
  const perMinute = dailyRate(monthlyRate) / (PAYROLL_HOURS_PER_DAY * 60);
  return Math.round(perMinute * lateMinutes);
}
