import { tenantDb } from "@/server/tenancy/scoped-db";

export function listEmployees(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.employee.findMany({ orderBy: [{ status: "asc" }, { fullName: "asc" }] }),
  );
}

export function getEmployee(restaurantId: string, id: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.employee.findFirst({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        availability: { orderBy: { dayOfWeek: "asc" } },
        leaveBalances: { include: { leaveType: true } },
      },
    }),
  );
}

export function listShifts(restaurantId: string, from: Date, to: Date) {
  return tenantDb(restaurantId, (tx) =>
    tx.shift.findMany({
      where: { startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: "asc" },
      include: { employee: { select: { fullName: true } } },
    }),
  );
}

export function listOpenSwaps(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.shiftSwapRequest.findMany({
      where: { status: "pending" },
      include: {
        employee: { select: { fullName: true } },
        shift: { select: { startsAt: true, endsAt: true, role: true } },
      },
    }),
  );
}

export function listLeaveTypes(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.leaveType.findMany({ orderBy: { name: "asc" } }),
  );
}

export function listLeaveRequests(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.leaveRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        employee: { select: { fullName: true } },
        leaveType: { select: { name: true } },
      },
    }),
  );
}

export function listTimeEntries(
  restaurantId: string,
  from: Date,
  to: Date,
  employeeId?: string,
) {
  return tenantDb(restaurantId, (tx) =>
    tx.timeEntry.findMany({
      where: {
        clockIn: { gte: from, lte: to },
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: { clockIn: "desc" },
      include: { employee: { select: { fullName: true } } },
    }),
  );
}

/** Approved time entries in a period, for payroll prep. */
export function payrollEntries(restaurantId: string, from: Date, to: Date) {
  return tenantDb(restaurantId, (tx) =>
    tx.timeEntry.findMany({
      where: { clockIn: { gte: from, lte: to }, approved: true, clockOut: { not: null } },
      include: { employee: true },
    }),
  );
}
