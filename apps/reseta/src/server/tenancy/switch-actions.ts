"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PHARMACY_COOKIE } from "@/lib/pharmacy/active-pharmacy";
import { getCurrentStaff } from "@/server/tenancy/current-user";

/**
 * Remember which pharmacy this person is looking at.
 *
 * Membership is verified HERE as well as on read. Writing an unverified id
 * would be harmless today — `pickPharmacy` ignores a cookie that names a
 * pharmacy you are not staff at — but a cookie the server wrote looks
 * trustworthy to the next person who reads this code, and that is how the
 * check gets skipped later.
 */
export async function switchPharmacy(pharmacyId: string): Promise<void> {
  const staff = await getCurrentStaff();
  if (!staff) return;
  if (!staff.memberships.some((m) => m.pharmacyId === pharmacyId)) return;

  (await cookies()).set(PHARMACY_COOKIE, pharmacyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath("/", "layout");
}
