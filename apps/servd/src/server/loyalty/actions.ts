"use server";

import { revalidatePath } from "next/cache";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";

export type LoyaltyFormState = { ok?: boolean; error?: string } | null;

export async function updateLoyaltyConfig(
  _prev: LoyaltyFormState,
  formData: FormData,
): Promise<LoyaltyFormState> {
  const { restaurantId } = await requireManagerAction();
  const enabled = formData.get("enabled") === "on";
  const pesosPerPoint = Math.max(1, Math.round(Number(formData.get("pesosPerPoint")) || 20));
  const pointValuePesos = Math.max(0.01, Number(formData.get("pointValue")) || 1);
  const pointValue = Math.round(pointValuePesos * 100); // centavos

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { loyaltyEnabled: enabled, loyaltyPesosPerPoint: pesosPerPoint, loyaltyPointValue: pointValue },
        select: { id: true },
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save.";
    return {
      error: /loyalty|column/i.test(msg)
        ? "Loyalty needs a quick database update. Run the migration, then try again."
        : msg,
    };
  }
  revalidatePath("/admin/loyalty");
  return { ok: true };
}
