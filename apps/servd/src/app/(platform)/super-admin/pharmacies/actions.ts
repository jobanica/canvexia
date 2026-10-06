"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { activatePharmacyAsHq } from "@/server/pharmacies/hq";

export type ActivateState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

/** Owner-only: switching on a regulated merchant is not an ops task. */
export async function activatePharmacyAction(_prev: ActivateState, fd: FormData): Promise<ActivateState> {
  let email: string;
  try {
    const user = await requireOwnerAction();
    email = user.email;
  } catch {
    return { status: "error", message: "Only the platform owner can activate a pharmacy." };
  }
  const r = await activatePharmacyAsHq({ pharmacyId: String(fd.get("pharmacyId") ?? ""), actorEmail: email });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/super-admin/pharmacies");
  return { status: "done", message: `${r.name} is active. It can dispense now.` };
}
