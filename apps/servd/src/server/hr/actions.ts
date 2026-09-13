"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { requireHrAction } from "@/server/hr/guard";
import { requireStaff } from "@/server/tenancy/current-user";
import { uploadEmployeeDoc } from "@/server/storage/employee-docs";
import { pesosToCentavos } from "@/lib/money";

export type FormState = { ok?: boolean; error?: string } | null;

// ------------------------------------------------------------- employees
const employeeSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(120),
  title: z.string().trim().max(80).optional().or(z.literal("")),
  employmentType: z.enum(["full_time", "part_time", "contract"]),
  payType: z.enum(["hourly", "daily", "monthly"]),
  payPesos: z.coerce.number().min(0).max(10_000_000).default(0),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  emergency: z.string().trim().max(160).optional().or(z.literal("")),
  clockPin: z.string().trim().max(12).optional().or(z.literal("")),
});

export async function createEmployee(_p: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireHrAction();
  try {
    const d = employeeSchema.parse({
      fullName: formData.get("fullName"),
      title: formData.get("title") ?? "",
      employmentType: formData.get("employmentType"),
      payType: formData.get("payType"),
      payPesos: formData.get("payPesos") ?? 0,
      phone: formData.get("phone") ?? "",
      emergency: formData.get("emergency") ?? "",
      clockPin: formData.get("clockPin") ?? "",
    });
    const phone = d.phone ? d.phone.replace(/[^\d+]/g, "").trim() : null;
    await tenantDb(restaurantId, (tx) =>
      tx.employee.create({
        data: {
          restaurantId,
          fullName: d.fullName,
          title: d.title || null,
          employmentType: d.employmentType,
          payType: d.payType,
          payRate: pesosToCentavos(d.payPesos),
          clockPin: d.clockPin || null,
          // Phone normalized to digits so phone+PIN login matches.
          contactJson: { phone, emergency: d.emergency || null },
        },
      }),
    );
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    return { error: e instanceof Error ? e.message : "Couldn't add employee" };
  }
  revalidatePath("/admin/hr");
  return { ok: true };
}

/**
 * Delete an employee. Cascades remove their attendance/time entries, leave, and
 * documents; their shifts become unassigned; a linked staff login is unlinked
 * (not deleted). To keep records instead, set status to "inactive".
 */
export async function deleteEmployee(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Scope by restaurantId so an admin can only delete their own staff.
  await tenantDb(restaurantId, (tx) =>
    tx.employee.deleteMany({ where: { id, restaurantId } }),
  );
  revalidatePath("/admin/hr");
  redirect("/admin/hr");
}

export async function updateEmployee(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const id = String(formData.get("id"));
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") : null;
  await tenantDb(restaurantId, async (tx) => {
    const current = await tx.employee.findFirstOrThrow({
      where: { id },
      select: { contactJson: true },
    });
    const contact = (current.contactJson as { phone?: string | null; emergency?: string | null } | null) ?? {};
    await tx.employee.update({
      where: { id },
      data: {
        fullName: String(formData.get("fullName") ?? "").trim() || undefined,
        title: (String(formData.get("title") ?? "").trim() || null) as string | null,
        payRate: pesosToCentavos(Number(formData.get("payPesos") ?? 0)),
        payType: (formData.get("payType") as "hourly" | "daily" | "monthly") ?? undefined,
        status: (formData.get("status") as "active" | "inactive") ?? undefined,
        clockPin: (String(formData.get("clockPin") ?? "").trim() || null) as string | null,
        contactJson: { ...contact, phone },
      },
    });
  });
  revalidatePath(`/admin/hr/${id}`);
}

