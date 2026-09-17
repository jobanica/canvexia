import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import {
  buildPayroll,
  buildTimesheets,
  type EmployeeForPayroll,
  type PayType,
  type Punch,
  type Timesheet,
} from "@/lib/pharmacy/hr";
import type { DateRange } from "@/lib/pharmacy/range";

/**
 * HR reads and writes.
 *
 * PAY RATES ARE NOT ON THE STAFF SCREEN. `pharmacy_staff` is a login; this is
 * the employment record, and the two are joined only where an employee has an
 * account to clock in with. Every read below that returns a rate is called from
 * a screen gated on `manageStaff`.
 */

export interface EmployeeRow extends EmployeeForPayroll {
  position: string | null;
  email: string | null;
  phone: string | null;
  hoursPerDay: number;
  hireDate: Date | null;
  notes: string | null;
  staffId: string | null;
  staffName: string | null;
  /** Their most recent punch, so the list can say who is in right now. */
  lastPunch: { kind: string; at: Date } | null;
}

export async function listEmployees(pharmacyId: string): Promise<EmployeeRow[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyEmployee.findMany({
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        position: true,
        email: true,
        phone: true,
        payType: true,
        payRateCentavos: true,
        workStartMinute: true,
        hoursPerDay: true,
        graceMinutes: true,
        hireDate: true,
        isActive: true,
        notes: true,
        staffId: true,
        staff: { select: { displayName: true, email: true } },
        attendance: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { kind: true, createdAt: true },
        },
      },
    }),
  );

  return rows.map((e) => ({
    id: e.id,
    fullName: e.fullName,
    position: e.position,
    email: e.email,
    phone: e.phone,
    payType: e.payType as PayType,
    // BigInt in the database (a peso rate can exceed a 32-bit centavo count);
    // Number here, because a payroll rate is nowhere near 2^53 and BigInt does
    // not survive the boundary into a client component.
    payRateCentavos: Number(e.payRateCentavos),
    workStartMinute: e.workStartMinute,
    hoursPerDay: e.hoursPerDay,
    graceMinutes: e.graceMinutes,
    hireDate: e.hireDate,
    isActive: e.isActive,
    notes: e.notes,
    staffId: e.staffId,
    staffName: e.staff?.displayName ?? e.staff?.email ?? null,
    lastPunch: e.attendance[0]
      ? { kind: e.attendance[0].kind, at: e.attendance[0].createdAt }
      : null,
  }));
}

export async function saveEmployee(input: {
  pharmacyId: string;
  employeeId: string | null;
  values: {
    fullName: string;
    position: string | null;
    email: string | null;
    phone: string | null;
    payType: PayType;
    payRateCentavos: number;
    workStartMinute: number;
    hoursPerDay: number;
    graceMinutes: number;
    hireDate: Date | null;
    staffId: string | null;
    isActive: boolean;
    notes: string | null;
  };
  actorStaffId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { pharmacyId, values } = input;
  try {
    return await systemDb(async (tx) => {
      if (values.staffId) {
        const staff = await tx.pharmacyStaff.findFirst({
          where: { id: values.staffId, pharmacyId },
          select: { id: true },
        });
        if (!staff) return { ok: false as const, error: "That login was not found." };
      }

      const data = {
        ...values,
        payRateCentavos: BigInt(values.payRateCentavos),
      };

      if (input.employeeId) {
        // The pharmacy is in the WHERE clause, so an id from another pharmacy
        // updates zero rows rather than being checked and then acted on.
        const res = await tx.pharmacyEmployee.updateMany({
          where: { id: input.employeeId, pharmacyId },
          data,
        });
        if (res.count === 0) return { ok: false as const, error: "That employee was not found." };
        await audit(tx, input.actorStaffId, "pharmacy.employee_updated", input.employeeId, {
          fullName: values.fullName,
          payType: values.payType,
        });
        return { ok: true as const, id: input.employeeId };
      }

      const created = await tx.pharmacyEmployee.create({
        data: { pharmacyId, ...data },
        select: { id: true },
      });
      await audit(tx, input.actorStaffId, "pharmacy.employee_created", created.id, {
        fullName: values.fullName,
        payType: values.payType,
      });
      return { ok: true as const, id: created.id };
    });
  } catch {
    return { ok: false, error: "Couldn't save that employee. Try again." };
  }
}

/**
 * Clock in or out.
 *
 * THE KIND IS DERIVED FROM THE LAST PUNCH, never chosen by the browser. A form
 * that offers both buttons produces two clock-ins in a row the first time
 * somebody double-taps, and the timesheet then shows a day with no end.
 */
export async function punch(input: {
  pharmacyId: string;
  employeeId: string;
  note: string | null;
  actorStaffId: string;
}): Promise<{ ok: true; kind: "clock_in" | "clock_out"; at: Date } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const employee = await tx.pharmacyEmployee.findFirst({
        where: { id: input.employeeId, pharmacyId: input.pharmacyId },
        select: { id: true, isActive: true, fullName: true },
      });
      if (!employee) return { ok: false as const, error: "That employee was not found." };
      if (!employee.isActive) {
        return { ok: false as const, error: `${employee.fullName} is not an active employee.` };
      }

      const last = await tx.pharmacyAttendance.findFirst({
        where: { employeeId: employee.id },
        orderBy: { createdAt: "desc" },
        select: { kind: true, createdAt: true },
      });

      // In if they are out, out if they are in. The only two states there are.
      const kind: "clock_in" | "clock_out" =
        last?.kind === "clock_in" ? "clock_out" : "clock_in";

      const row = await tx.pharmacyAttendance.create({
        data: {
          pharmacyId: input.pharmacyId,
          employeeId: employee.id,
          kind,
          note: input.note,
        },
        select: { createdAt: true },
      });

      return { ok: true as const, kind, at: row.createdAt };
    });
  } catch {
    return { ok: false, error: "Couldn't record that. Try again." };
  }
}

