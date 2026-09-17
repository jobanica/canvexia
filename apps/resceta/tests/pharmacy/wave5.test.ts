import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildTimesheets,
  buildPayroll,
  grossFor,
  leaveDays,
  manilaMinuteOfDay,
  parseWorkStart,
  formatWorkStart,
  type EmployeeForPayroll,
  type Punch,
} from "@/lib/pharmacy/hr";

/**
 * WAVE 5 — employees, attendance, timesheets, payroll and leave.
 *
 * This decides what somebody is paid, so the arithmetic is pure and tested
 * without a database, a session or a clock.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

function employee(over: Partial<EmployeeForPayroll> = {}): EmployeeForPayroll {
  return {
    id: "e1",
    fullName: "Ana Reyes",
    payType: "hourly",
    payRateCentavos: 10000, // ₱100/hour
    workStartMinute: 540, // 09:00
    graceMinutes: 0,
    isActive: true,
    ...over,
  };
}

const at = (iso: string) => new Date(iso);

describe("Manila time of day", () => {
  it("reads the clock the shop reads", () => {
    // 01:00 UTC is 09:00 Manila.
    expect(manilaMinuteOfDay(at("2026-09-17T01:00:00Z"))).toBe(540);
    // 15:30 UTC is 23:30 Manila, still the same day.
    expect(manilaMinuteOfDay(at("2026-09-17T15:30:00Z"))).toBe(23 * 60 + 30);
  });

  it("round-trips a work start time", () => {
    expect(parseWorkStart("09:30")).toBe(570);
    expect(formatWorkStart(570)).toBe("09:30");
    // Anything unparsable is 9am, not midnight — a default of 0 would make
    // everybody late by their entire shift.
    expect(parseWorkStart("nonsense")).toBe(540);
    expect(parseWorkStart("25:00")).toBe(540);
  });
});

describe("timesheets from the punch log", () => {
  it("pairs first-in with last-out across a lunch break", () => {
    // Punching out for lunch and back in is one span worked, not two days.
    const punches: Punch[] = [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T01:00:00Z") }, // 09:00
      { employeeId: "e1", kind: "clock_out", createdAt: at("2026-09-17T04:00:00Z") }, // 12:00
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T05:00:00Z") }, // 13:00
      { employeeId: "e1", kind: "clock_out", createdAt: at("2026-09-17T10:00:00Z") }, // 18:00
    ];
    const [sheet] = buildTimesheets([employee()], punches);
    expect(sheet!.days).toHaveLength(1);
    expect(sheet!.days[0]!.hours).toBe(9);
    expect(sheet!.daysPresent).toBe(1);
  });

  it("flags a day clocked in and never out, rather than paying it as zero", () => {
    // Zeroing it is a silent deduction; a human has to fix it.
    const [sheet] = buildTimesheets([employee()], [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T01:00:00Z") },
    ]);
    expect(sheet!.days[0]!.unpaired).toBe(true);
    expect(sheet!.days[0]!.hours).toBe(0);
    expect(sheet!.unpairedDays).toBe(1);
    // Still counted as present: they were here.
    expect(sheet!.daysPresent).toBe(1);
  });

  it("never returns negative hours from a bad pair", () => {
    const [sheet] = buildTimesheets([employee()], [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T10:00:00Z") },
      { employeeId: "e1", kind: "clock_out", createdAt: at("2026-09-17T01:00:00Z") },
    ]);
    expect(sheet!.days[0]!.hours).toBe(0);
  });

  it("counts lateness against the grace-adjusted start", () => {
    // 09:20 Manila against a 09:00 start with 15 minutes' grace: 5 late.
    const [sheet] = buildTimesheets([employee({ graceMinutes: 15 })], [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T01:20:00Z") },
      { employeeId: "e1", kind: "clock_out", createdAt: at("2026-09-17T10:00:00Z") },
    ]);
    expect(sheet!.days[0]!.late).toBe(true);
    expect(sheet!.days[0]!.lateByMinutes).toBe(5);
  });

  it("is not late inside the grace period", () => {
    const [sheet] = buildTimesheets([employee({ graceMinutes: 15 })], [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T01:10:00Z") },
    ]);
    expect(sheet!.days[0]!.late).toBe(false);
    expect(sheet!.lateCount).toBe(0);
  });

  it("puts an early-morning punch in the Manila day, not the UTC one", () => {
    // 16:30Z on the 16th is 00:30 Manila on the 17th.
    const [sheet] = buildTimesheets([employee()], [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-16T16:30:00Z") },
    ]);
    expect(sheet!.days[0]!.day).toBe("2026-09-17");
  });

  it("gives an employee with no punches an empty sheet, not a crash", () => {
    const [sheet] = buildTimesheets([employee()], []);
    expect(sheet!.days).toHaveLength(0);
    expect(sheet!.totalHours).toBe(0);
  });
});

describe("gross pay", () => {
  it("pays hourly by the hours worked", () => {
    expect(grossFor("hourly", 10000, 5, 37.5)).toBe(375000);
  });

  it("pays daily by the days present", () => {
    expect(grossFor("daily", 50000, 5, 37.5)).toBe(250000);
  });

  it("pays monthly the period rate, without prorating", () => {
    // Prorating needs a working-days calendar and holiday rules; a half-built
    // version is more wrong, more quietly. The screen states the period.
    expect(grossFor("monthly", 1500000, 20, 160)).toBe(1500000);
  });

  it("leaves an inactive employee off the register", () => {
    const sheets = buildTimesheets([employee({ isActive: false })], []);
    expect(buildPayroll(sheets)).toHaveLength(0);
  });

  it("carries the unpaired-day warning onto the payslip row", () => {
    const sheets = buildTimesheets([employee()], [
      { employeeId: "e1", kind: "clock_in", createdAt: at("2026-09-17T01:00:00Z") },
    ]);
    expect(buildPayroll(sheets)[0]!.unpairedDays).toBe(1);
  });
});

describe("leave", () => {
  it("counts both ends", () => {
    expect(leaveDays(at("2026-09-01T00:00:00+08:00"), at("2026-09-01T00:00:00+08:00"))).toBe(1);
    expect(leaveDays(at("2026-09-01T00:00:00+08:00"), at("2026-09-05T00:00:00+08:00"))).toBe(5);
  });
});

describe("what the screens and the server enforce", () => {
  const server = src("server/pharmacy/hr.ts");
  const actions = src("app/hr/actions.ts");

  it("derives the punch direction from the last punch, not the form", () => {
    // A form offering both buttons produces two clock-ins in a row the first
    // time somebody double-taps, and the timesheet shows a day with no end.
    expect(server).toContain('last?.kind === "clock_in" ? "clock_out" : "clock_in"');
    expect(actions).not.toMatch(/formData\.get\("kind"\)/);
  });

  it("refuses to clock an employee who is off the payroll", () => {
    expect(server).toContain("if (!employee.isActive)");
  });

  it("keeps the employment record when a login is deleted", () => {
    // Offboarding an account must not delete the payroll history.
    const schema = readFileSync(
      join(process.cwd(), "..", "..", "packages", "db", "prisma", "schema.prisma"),
      "utf8",
    );
    expect(schema).toContain(
      "staff         PharmacyStaff?         @relation(fields: [staffId], references: [id], onDelete: SetNull)",
    );
  });

  it("gates pay rates on manageStaff, at the page as well as the action", () => {
    // Rendering a rate to the wrong person is the harm here, not writing it.
    expect(src("app/hr/employees/page.tsx")).toContain('requireStaff("manageStaff")');
    expect(src("app/hr/payroll/page.tsx")).toContain('requireStaff("manageStaff")');
    expect(src("app/hr/timesheets/page.tsx")).toContain('requireStaff("manageStaff")');
  });

  it("does not gate the clock screen, and shows no rates on it", () => {
    const clock = src("app/hr/clock/page.tsx");
    expect(clock).not.toContain('requireStaff("manageStaff")');
    expect(clock).not.toContain("payRateCentavos");
  });

  it("lets anyone file leave and only a manager decide it", () => {
    expect(actions).toContain('requireStaff("sell")');
    expect(actions).toContain('requireStaff("manageStaff")');
  });

  it("will not re-decide a settled leave request", () => {
    // Re-deciding silently changes a record somebody has been told about.
    expect(server).toContain('status: "pending"');
  });

  it("refuses a blank pay rate rather than putting somebody on at zero", () => {
    expect(actions).toContain("Enter a pay rate, even if it is zero.");
  });

  it("says plainly that statutory deductions are not computed", () => {
    // A register that omits them and calls the result "net" is worse than one
    // that does not try.
    const page = src("app/hr/payroll/page.tsx");
    expect(page).toContain("Gross pay only.");
    expect(page).toContain("PhilHealth");
  });
});