export async function uploadDocument(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const employeeId = String(formData.get("employeeId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  const { path, url } = await uploadEmployeeDoc(restaurantId, employeeId, file);
  await tenantDb(restaurantId, (tx) =>
    tx.employeeDocument.create({
      data: { restaurantId, employeeId, name: file.name, url: url || path },
    }),
  );
  revalidatePath(`/admin/hr/${employeeId}`);
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const id = String(formData.get("id"));
  const employeeId = String(formData.get("employeeId"));
  await tenantDb(restaurantId, (tx) => tx.employeeDocument.delete({ where: { id } }));
  revalidatePath(`/admin/hr/${employeeId}`);
}

// ---------------------------------------------------------- availability
export async function setAvailability(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const employeeId = String(formData.get("employeeId"));
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startMinute = toMinutes(String(formData.get("start") ?? ""));
  const endMinute = toMinutes(String(formData.get("end") ?? ""));
  if (startMinute === null || endMinute === null || endMinute <= startMinute) return;
  await tenantDb(restaurantId, (tx) =>
    tx.availability.create({ data: { restaurantId, employeeId, dayOfWeek, startMinute, endMinute } }),
  );
  revalidatePath(`/admin/hr/${employeeId}`);
}

export async function deleteAvailability(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const id = String(formData.get("id"));
  const employeeId = String(formData.get("employeeId"));
  await tenantDb(restaurantId, (tx) => tx.availability.delete({ where: { id } }));
  revalidatePath(`/admin/hr/${employeeId}`);
}

// ---------------------------------------------------------------- shifts
/** Parse an "HH:MM" time string → {h, m}, or null if invalid. */
function parseHM(v: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/**
 * Create shifts by DAY OF WEEK + time (not calendar dates) — staff work a weekly
 * pattern with day-offs. The owner picks the working days, a start/end time and
 * how many weeks to roll it out; we generate the concrete dated shifts for those
 * weekdays so the rest of HR (payroll, attendance, swaps) keeps working. Days
 * not picked = day off. Overnight shifts (end ≤ start) roll to the next day.
 */
export async function createShift(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const employeeId = String(formData.get("employeeId") ?? "") || null;
  const role = String(formData.get("role") ?? "") || null;
  const days = [...new Set(formData.getAll("days").map((d) => Number(d)))].filter((d) => d >= 0 && d <= 6);
  const start = parseHM(String(formData.get("start") ?? ""));
  const end = parseHM(String(formData.get("end") ?? ""));
  const weeks = Math.min(8, Math.max(1, Math.round(Number(formData.get("weeks")) || 2)));
  if (!days.length || !start || !end) return;

  // Build occurrences over the next `weeks` weeks. Times are stored in UTC
  // components (same convention the datetime-local form used), so they display
  // back as entered.
  const now = new Date();
  const day0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows: { restaurantId: string; employeeId: string | null; startsAt: Date; endsAt: Date; role: string | null }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(day0);
    d.setUTCDate(day0.getUTCDate() + i);
    if (!days.includes(d.getUTCDay())) continue; // not a working day
    const startsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), start.h, start.m));
    let endsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), end.h, end.m));
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000); // overnight
    rows.push({ restaurantId, employeeId, startsAt, endsAt, role });
  }
  if (!rows.length) return;

  await tenantDb(restaurantId, async (tx) => {
    // Skip occurrences that already exist for this person at the same start, so
    // re-adding a pattern doesn't pile up duplicates.
    const existing = await tx.shift.findMany({
      where: { employeeId, startsAt: { gte: day0 } },
      select: { startsAt: true },
    });
    const seen = new Set(existing.map((e) => e.startsAt.getTime()));
    const fresh = rows.filter((r) => !seen.has(r.startsAt.getTime()));
    if (fresh.length) await tx.shift.createMany({ data: fresh });
  });
  revalidatePath("/admin/hr/schedule");
}

export async function deleteShift(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  await tenantDb(restaurantId, (tx) => tx.shift.delete({ where: { id: String(formData.get("id")) } }));
  revalidatePath("/admin/hr/schedule");
}

export async function resolveSwap(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const id = String(formData.get("id"));
  const approve = formData.get("approve") === "true";
  await tenantDb(restaurantId, async (tx) => {
    const swap = await tx.shiftSwapRequest.findFirstOrThrow({ where: { id } });
    await tx.shiftSwapRequest.update({
      where: { id },
      data: { status: approve ? "approved" : "rejected" },
    });
    // Approving frees the shift (becomes open for reassignment).
    if (approve) {
      await tx.shift.update({ where: { id: swap.shiftId }, data: { employeeId: null } });
    }
  });
  revalidatePath("/admin/hr/schedule");
}

// ----------------------------------------------------------------- leave
export async function createLeaveType(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await tenantDb(restaurantId, (tx) =>
    tx.leaveType.create({ data: { restaurantId, name, isPaid: formData.get("isPaid") === "on" } }),
  );
  revalidatePath("/admin/hr/leave");
}

export async function requestLeave(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const employeeId = String(formData.get("employeeId"));
  const leaveTypeId = String(formData.get("leaveTypeId"));
  const startDate = new Date(String(formData.get("startDate")));
  const endDate = new Date(String(formData.get("endDate")));
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) return;
  await tenantDb(restaurantId, (tx) =>
    tx.leaveRequest.create({ data: { restaurantId, employeeId, leaveTypeId, startDate, endDate } }),
  );
  revalidatePath("/admin/hr/leave");
}