export async function timesheets(pharmacyId: string, range: DateRange): Promise<Timesheet[]> {
  const [employees, punches] = await Promise.all([
    listEmployees(pharmacyId),
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacyAttendance.findMany({
        where: { createdAt: { gte: range.start, lt: range.end } },
        orderBy: { createdAt: "asc" },
        select: { employeeId: true, kind: true, createdAt: true },
      }),
    ),
  ]);
  return buildTimesheets(employees, punches as Punch[]);
}

export async function payroll(pharmacyId: string, range: DateRange) {
  return buildPayroll(await timesheets(pharmacyId, range));
}

export async function listLeave(pharmacyId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyLeaveRequest.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 200,
      select: {
        id: true,
        leaveType: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        employee: { select: { id: true, fullName: true, position: true } },
      },
    }),
  );
}

export async function requestLeave(input: {
  pharmacyId: string;
  employeeId: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  actorStaffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.endDate.getTime() < input.startDate.getTime()) {
    return { ok: false, error: "The leave ends before it starts." };
  }
  try {
    return await systemDb(async (tx) => {
      const employee = await tx.pharmacyEmployee.findFirst({
        where: { id: input.employeeId, pharmacyId: input.pharmacyId },
        select: { id: true },
      });
      if (!employee) return { ok: false as const, error: "That employee was not found." };

      await tx.pharmacyLeaveRequest.create({
        data: {
          pharmacyId: input.pharmacyId,
          employeeId: employee.id,
          leaveType: input.leaveType as never,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason,
        },
      });
      return { ok: true as const };
    });
  } catch {
    return { ok: false, error: "Couldn't file that request. Try again." };
  }
}

export async function reviewLeave(input: {
  pharmacyId: string;
  requestId: string;
  decision: "approved" | "rejected";
  note: string | null;
  actorStaffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const count = await systemDb(async (tx) => {
      const res = await tx.pharmacyLeaveRequest.updateMany({
        // Only a pending request. Re-deciding a settled one silently changes a
        // record somebody has already been told about.
        where: { id: input.requestId, pharmacyId: input.pharmacyId, status: "pending" },
        data: {
          status: input.decision,
          reviewedByStaffId: input.actorStaffId,
          reviewedAt: new Date(),
          reviewNote: input.note,
        },
      });
      if (res.count > 0) {
        await audit(tx, input.actorStaffId, `pharmacy.leave_${input.decision}`, input.requestId, {
          note: input.note,
        });
      }
      return res.count;
    });
    if (count === 0) return { ok: false, error: "That request has already been decided." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't record that decision. Try again." };
  }
}

/** Logins that could be linked to an employee record. */
export async function staffOptions(pharmacyId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyStaff.findMany({
      orderBy: { email: "asc" },
      select: { id: true, displayName: true, email: true, role: true },
    }),
  );
}

async function audit(
  tx: Prisma.TransactionClient,
  actorStaffId: string,
  action: string,
  entityId: string,
  after: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "merchant",
      actorStaffId,
      action,
      entityType: "pharmacy_employee",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
