"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { PrescriptionInput } from "@/lib/pharmacy/prescription-input";
import { createPrescription } from "@/server/pharmacy/prescriptions";

export type RxState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

/**
 * Recording a prescription.
 *
 * `sell` is the gate. The person holding the paper Rx is at the counter, and a
 * permission only a manager holds means the record is written later from
 * memory, or not at all. The statutory restriction — only a pharmacist may
 * COMPLETE a cart containing an Rx item — is a separate gate in the sale path,
 * and it stays there.
 */
export async function savePrescription(_prev: RxState, formData: FormData): Promise<RxState> {
  let staff;
  try {
    staff = await requireStaff("sell");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "This account cannot record prescriptions."
          : "Your session has expired. Sign in again.",
    };
  }

  const parsed = PrescriptionInput.safeParse({
    customerId: formData.get("customerId") ?? "",
    rxNumber: formData.get("rxNumber") ?? "",
    patientName: formData.get("patientName") ?? "",
    patientDob: formData.get("patientDob") ?? "",
    doctorName: formData.get("doctorName") ?? "",
    doctorPrcNo: formData.get("doctorPrcNo") ?? "",
    dateIssued: formData.get("dateIssued") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the fields." };
  }

  const res = await createPrescription({
    pharmacyId: staff.pharmacyId,
    values: parsed.data,
    actorStaffId: staff.staffId,
  });
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath("/prescriptions");
  return { status: "done", message: `Prescription for ${parsed.data.patientName} recorded.` };
}