export async function resolveLeave(formData: FormData): Promise<void> {
  const staff = await requireHrAction();
  const id = String(formData.get("id"));
  const approve = formData.get("approve") === "true";
  await tenantDb(staff.restaurantId, async (tx) => {
    const req = await tx.leaveRequest.findFirstOrThrow({ where: { id } });
    await tx.leaveRequest.update({
      where: { id },
      data: { status: approve ? "approved" : "rejected", approverId: staff.staffUserId },
    });
    // Deduct from balance on approval (days inclusive).
    if (approve) {
      const days = Math.max(1, Math.round((req.endDate.getTime() - req.startDate.getTime()) / 86400000) + 1);
      await tx.leaveBalance.updateMany({
        where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId },
        data: { balance: { decrement: days } },
      });
    }
  });
  revalidatePath("/admin/hr/leave");
}

export async function setLeaveBalance(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const employeeId = String(formData.get("employeeId"));
  const leaveTypeId = String(formData.get("leaveTypeId"));
  const balance = Number(formData.get("balance") ?? 0);
  await tenantDb(restaurantId, (tx) =>
    tx.leaveBalance.upsert({
      where: { employeeId_leaveTypeId: { employeeId, leaveTypeId } },
      create: { restaurantId, employeeId, leaveTypeId, balance },
      update: { balance },
    }),
  );
  revalidatePath(`/admin/hr/${employeeId}`);
}

// ------------------------------------------------------------ timesheets
export async function approveTimeEntry(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  await tenantDb(restaurantId, (tx) =>
    tx.timeEntry.update({ where: { id: String(formData.get("id")) }, data: { approved: true } }),
  );
  revalidatePath("/admin/hr/timesheets");
}

// ---------------------------------------------------------------- clock
async function toggle(tx: Prisma.TransactionClient, restaurantId: string, employeeId: string, source: string) {
  const open = await tx.timeEntry.findFirst({
    where: { employeeId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  if (open) {
    await tx.timeEntry.update({ where: { id: open.id }, data: { clockOut: new Date() } });
    return "out" as const;
  }
  await tx.timeEntry.create({ data: { restaurantId, employeeId, clockIn: new Date(), source } });
  return "in" as const;
}

/** Public clock toggle via the employee's personal QR token. */
export async function clockByToken(
  token: string,
): Promise<{ ok: boolean; status?: "in" | "out"; name?: string; error?: string }> {
  return systemDb(async (tx) => {
    const employee = await tx.employee.findFirst({ where: { clockToken: token } });
    if (!employee) return { ok: false, error: "Unknown code." };
    const status = await toggle(tx, employee.restaurantId, employee.id, "qr");
    return { ok: true, status, name: employee.fullName };
  });
}

/** PIN clock toggle at a staff-operated station. */
export async function clockByPin(
  _p: FormState,
  formData: FormData,
): Promise<{ ok?: boolean; status?: "in" | "out"; name?: string; error?: string } | null> {
  let staff;
  try {
    staff = await requireStaff(["kitchen", "cashier", "manager", "admin"]);
  } catch {
    return { error: "Not allowed." };
  }
  const pin = String(formData.get("pin") ?? "").trim();
  if (!pin) return { error: "Enter a PIN." };
  return tenantDb(staff.restaurantId, async (tx) => {
    const employee = await tx.employee.findFirst({ where: { clockPin: pin, status: "active" } });
    if (!employee) return { error: "No employee with that PIN." };
    const status = await toggle(tx, staff.restaurantId, employee.id, "pin");
    return { ok: true, status, name: employee.fullName };
  });
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ---------------------------------------------------------------------------
// Manual payroll deductions (cash advance, loan, uniform, breakage…)
// ---------------------------------------------------------------------------

/**
 * Record a one-off deduction against an employee. It applies to whichever
 * payroll period `appliedOn` falls in, so it's taken once and never repeats.
 */
export async function addPayrollDeduction(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 80);
  const pesos = Number(formData.get("amountPesos"));
  const dateRaw = String(formData.get("appliedOn") ?? "").trim();
  if (!employeeId || !label || !Number.isFinite(pesos) || pesos <= 0) return;

  const appliedOn = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? new Date(`${dateRaw}T12:00:00`)
    : new Date();
  if (Number.isNaN(appliedOn.getTime())) return;

  await tenantDb(restaurantId, (tx) =>
    tx.payrollDeduction.create({
      data: { restaurantId, employeeId, label, amount: pesosToCentavos(pesos), appliedOn },
      select: { id: true },
    }),
  );
  revalidatePath("/admin/hr/payroll");
}

export async function deletePayrollDeduction(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrAction();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await tenantDb(restaurantId, (tx) => tx.payrollDeduction.deleteMany({ where: { id } }));
  revalidatePath("/admin/hr/payroll");
}
