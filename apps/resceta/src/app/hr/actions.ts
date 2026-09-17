"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { parseWorkStart, type PayType } from "@/lib/pharmacy/hr";
import { punch, requestLeave, reviewLeave, saveEmployee } from "@/server/pharmacy/hr";
import { manilaDateTime } from "@/lib/money";

export type HrState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

function denied(e: unknown, what: string): HrState {
  return {
    status: "error",
    message:
      e instanceof Error && e.message === "FORBIDDEN"
        ? `This account cannot ${what}.`
        : "Your session has expired. Sign in again.",
  };
}

function text(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

function whole(formData: FormData, key: string, fallback: number): number {
  const n = Number(String(formData.get(key) ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

const PAY_TYPES: PayType[] = ["hourly", "daily", "monthly"];

export async function saveEmployeeAction(_prev: HrState, formData: FormData): Promise<HrState> {
  let staff;
  try {
    // `manageStaff` — a pay rate is not something a pharmacist or a cashier
    // should be able to read, let alone set.
    staff = await requireStaff("manageStaff");
  } catch (e) {
    return denied(e, "manage employees");
  }

  const fullName = text(formData, "fullName");
  if (!fullName) return { status: "error", message: "An employee needs a name." };

  const payType = String(formData.get("payType") ?? "monthly") as PayType;
  if (!PAY_TYPES.includes(payType)) {
    return { status: "error", message: "Pick a pay type." };
  }

  const rateRaw = String(formData.get("payRate") ?? "").trim();
  const rate = Number(rateRaw);
  if (rateRaw === "" || !Number.isFinite(rate) || rate < 0) {
    // Blank would coerce to zero and put somebody on the register at no pay.
    return { status: "error", message: "Enter a pay rate, even if it is zero." };
  }

  const hireRaw = text(formData, "hireDate");

  const res = await saveEmployee({
    pharmacyId: staff.pharmacyId,
    employeeId: text(formData, "employeeId"),
    values: {
      fullName,
      position: text(formData, "position"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      payType,
      payRateCentavos: Math.round(rate * 100),
      workStartMinute: parseWorkStart(String(formData.get("workStart") ?? "09:00")),
      hoursPerDay: whole(formData, "hoursPerDay", 8),
      graceMinutes: whole(formData, "graceMinutes", 0),
      hireDate: hireRaw ? new Date(`${hireRaw}T00:00:00+08:00`) : null,
      staffId: text(formData, "staffId"),
      // Absent from the FormData entirely when the box is unticked.
      isActive: formData.get("isActive") !== null,
      notes: text(formData, "notes"),
    },
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/hr/employees");
  revalidatePath("/hr/clock");
  return { status: "done", message: `${fullName} saved.` };
}

/**
 * Clocking in or out.
 *
 * `sell` is the gate, because the person clocking in is whoever is starting
 * their shift. THE DIRECTION IS NOT IN THE FORM — the server derives it from
 * the last punch, so a double-tap cannot produce two clock-ins in a row.
 */
export async function punchAction(_prev: HrState, formData: FormData): Promise<HrState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return denied(e, "clock in");
  }

  const employeeId = text(formData, "employeeId");
  if (!employeeId) return { status: "error", message: "Pick who is clocking." };

  const res = await punch({
    pharmacyId: staff.pharmacyId,
    employeeId,
    note: text(formData, "note"),
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/hr/clock");
  revalidatePath("/hr/timesheets");
  return {
    status: "done",
    message: `${res.kind === "clock_in" ? "Clocked in" : "Clocked out"} at ${manilaDateTime(res.at)}.`,
  };
}

export async function fileLeave(_prev: HrState, formData: FormData): Promise<HrState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return denied(e, "file leave");
  }

  const employeeId = text(formData, "employeeId");
  const start = text(formData, "startDate");
  const end = text(formData, "endDate");
  if (!employeeId || !start || !end) {
    return { status: "error", message: "Pick who, and the dates." };
  }

  const res = await requestLeave({
    pharmacyId: staff.pharmacyId,
    employeeId,
    leaveType: String(formData.get("leaveType") ?? "vacation"),
    startDate: new Date(`${start}T00:00:00+08:00`),
    endDate: new Date(`${end}T00:00:00+08:00`),
    reason: text(formData, "reason"),
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/hr/leave");
  return { status: "done", message: "Request filed. It needs approving." };
}

export async function decideLeave(_prev: HrState, formData: FormData): Promise<HrState> {
  let staff;
  try {
    // Approving somebody's leave is a management act, not a counter one.
    staff = await requireStaff("manageStaff");
  } catch (e) {
    return denied(e, "approve leave");
  }

  const requestId = text(formData, "requestId");
  const decision = String(formData.get("decision") ?? "");
  if (!requestId || (decision !== "approved" && decision !== "rejected")) {
    return { status: "error", message: "Approve or reject it." };
  }

  const res = await reviewLeave({
    pharmacyId: staff.pharmacyId,
    requestId,
    decision,
    note: text(formData, "reviewNote"),
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/hr/leave");
  return { status: "done", message: `Leave ${decision}.` };
}
